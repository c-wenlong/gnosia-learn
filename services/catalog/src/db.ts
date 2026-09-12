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
}

/**
 * One pool per process. The CLI is short-lived, so `max: 1` keeps the
 * connection count honest and makes a forgotten `close()` obvious instead of
 * silently leaking a handful of sockets.
 */
export function connect(options: ConnectOptions = {}): Connection {
  const pool = new pg.Pool({
    connectionString: options.url ?? databaseUrl(),
    max: 1,
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
