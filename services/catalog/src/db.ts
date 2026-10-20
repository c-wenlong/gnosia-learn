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
  /** Tail of the top-level transaction queue (one writer on this handle). */
  txTail: Promise<void>;
  /** The resolved file this connection opened, for `databaseIdentity`. */
  file: string;
  /** The better-sqlite3 handle, for the busy-timeout juggling in `inTransaction`. */
  sqlite: Database.Database;
  /** How long `begin immediate` keeps retrying before giving up (ms). */
  busyMs: number;
}

const FLAGS = new WeakMap<CatalogDatabase, ConnectionFlags>();

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
): Promise<T> {
  const flags = FLAGS.get(db);
  if (flags === undefined) {
    // A handle that did not come through connect() — a stub in a test, or a
    // bare drizzle database: run the same SQL without the bookkeeping.
    await db.execute(sql`begin immediate`);
    try {
      const out = await fn(db);
      await db.execute(sql`commit`);
      return out;
    } catch (error) {
      await db.execute(sql`rollback`);
      throw error;
    }
  }
  if (INSIDE_TX.getStore() !== true) {
    // Two top-level calls on one connection were two pool clients on
    // Postgres. Here they would nest as savepoints and read each other's
    // uncommitted state, so they queue: each begins only once the last
    // committed, which is the serialisation the pool gave for free.
    const prev = flags.txTail;
    let release!: () => void;
    flags.txTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prev;
    try {
      return await INSIDE_TX.run(true, () => runTransaction(db, flags, fn));
    } finally {
      release();
    }
  }
  return runTransaction(db, flags, fn);
}

async function runTransaction<T>(
  db: CatalogDatabase,
  flags: ConnectionFlags,
  fn: (tx: CatalogDatabase) => Promise<T>,
): Promise<T> {
  const depth = flags.txDepth;
  const name = `catalog_sp_${depth}`;
  if (depth === 0) {
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
    txTail: Promise.resolve(),
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
  // read objects. SQLite hands every text value back as a string, and
  // better-sqlite3 cannot say which column was declared JSON; a value that
  // is itself well-formed JSON object or array text is the closest marker.
  const sniffJson = <T>(rows: T[]): T[] => {
    for (const row of rows as Record<string, unknown>[]) {
      for (const key of Object.keys(row)) {
        const value = row[key];
        if (typeof value === "string" && value.length > 1 && (value[0] === "{" || value[0] === "[")) {
          try {
            row[key] = JSON.parse(value);
          } catch {
            /* not JSON: a text value that merely opens like one */
          }
        }
      }
    }
    return rows;
  };
  const session = sqlite;
  const db = drizzle(sqlite, { schema: tables }) as unknown as CatalogDatabase;
  db.execute = async <T = Record<string, unknown>>(query: SQLWrapper | string) => {
    const dialect = (db as unknown as { dialect: { sqlToQuery: (q: SQLWrapper) => { sql: string; params: unknown[] } } }).dialect;
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
      // non-reader paths mirror `execute` above.
      query: <T = Record<string, unknown>>(text: string, params: unknown[] = []) => {
        const positional = text.replace(/\$(\d+)/g, "?");
        try {
          const statement = session.prepare(positional);
          if (!statement.reader) {
            const ran = statement.run(...(params as never[]));
            return Promise.resolve({ rows: [] as T[], rowCount: ran.changes });
          }
          const rows = sniffJson(statement.all(...(params as never[])) as T[]);
          return Promise.resolve({ rows, rowCount: rows.length });
        } catch (error) {
          if (error instanceof Error && error.message.includes("more than one statement") && params.length === 0) {
            session.exec(positional);
            return Promise.resolve({ rows: [] as T[], rowCount: 0 });
          }
          return Promise.reject(error);
        }
      },
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
