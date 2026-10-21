import Database from "better-sqlite3";
import { sql, type SQLWrapper } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";

import { tables } from "@self-learn/schema";

import { copyOk, databasePath } from "./env";

/**
 * `db.execute` on the Postgres driver returned `{ rows }`; better-sqlite3
 * exposes `run`/`get`/`all` instead. The catalog's raw-SQL sites — about
 * nineteen of them, each already spelling its statement out — keep their
 * shape through this one-method shim rather than being rewritten twice
 * (once for the driver, once for the SQL itself, which this port does
 * change). `all()` on a non-SELECT executes it and yields `[]`, so the shim
 * serves DML and `returning` alike.
 */
type ExecuteCompat = <T = Record<string, unknown>>(query: SQLWrapper | string) => Promise<{ rows: T[] }>;

export type CatalogDatabase = BetterSQLite3Database<typeof tables> & { execute: ExecuteCompat };

export interface Connection {
  /**
   * The underlying better-sqlite3 handle. The Postgres pool this replaces
   * lent out connections; a SQLite file has one handle per connect, and
   * callers that need driver features a query builder does not expose
   * (registered functions, `pragma`, `backup`) reach it here.
   */
  sqlite: Database.Database;
  db: CatalogDatabase;
  close: () => Promise<void>;
  /**
   * Kept from the Postgres `Connection`, where an idle pooled client could
   * die under nobody's query. A SQLite handle has no idle sockets and no
   * such error, so this always reports `null`; the field stays so callers
   * written against the old shape keep type-checking until each is touched.
   */
  lastPoolError: () => Error | null;
  /**
   * The shape the Postgres pool's `query`/`on` gave, kept for callers that
   * still name it. `query` is `db.execute` — one handle behind either name —
   * and `on` subscribes nothing because there are no idle sockets to error.
   */
  pool: {
    query: <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: T[]; rowCount: number }>;
    on: (event: string, listener: (error: Error) => void) => void;
  };
}

export interface ConnectOptions {
  /**
   * Overrides DATABASE_URL/CATALOG_DB. A filesystem path, a `sqlite:` or
   * `file:` URL, or `:memory:` — resolved by `databasePath` in env.ts. Used
   * by the tests, which point at a scratch file.
   */
  url?: string;
  /**
   * A Postgres pool option that no longer applies (there is no `options`
   * parameter to forward and no search_path to set); kept so a stale caller
   * fails to compile here rather than misbehave silently.
   */
  options?: string;
  /**
   * Milliseconds better-sqlite3 waits on a busy file before raising
   * `SQLITE_BUSY`. The Postgres `connectionTimeoutMillis` it replaces timed
   * out a connect that found nothing listening; the file equivalent is a
   * database another process is writing, and waiting is the right answer
   * for everything short of a deliberate probe.
   */
  connectionTimeoutMillis?: number;
  /**
   * Kept for signature compatibility. A SQLite connection is one handle, so
   * there is nothing to pool: pass `max: 2` for "this test wants a second
   * writer" as before, but open it with another connect.
   */
  max?: number;
  /**
   * Let this connection write to a database marked `copy`. Defaults to
   * `CATALOG_COPY_OK=1`; `catalog migrate` passes it explicitly, since a
   * copy's schema still has to follow the primary's. What it does on the
   * file is the copy guard's work: the `*_copy_guard` triggers installed by
   * the migration check `catalog_copy_ok()` on each write, and this flag is
   * what that function returns for this connection.
   */
  copyOk?: boolean;
}

/**
 * The connection flags the guard functions read, one bundle per connect.
 *
 * Postgres carried them as GUCs (`self_learn.copy_ok`, `self_learn.revision_id`)
 * set per session and per transaction; a SQLite connection has no settings of
 * its own, so each connect registers scalar functions reading a JS closure
 * instead. The triggers calling them (`catalog_copy_ok()` in the copy guards,
 * `catalog_revision_id()` in the write-seam guards) are per-row now — SQLite
 * triggers are — rather than per-statement, so a statement that touches no
 * rows reaches no guard. That is the one deliberate narrowing: a write that
 * changes nothing is not refused on a copy where Postgres refused it.
 */
