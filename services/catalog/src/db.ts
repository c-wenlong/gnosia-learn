import { tables } from "@self-learn/schema";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import { databaseUrl } from "./env";

export type CatalogDatabase = NodePgDatabase<typeof tables>;

export interface Connection {
  pool: pg.Pool;
  db: CatalogDatabase;
  close: () => Promise<void>;
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
  const db = drizzle(pool, { schema: tables });
  return { pool, db, close: () => pool.end() };
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
