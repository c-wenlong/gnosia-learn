import { tables } from "@self-learn/schema";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import { databaseUrl } from "./env";

export type CatalogDatabase = NodePgDatabase<typeof tables>;

export interface Connection {
  pool: pg.Pool;
  db: CatalogDatabase;
  close: () => Promise<void>;
  /**
   * The last error an **idle** pooled client raised, or null.
   *
   * Not the errors from queries: those reject the call that made them and are
   * that caller's to handle. This is the other kind, the one nobody asked for
   * — see the listener in `connect`.
   */
  lastPoolError: () => Error | null;
}

export interface ConnectOptions {
  /** Overrides DATABASE_URL. Used by the tests, which point at a scratch schema. */
  url?: string;
  /** Extra libpq options, e.g. `-c search_path=catalog_test_1234`. */
  options?: string;
  /** Fail fast rather than hanging when nothing is listening. */
  connectionTimeoutMillis?: number;
  /**
   * Pool size. One is right for the CLI, which is a short-lived process doing
   * one thing; the web app is a long-lived server answering concurrent
   * requests and would serialise every page render behind a single socket.
   */
  max?: number;
}

/**
 * One pool per process. The CLI is short-lived, so the default `max: 1` keeps
 * the connection count honest and makes a forgotten `close()` obvious instead
 * of silently leaking a handful of sockets. A long-lived caller passes `max`.
 */
export function connect(options: ConnectOptions = {}): Connection {
  const pool = new pg.Pool({
    connectionString: options.url ?? databaseUrl(),
    max: options.max ?? 1,
    options: options.options,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5_000,
  });
  /**
   * An idle client that dies takes the whole process with it, unless somebody
   * is listening.
   *
   * `pg.Pool` is an `EventEmitter`, and a connection that breaks while it is
   * sitting idle in the pool belongs to no query, so the driver has nowhere to
   * report it but `emit("error")`. Node's rule for an `error` event with no
   * listener is to throw it as an uncaught exception, which ends the process:
   * a `drop database ... with (force)` against a scratch database killed a
   * vitest worker and every test in it, on `terminating connection due to
   * administrator command`, from a pool that suite was not even using. The
   * same shape is a Postgres restart or a dropped socket in production.
   *
   * Recorded rather than rethrown, and not logged. The driver has already
   * discarded the broken client, so the next query takes a fresh one and fails
   * on its own terms if the server really is gone — which is the failure the
   * caller can act on. A line on stderr here would fire during an ordinary
   * shutdown race as well, and the CLI's stdout is somebody's `--json`.
   */
  let lastPoolError: Error | null = null;
  pool.on("error", (error: Error) => {
    lastPoolError = error;
  });
  const db = drizzle(pool, { schema: tables });
  return { pool, db, close: () => pool.end(), lastPoolError: () => lastPoolError };
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