interface ConnectionFlags {
  copyOk: boolean;
  revisionId: string | null;
  /** Transaction nesting depth, for `inTransaction`'s savepoints. */
  txDepth: number;
  /** The resolved file this connection opened, for `databaseIdentity`. */
  file: string;
  /** The better-sqlite3 handle, for the busy-timeout juggling in `inTransaction`. */
  sqlite: Database.Database;
  /** How long a statement or `begin immediate` keeps retrying before giving up (ms). */
  busyMs: number;
}

const FLAGS = new WeakMap<CatalogDatabase, ConnectionFlags>();

/**
 * The writer queue one file's connections share. A SQLite database has one
 * writer at a time: Postgres serialised its clients on the row locks a
 * transaction took, and SQLite serialises on the file. better-sqlite3's own
 * busy wait cannot do that for us — it spins inside the driver with the
 * event loop held, so a contender's wait would stop the holder's `commit`
 * from ever being scheduled (that is what the race tests' timeouts were).
 * The wait lives here in promises instead: a top-level write transaction
 * takes the next slot in call order — which is also what makes two racing
 * transactions land first-come-first-served, the order the pool's client
 * queue gave them on Postgres — while a top-level statement first runs
 * without a slot, since WAL lets a reader keep its snapshot beside a held
 * writer (serialising reads behind a transaction would have them read what
 * the transaction left behind, the audit's stale-pending check's bug). A
 * statement that meets SQLITE_BUSY — a writer contending with a held
 * transaction, or a writer outside this queue: a raw handle, another
 * process — takes the next slot and retries there, so a holder's queued
 * `commit` can always get through.
 */
const FILE_QUEUES = new Map<string | Database.Database, { tail: Promise<void> }>();

/** The queue `flags`' file writes through; `:memory:` databases are one per handle. */
function fileQueue(flags: ConnectionFlags): { tail: Promise<void> } {
  const key = flags.file === ":memory:" ? flags.sqlite : flags.file;
  const queue = FILE_QUEUES.get(key);
  if (queue !== undefined) return queue;
  const made = { tail: Promise.resolve() };
  FILE_QUEUES.set(key, made);
  return made;
}

/** Whether `error` is a lock wait that ran out, at any level of its cause chain. */
function isBusy(error: unknown): boolean {
  for (let at: unknown = error, depth = 0; typeof at === "object" && at !== null && depth < 6; depth += 1) {
    const code = (at as { code?: unknown }).code;
    if (typeof code === "string" && code.startsWith("SQLITE_BUSY")) return true;
    at = (at as { cause?: unknown }).cause;
  }
  return false;
}

/** What a lock wait that outlived `busyMs` raises — the code `sqlstate` maps to 55P03. */
function busyError(): Error {
  return Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });
}

/**
 * Take the file's next writer slot, waiting in call order; gives up as
 * `SQLITE_BUSY` once `deadline` passes, so a slot whose holder is waiting on
 * the waiter (the same shape as a Postgres deadlock) fails rather than
 * hanging. Returns the hand-off to the next slot.
 */
async function takeSlot(queue: { tail: Promise<void> }, deadline: number): Promise<() => void> {
  const prev = queue.tail;
  let release!: () => void;
  queue.tail = new Promise<void>((resolve) => (release = resolve));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waited = await Promise.race([
    prev.then(() => "turn" as const),
    new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), Math.max(0, deadline - Date.now()));
    }),
  ]);
  clearTimeout(timer);
  if (waited === "timeout") {
    release();
    throw busyError();
  }
  return release;
}

