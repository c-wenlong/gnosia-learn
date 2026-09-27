import { tables } from "@self-learn/schema";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import { copyOk, databaseUrl } from "./env";

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
  /**
   * Let this connection write to a database marked `copy`. Defaults to
   * `CATALOG_COPY_OK=1`; `catalog migrate` passes it explicitly, since a
   * copy's schema still has to follow the primary's.
   */
  copyOk?: boolean;
}

/** The session setting the copy guard trigger reads (migration 0010). */
export const COPY_OK_SETTING = "self_learn.copy_ok";

/**
 * The libpq `options` for a connection: the caller's, plus the copy flag when
 * it is on.
 *
 * Passing `options` to the pool replaces any `options=` in the connection
 * string rather than adding to it, so the URL's own value is carried over
 * first. Nothing is passed when there is nothing to add, which leaves the URL
 * in charge exactly as before.
 */
export function connectionOptions(url: string, options: ConnectOptions): string | undefined {
  const parts: string[] = [];
  if (options.options !== undefined) {
    parts.push(options.options);
  } else {
    try {
      const fromUrl = new URL(url).searchParams.get("options");
      if (fromUrl !== null && fromUrl !== "") parts.push(fromUrl);
    } catch {
      // Not a URL (a keyword/value string): pg parses it, and it cannot carry
      // `options` in a form this would need to preserve.
    }
  }
  if (options.copyOk ?? copyOk()) parts.push(`-c ${COPY_OK_SETTING}=on`);
  if (parts.length === 0) return options.options;
  return parts.join(" ");
}

/**
 * One pool per process. The CLI is short-lived, so the default `max: 1` keeps
 * the connection count honest and makes a forgotten `close()` obvious instead
 * of silently leaking a handful of sockets. A long-lived caller passes `max`.
 */
export function connect(options: ConnectOptions = {}): Connection {
  const url = options.url ?? databaseUrl();
  const pool = new pg.Pool({
    connectionString: url,
    max: options.max ?? 1,
    options: connectionOptions(url, options),
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
