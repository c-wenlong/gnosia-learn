import pg from "pg";

import { connect, type Connection } from "../src/db";
import { databaseUrl } from "../src/env";

/**
 * The schema tests run against a real Postgres, because the whole point of the
 * schema is the constraints, and no fake enforces a foreign key. They must
 * still not touch the developer's own `self_learn` database, so each run gets a
 * throwaway database created and dropped around it.
 *
 * A throwaway *schema* would have been cheaper, but drizzle-kit writes
 * foreign keys as `REFERENCES "public"."asset"(...)`, so the migrations only
 * apply correctly to `public`. A separate database gives each run its own.
 */

/** The same server, but the `postgres` maintenance database. */
function maintenanceUrl(): string {
  const url = new URL(databaseUrl());
  url.pathname = "/postgres";
  return url.toString();
}

export interface Reachability {
  ok: boolean;
  /** Why the suite is being skipped. Empty when it is not. */
  reason: string;
}

/**
 * Can we reach a Postgres at all? Called once, at module load, so the suite can
 * skip with a reason rather than fail on a machine with no database. `npm test`
 * has to stay green there: the CI workflow runs a postgres:17 service and is
 * where these tests are a gate.
 */
export async function probe(): Promise<Reachability> {
  const client = new pg.Client({
    connectionString: maintenanceUrl(),
    connectionTimeoutMillis: 2_000,
  });
  try {
    await client.connect();
    await client.end();
    return { ok: true, reason: "" };
  } catch (error) {
    // A refused connection arrives with an empty `message` and the reason only
    // in `code`, so both go into the skip reason or it reads as "no Postgres
    // at localhost:5432: " with nothing after the colon.
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
    const message = error instanceof Error && error.message ? error.message : code;
    return {
      ok: false,
      reason: `no Postgres at ${new URL(databaseUrl()).host}: ${message || "unreachable"}`,
    };
  }
}

export interface Scratch extends Connection {
  name: string;
  /** The connection string, for a test that spawns a process of its own. */
  url: string;
  drop: () => Promise<void>;
}

/** Creates an empty database and returns a connection to it. */
export async function createScratchDatabase(): Promise<Scratch> {
  const name = `self_learn_test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = new pg.Client({ connectionString: maintenanceUrl() });
  await admin.connect();
  try {
    // The name is generated above, never user input, but it still goes through
    // an identifier quote rather than string concatenation: CREATE DATABASE
    // takes no parameters, so this is the only safe way to write it.
    await admin.query(`create database ${quoteIdentifier(name)}`);
  } finally {
    await admin.end();
  }

  const url = new URL(databaseUrl());
  url.pathname = `/${name}`;
  const connection = connect({ url: url.toString() });

  return {
    ...connection,
    name,
    url: url.toString(),
    drop: async () => {
      await connection.close();
      const cleanup = new pg.Client({ connectionString: maintenanceUrl() });
      await cleanup.connect();
      try {
        // FORCE (Postgres 13+) terminates anything still attached. Without it a
        // pooled connection that has not finished closing turns cleanup into a
        // flaky "database is being accessed by other users".
        await cleanup.query(`drop database if exists ${quoteIdentifier(name)} with (force)`);
      } finally {
        await cleanup.end();
      }
    },
  };
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/** Postgres SQLSTATE codes the tests assert on. */
export const SQLSTATE = {
  foreignKeyViolation: "23503",
  checkViolation: "23514",
  /** What the append-only trigger raises. */
  restrictViolation: "23001",
} as const;

/**
 * The SQLSTATE of a failed query. drizzle-orm wraps driver errors in a
 * `DrizzleQueryError` and hangs the original off `cause`, so the code is one or
 * more levels down rather than on the error it hands back.
 */
export function sqlstate(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * The driver's own message. The `DrizzleQueryError` wrapper only prints the
 * failed SQL, so asserting on the wrapper would never see what Postgres said.
 */
export function sqlMessage(error: unknown): string {
  let current: unknown = error;
  let deepest = "";
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth += 1) {
    const message = (current as { message?: unknown }).message;
    if (typeof message === "string") deepest = message;
    current = (current as { cause?: unknown }).cause;
  }
  return deepest;
}