/**
 * `fn` against the file, inside this connection's transaction when one is
 * open. Outside a transaction it first runs with no slot: a WAL reader
 * never meets SQLITE_BUSY, and queueing it would serialise it behind a held
 * write — exactly the event-loop starvation this exists to avoid, applied
 * to statements too. `busy_timeout` drops to 0 for the attempt so a
 * contended statement answers BUSY at once rather than spinning inside the
 * driver; on BUSY it takes the next writer slot and retries there until the
 * deadline — busy-waiting, but in promises, where the holder's work can
 * still run.
 */
function queuedStatement<T>(flags: ConnectionFlags, fn: () => T | Promise<T>): Promise<T> {
  if (flags.txDepth > 0) {
    try {
      return Promise.resolve(fn());
    } catch (error) {
      return Promise.reject(error);
    }
  }
  const deadline = Date.now() + flags.busyMs;
  const attempt = async (): Promise<T> => {
    if (!flags.sqlite.open) return await fn();
    flags.sqlite.pragma("busy_timeout = 0");
    try {
      return await fn();
    } finally {
      if (flags.sqlite.open) flags.sqlite.pragma(`busy_timeout = ${flags.busyMs}`);
    }
  };
  const queue = fileQueue(flags);
  const step = async (): Promise<T> => {
    const release = await takeSlot(queue, deadline);
    try {
      return await attempt();
    } catch (error) {
      if (isBusy(error) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        return step();
      }
      throw error;
    } finally {
      release();
    }
  };
  // `await` — a rejection must be observed here to be retried, and fn()'s
  // statement throws through a promise (drizzle's executors), not a raise.
  return attempt().catch((error: unknown) => {
    if (isBusy(error)) return step();
    throw error;
  });
}

/**
 * The methods whose call runs a statement: the query builders' executors,
 * the `db.execute`/`pool.query` shims, and the promise plumbing
 * (`then`/`catch`/`finally`) that `await builder` goes through. Everything
 * else on a drizzle object is fluent configuration and runs synchronously —
 * including `values`, which inserts a row only on a select's spelling, and
 * `run`/`all`/`get`, which stay synchronous the way the driver's callers
 * (armed-rule checks, test helpers) use them.
 */
const EXECUTORS = new Set<PropertyKey>(["execute", "then", "catch", "finally", "query"]);

/**
 * `await builder` calls `builder.then(resolve, reject)`, and a thenable's
 * `then` hands the rejection straight to the caller's `reject`: drizzle's
 * `QueryPromise.then` is `execute().then(onFulfilled, onRejected)`, whose
 * promise is already `resolved` from the queue's point of view — the busy
 * error went to the caller, so `queuedStatement` would never see it to
 * retry. The thenable methods therefore run the raw `then` with no
 * handlers inside the queue and only chain the caller's handlers onto the
 * queued result.
 */
const THENABLE = new Set<PropertyKey>(["then", "catch", "finally"]);

/**
 * Wrap `target` — the drizzle database — so every statement reaches the file
 * through `queuedStatement`. Fluent calls keep their synchronous shape and
 * the object they hand back is wrapped in turn, so a builder chain stays
 * queued all the way to its `execute`/`then`. Results are not wrapped: the
 * rows a statement resolved to are plain data.
 */
