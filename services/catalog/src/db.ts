import Database from "better-sqlite3";
import { sql, type SQLWrapper } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
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
    const shown = violators.slice(0, 5).map((row) => `${row["id"]}: ${row["detail"]}`).join("; ");
    super(
      `deferred rule "${rule}" refused the commit: ${violators.length} violator(s)` +
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
export async function inTransaction<T>(
  db: CatalogDatabase,
  fn: (tx: CatalogDatabase) => Promise<T>,
): Promise<T> {
  const flags = FLAGS.get(db);
  if (flags === undefined) {
    throw new Error("inTransaction on a database not opened through connect()");
  }
  const depth = flags.txDepth;
  const name = `catalog_sp_${depth}`;
  db.run(sql.raw(depth === 0 ? "begin immediate" : `savepoint ${name}`));
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
    db.run(sql.raw(depth === 0 ? "commit" : `release ${name}`));
    if (depth === 0) flags.revisionId = null;
    return out;
  } catch (error) {
    if (depth === 0) {
      db.run(sql`rollback`);
    } else {
      db.run(sql.raw(`rollback to ${name}`));
      db.run(sql.raw(`release ${name}`));
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
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file, {
    timeout: options.connectionTimeoutMillis ?? 5_000,
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

  const db = drizzle(sqlite, { schema: tables }) as unknown as CatalogDatabase;
  db.execute = async <T = Record<string, unknown>>(query: SQLWrapper | string) => {
    const session = (db as unknown as { $client: Database.Database }).$client;
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
    const rows = statement.all(...(prepared.params as never[])) as T[];
    // Postgres's driver parsed jsonb columns itself, so raw `sql` call sites
    // read objects. SQLite hands every text value back as a string, and
    // better-sqlite3 cannot say which column was declared JSON; a value that
    // is itself well-formed JSON object or array text is the closest marker.
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
    return { rows };
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