function wrapInQueue<T extends object>(target: T, flags: ConnectionFlags): T {
  const seen = new WeakMap<object, object>();
  const wrap = <U extends object>(object: U): U => {
    const hit = seen.get(object);
    if (hit !== undefined) return hit as U;
    const proxy = new Proxy(object, {
      get(owner, key) {
        const value = Reflect.get(owner, key, owner);
        if (typeof value === "function") {
          if (EXECUTORS.has(key)) {
            if (THENABLE.has(key)) {
              const run = () =>
                queuedStatement(flags, () =>
                  (Reflect.get(owner, "then", owner) as (...args: unknown[]) => Promise<unknown>).apply(owner, []),
                );
              if (key === "then") {
                return (onFulfilled?: unknown, onRejected?: unknown) =>
                  run().then(onFulfilled as never, onRejected as never);
              }
              if (key === "catch") return (onRejected?: unknown) => run().catch(onRejected as never);
              return (onFinally?: unknown) => run().finally(onFinally as () => void);
            }
            return (...args: unknown[]) => queuedStatement(flags, () => value.apply(owner, args));
          }
          return (...args: unknown[]) => {
            const out = value.apply(owner, args);
            return out !== null && typeof out === "object" ? wrap(out) : out;
          };
        }
        return value !== null && typeof value === "object" ? wrap(value) : value;
      },
    });
    seen.set(object, proxy);
    return proxy;
  };
  return wrap(target);
}

/**
 * Deferred completeness checks. Postgres armed `CONSTRAINT TRIGGER …
 * DEFERRABLE` rules at `catalog flip --strict`: a predicate checked at
 * COMMIT, not at the row's write, which is what lets a module be inserted
 * before its items. SQLite has no deferred triggers, so the armed rule is a
 * row in `catalog_armed_rule` (created lazily by the flip) and the check
 * runs here, one statement before `commit` — the same moment, evaluated by
 * the transaction that has to pass it. `rules.ts` registers each rule's
 * violator query under its name; this map is the name's body.
 */
const DEFERRED_RULES = new Map<string, SQLWrapper>();

/** What `catalog flip --strict` records in `catalog_armed_rule`. */
export const ARMED_RULES_TABLE = "catalog_armed_rule";

export function registerDeferredRule(name: string, violators: SQLWrapper): void {
  DEFERRED_RULES.set(name, violators);
}

/** The rules this database runs at commit time; none when the flip never armed one. */
function armedRules(db: CatalogDatabase): string[] {
  const exists = db.get<{ name: string }>(
    sql`select name from sqlite_master where type = 'table' and name = ${ARMED_RULES_TABLE}`,
  );
  if (exists === undefined) return [];
  return db.all<{ name: string }>(sql.raw(`select name from ${ARMED_RULES_TABLE}`)).map((row) => row.name);
}

/** One armed deferred rule caught rows its predicate refuses. */
export class DeferredRuleViolation extends Error {
  readonly rule: string;
  readonly violators: readonly Record<string, unknown>[];
  constructor(rule: string, violators: readonly Record<string, unknown>[]) {
    const shown = violators.slice(0, 5).map((row) => String(row["message"] ?? row["detail"] ?? row["id"])).join("; ");
    super(
      `23514: deferred rule "${rule}" refused the commit: ${violators.length} violator(s)` +
        (shown === "" ? "" : ` (${shown}${violators.length > 5 ? ", …" : ""})`),
    );
    this.name = "DeferredRuleViolation";
    this.rule = rule;
    this.violators = violators;
  }
}

/**
 * The resolved database file behind `db` — what `current_database()` and the
 * `oid` pair were on Postgres, one string now. `:memory:` answers as itself.
 */
export function databaseFile(db: CatalogDatabase): string {
  const flags = FLAGS.get(db);
  if (flags === undefined) throw new Error("databaseFile on a database not opened through connect()");
  return flags.file;
}

/**
 * What the write seam records before it touches a content table, as
 * `set_config('self_learn.revision_id', …)` recorded it on Postgres: the
 * revision this write is part of, which the armed `*_write_guard` triggers
 * demand be set. Per connection; `inTransaction` clears it when the
 * outermost transaction ends, the way a transaction-local setting vanished.
 */
export function setRevisionId(db: CatalogDatabase, revisionId: string | null): void {
  const flags = FLAGS.get(db);
  if (flags === undefined) throw new Error("setRevisionId on a database not opened through connect()");
  flags.revisionId = revisionId;
}

/**
 * `fn` inside one SQLite transaction: `begin immediate` at the edge,
 * `commit` on return, `rollback` on throw. Nested calls become savepoints.
 *
 * Why this exists instead of `db.transaction`: drizzle's better-sqlite3
 * driver runs transactions synchronously, and every callback in this
 * codebase is `async` — awaiting inside would commit before the body's
 * first await resolved. better-sqlite3 executes every statement on the one
 * handle synchronously, so an async body cannot be interrupted by another
 * statement mid-flight on this connection: between awaits, the transaction
 * simply stays open, which is the same isolation `FOR UPDATE` bought on
 * Postgres made redundant by `begin immediate` (the write lock is taken
 * up front, so two writers serialise at the transaction's edge rather than
 * at their first write).
 *
 * `begin immediate`, not deferred: every caller that reaches a transaction
 * means to write, and taking the lock at the start is what turns a later
 * `insert` into "wait your turn" instead of `SQLITE_BUSY` at commit.
 */
/** Whether this async context already runs inside a transaction. */
const INSIDE_TX = new AsyncLocalStorage<boolean>();

export async function inTransaction<T>(
  db: CatalogDatabase,
  fn: (tx: CatalogDatabase) => Promise<T>,
  options: { readOnly?: boolean } = {},
): Promise<T> {
  const flags = FLAGS.get(db);
  if (flags === undefined) {
    // A handle that did not come through connect() — a test's Proxy of one
    // (which is how a test watches `run` for the transaction boundary), or a
    // stub: the same SQL, none of the bookkeeping. `db.run` rather than
    // `db.execute`, so the boundary is visible where a test is watching.
    if (INSIDE_TX.getStore() === true) return fn(db);
    const boundary = (text: string): Promise<unknown> =>
      typeof (db as { run?: (q: SQLWrapper) => unknown }).run === "function"
        ? Promise.resolve((db as { run: (q: SQLWrapper) => unknown }).run(sql.raw(text)))
        : db.execute(sql.raw(text));
    await boundary(options.readOnly === true ? "begin" : "begin immediate");
    try {
      const out = await INSIDE_TX.run(true, () => fn(db));
      await boundary("commit");
      return out;
    } catch (error) {
      await boundary("rollback").catch(() => undefined);
      throw error;
    }
  }
  if (flags.txDepth === 0) {
    if (options.readOnly === true) {
      // A transaction that only reads: Postgres's `begin` took no lock and
      // its selects ran beside a writer's uncommitted work, and a deferred
      // begin is the same thing — one snapshot from the first read on, and
      // no place in the writer queue, which would serialise it behind a
      // write it could have read alongside.
      return await INSIDE_TX.run(true, () => runTransaction(db, flags, fn, true));
    }
    // Two top-level calls — on this handle or any other opened on the same
    // file — were two pool clients on Postgres, serialised by the row locks
    // their statements took. Here they take the file's writer queue: each
    // begins only once the one ahead committed, first-come-first-served.
    const release = await takeSlot(fileQueue(flags), Date.now() + flags.busyMs);
    try {
      return await INSIDE_TX.run(true, () => runTransaction(db, flags, fn));
    } finally {
      release();
    }
  }
  return INSIDE_TX.run(true, () => runTransaction(db, flags, fn, options.readOnly === true));
}

async function runTransaction<T>(
  db: CatalogDatabase,
  flags: ConnectionFlags,
  fn: (tx: CatalogDatabase) => Promise<T>,
  deferred = false,
): Promise<T> {
  const depth = flags.txDepth;
  const name = `catalog_sp_${depth}`;
  if (depth === 0) {
    if (deferred) {
      flags.sqlite.exec("begin");
    } else {
      // `begin immediate` under the native busy handler would park the whole
      // event loop inside better-sqlite3 — synchronous calls block the thread —
      // and the holder's own release could never be scheduled. Retry the begin
      // in async steps instead: no busy wait inside the driver, no frozen loop.
      const deadline = Date.now() + flags.busyMs;
      for (;;) {
        flags.sqlite.pragma("busy_timeout = 0");
        try {
          flags.sqlite.exec("begin immediate");
          break;
        } catch (error) {
          if ((error as { code?: unknown }).code !== "SQLITE_BUSY" || Date.now() >= deadline) throw error;
          await new Promise((resolve) => setTimeout(resolve, 25));
        } finally {
          flags.sqlite.pragma(`busy_timeout = ${flags.busyMs}`);
        }
      }
    }
  } else {
    flags.sqlite.exec(`savepoint ${name}`);
  }
  flags.txDepth = depth + 1;
  try {
    const out = await fn(db);
    // The deferred-trigger stand-in: armed completeness rules are evaluated
    // here, after every write and before commit — where a Postgres
    // `CONSTRAINT TRIGGER … INITIALLY DEFERRED` fired.
    if (depth === 0) {
      for (const rule of armedRules(db)) {
        const violators = DEFERRED_RULES.get(rule);
        if (violators === undefined) continue;
        const rows = db.all<Record<string, unknown>>(violators);
        if (rows.length > 0) throw new DeferredRuleViolation(rule, rows);
      }
    }
    // Raw exec, not db.run: a commit-time error must surface as the
    // SqliteError it was, not a DrizzleError that hides its message.
    if (depth === 0) {
      try {
        flags.sqlite.exec("commit");
      } catch (commitError) {
        // A deferred foreign key fails at commit as a nameless
        // "FOREIGN KEY constraint failed". foreign_key_check still runs on
        // the un-committed transaction, so name the violator Postgres's
        // constraint name would have.
        try {
          const bad = flags.sqlite
            .prepare("pragma foreign_key_check")
            .all() as { table: string; rowid: unknown; parent: string }[];
          if (bad.length > 0) {
            const first = bad[0]!;
            (commitError as Error).message +=
              ` (${bad.length} violation(s): ${first.table} rowid ${String(first.rowid)} -> ${first.parent})`;
          }
        } catch {
          // keep the bare error
        }
        throw commitError;
      }
    } else {
      flags.sqlite.exec(`release ${name}`);
    }
    if (depth === 0) flags.revisionId = null;
    return out;
  } catch (error) {
    // A rollback can itself fail ("no transaction is active" after SQLite
    // already aborted it); never let it mask the error that sent us here.
    try {
      if (depth === 0) {
        flags.sqlite.exec("rollback");
      } else {
        flags.sqlite.exec(`rollback to ${name}`);
        flags.sqlite.exec(`release ${name}`);
      }
    } catch {
      // keep the original error
    }
    if (depth === 0) flags.revisionId = null;
    throw error;
  } finally {
    flags.txDepth = depth;
  }
}

/**
 * One handle per connect. The CLI is short-lived, so the default is the
 * whole story; a long-lived caller wanting concurrency opens several
 * connects, and `begin immediate` serialises their writes at the file
 * rather than queueing them in a pool.
 */
export function connect(options: ConnectOptions = {}): Connection {
  const file = databasePath(options.url);
  if (file !== ":memory:") {
    try {
      mkdirSync(path.dirname(file), { recursive: true });
    } catch (error) {
      // mkdir says EEXIST when a component of the parent is a file; ENOENT's
      // sibling, the "nothing can ever live here" answer ENOTDIR gives open().
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw Object.assign(new Error(`a path component is not a directory: ${path.dirname(file)}`), { code: "ENOTDIR" });
      }
      throw error;
    }
  }
  const busyMs = options.connectionTimeoutMillis ?? Number(process.env.CATALOG_DB_TIMEOUT_MS ?? 5_000);
  const sqlite = new Database(file, {
    // Postgres locks waited for ever; a busy timeout is the whole queue here.
    // Tests that race writers set CATALOG_DB_TIMEOUT_MS high enough that a
    // contender's wait outlasts the holder's work.
    timeout: busyMs,
  });
  /**
   * Foreign keys are off by default in SQLite, unlike Postgres where they
   * always fire. Every cascade, restrict and set-null in packages/schema is
   * inert until this is on, and the pragma is per connection, so it lives
   * beside the handle's creation rather than in any migration.
   *
   * WAL for the same reason a local-first app wants it anywhere: readers do
   * not wait on a writer, and a writer does not fail a page mid-render.
   */
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const flags: ConnectionFlags = {
    copyOk: options.copyOk ?? copyOk(),
    revisionId: null,
    txDepth: 0,
    file,
    sqlite,
    busyMs,
  };

  /**
   * The functions the schema's CHECKs and the migration's triggers call.
   *
   * `regexp(pattern, value)` is a JavaScript `RegExp` — every pattern the
   * Postgres CHECKs carried is rewritten for it, `[[:space:]]` to `\\s` and
   * `~`/`!~` to `regexp`/`not (… regexp …)`. Registered per connection: a
   * bare `sqlite3` shell has no such function and fails a checked write with
   * `no such function`, which says loudly what is missing rather than
   * letting an unchecked row in.
   */
  sqlite.function("regexp", (pattern: unknown, value: unknown) => {
    // NULL in, NULL out: `x ~ 'p'` was NULL (and so passed a CHECK) on a NULL
    // x, and the sqlite spelling `x regexp 'p'` should answer the same way.
    if (pattern === null || value === null) return null;
    if (typeof pattern !== "string" || typeof value !== "string") return 0;
    return new RegExp(pattern).test(value) ? 1 : 0;
  });
  /**
   * `regexp_replace(subject, pattern, replacement[, flags])` for the one
   * caller pg left behind (a title de-dupe). `g` is the only flag SQLite
   * callers ever passed; the JS RegExp always replaces globally.
   */
  sqlite.function(
    "regexp_replace",
    { varargs: true },
    (value: unknown, pattern: unknown, replacement: unknown) => {
      if (value === null || pattern === null || replacement === null) return null;
      return String(value).replace(new RegExp(String(pattern), "g"), String(replacement));
    },
  );
  /** `starts_with(a, b)` the asset key-prefix checks name. */
  sqlite.function("starts_with", (a: unknown, b: unknown) => {
    if (a === null || b === null) return null;
    return String(a).startsWith(String(b)) ? 1 : 0;
  });
  /** What the copy guards ask: may this connection write on a copy? */
  sqlite.function("catalog_copy_ok", () => (flags.copyOk ? 1 : 0));
  /** What the write-seam guards ask: which revision is this connection writing? */
  sqlite.function("catalog_revision_id", () => flags.revisionId);
  /**
   * `pg_trgm.similarity`: the Dice coefficient over the trigram sets of two
   * strings, lower-cased with the one leading and two trailing spaces
   * pg_trgm pads with. Only the topic fuzzy match asks for it, and its
   * threshold reads exactly like the extension's.
   */
  sqlite.function("similarity", (a: unknown, b: unknown) => {
    if (typeof a !== "string" || typeof b !== "string") return 0;
    const grams = (s: string) => {
      const padded = `  ${s.toLowerCase()} `;
      const set = new Set<string>();
      for (let i = 0; i + 3 <= padded.length; i += 1) set.add(padded.slice(i, i + 3));
      return set;
    };
    const ta = grams(a);
    const tb = grams(b);
    if (ta.size === 0 || tb.size === 0) return 0;
    let shared = 0;
    for (const gram of ta) if (tb.has(gram)) shared += 1;
    return shared / (ta.size + tb.size - shared);
  });

  // Postgres's driver parsed jsonb columns itself, so raw `sql` call sites
  // read decoded values, scalars included. SQLite hands every text value
  // back as a string, and better-sqlite3 cannot say which column was
  // declared JSON; a value that is itself well-formed JSON is the closest
  // marker. An opening `{` or `[` is enough on its own; a `"`-quoted scalar
  // is parsed too (a `mode: "json"` text column stores `JSON.stringify` of a
  // string, which reads back quoted), and only when it re-serialises to the
  // same text. A bare `42` or `true` stays a string: text columns really do
  // hold those (`provider_key.last4` is "3210"), so they are not decoded.
  const sniffJson = <T>(rows: T[]): T[] => {
    for (const row of rows as Record<string, unknown>[]) {
      for (const key of Object.keys(row)) {
        const value = row[key];
        if (typeof value !== "string") continue;
        if (value.length > 1 && (value[0] === "{" || value[0] === "[")) {
          try {
            row[key] = JSON.parse(value);
          } catch {
            /* not JSON: a text value that merely opens like one */
          }
          continue;
        }
        if (value.length < 2 || value[0] !== '"') continue;
        try {
          const parsed: unknown = JSON.parse(value);
          if (typeof parsed === "string" && JSON.stringify(parsed) === value) row[key] = parsed;
        } catch {
          /* a text value that merely starts with a quote */
        }
      }
    }
    return rows;
  };
  const session = sqlite;
  const raw = drizzle(sqlite, { schema: tables }) as unknown as CatalogDatabase;
  raw.execute = async <T = Record<string, unknown>>(query: SQLWrapper | string) => {
    const dialect = (raw as unknown as { dialect: { sqlToQuery: (q: SQLWrapper) => { sql: string; params: unknown[] } } }).dialect;
    const prepared = dialect.sqlToQuery(typeof query === "string" ? sql.raw(query) : query);
    let statement;
    try {
      statement = session.prepare(prepared.sql);
    } catch (error) {
      // node-postgres ran a whole string of statements in one execute; tests
      // still send them. better-sqlite3's exec is the multi-statement entry
      // point, and a batch carrying parameters cannot be one by definition.
      if (error instanceof Error && error.message.includes("more than one statement")) {
        if (prepared.params.length > 0) throw error;
        session.exec(prepared.sql);
        return { rows: [] as T[] };
      }
      throw error;
    }
    if (!statement.reader) {
      statement.run(...(prepared.params as never[]));
      return { rows: [] as T[] };
    }
    return { rows: sniffJson(statement.all(...(prepared.params as never[])) as T[]) };
  };
  const db = wrapInQueue(raw, flags);
  FLAGS.set(db, flags);
  return {
    sqlite,
    db,
    close: () => {
      FLAGS.delete(db);
      sqlite.close();
      return Promise.resolve();
    },
    lastPoolError: () => null,
    pool: {
      // pg's `$1` placeholders become SQLite's `?`; the multi-statement and
      // non-reader paths mirror `execute` above, and the writer queue is the
      // same one the drizzle methods take.
      query: <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
        queuedStatement(flags, () => {
          const positional = text.replace(/\$(\d+)/g, "?");
          try {
            const statement = session.prepare(positional);
            if (!statement.reader) {
              const ran = statement.run(...(params as never[]));
              return { rows: [] as T[], rowCount: ran.changes };
            }
            const rows = sniffJson(statement.all(...(params as never[])) as T[]);
            return { rows, rowCount: rows.length };
          } catch (error) {
            if (error instanceof Error && error.message.includes("more than one statement") && params.length === 0) {
              session.exec(positional);
              return { rows: [] as T[], rowCount: 0 };
            }
            throw error;
          }
        }),
      on: () => undefined,
    },
  };
}

/** Runs `fn` against a connection and always closes it, error or not. */
export async function withDatabase<T>(
  fn: (connection: Connection) => Promise<T>,
  options: ConnectOptions = {},
): Promise<T> {
  const connection = connect(options);
  try {
    return await fn(connection);
  } finally {
    await connection.close();
  }
}
