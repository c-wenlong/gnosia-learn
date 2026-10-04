import { indexRun } from "@self-learn/schema";
import { sql } from "drizzle-orm";
import pg from "pg";
import { inject } from "vitest";

import { databaseIdentity } from "../src/content/import-root";
import { type CatalogDatabase, connect, type Connection } from "../src/db";
import { databaseUrl } from "../src/env";
import { applyMigrations } from "../src/migrations";

declare module "vitest" {
  export interface ProvidedContext {
    /** The migrated template `migrated-template.ts` made for this run; null when it could not make one. */
    catalogTemplate: string | null;
  }
}

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

/**
 * Every scratch database sorts text linguistically (ICU's en-US), whatever
 * the server's default. Homebrew's Postgres initialises in the C locale,
 * where `ORDER BY` happens to be bytewise, while CI's postgres:17 image
 * defaults to en_US.utf8, where `fx:alpha` sorts before `fx:Beta` and a
 * hyphen in a slug barely counts. An ordering that leaves out `collate "C"`
 * (`bytewise` in src/sql-order.ts) then passed on every laptop and failed only
 * on CI; with this it fails on both.
 */
const LINGUISTIC_COLLATION = "template template0 locale_provider icu icu_locale 'en-US'";

function scratchName(kind = "test"): string {
  return `self_learn_${kind}_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Creates an empty database and returns a connection to it. For a suite that
 * wants every migration applied, `migratedScratchDatabase` is the same thing
 * made faster; this one is for a suite that applies migrations itself, all of
 * them from empty or only some.
 */
export async function createScratchDatabase(name = scratchName()): Promise<Scratch> {
  const admin = new pg.Client({ connectionString: maintenanceUrl() });
  await admin.connect();
  try {
    // The name is generated above, never user input, but it still goes through
    // an identifier quote rather than string concatenation: CREATE DATABASE
    // takes no parameters, so this is the only safe way to write it.
    await admin.query(`create database ${quoteIdentifier(name)} ${LINGUISTIC_COLLATION}`);
  } catch (error) {
    // A server built without ICU cannot take the clause; its default is the
    // best this machine can do.
    if ((error as { code?: unknown }).code !== "0A000") throw error;
    await admin.query(`create database ${quoteIdentifier(name)}`);
  } finally {
    await admin.end();
  }

  return scratchAt(name);
}

/**
 * A scratch database with every migration applied, cloned from the template
 * `migrated-template.ts` migrated once for this vitest run, rather than
 * migrated again by each suite: about 70 test files want one, and on CI's two
 * CPUs each migration competed with the tests for them. The clone carries
 * the template's collation (the linguistic one above) and the rows 0010
 * seeds, the `local` learner and `catalog_instance` saying `primary`, so it
 * is the database `createScratchDatabase` plus `applyMigrations` would make.
 * `schema.test.ts` still migrates from empty, which is what keeps that true.
 *
 * Without a template (no global setup ran, or it could not reach Postgres)
 * it does exactly that instead.
 */
export async function migratedScratchDatabase(): Promise<Scratch> {
  const template = providedTemplate();
  if (template === null) {
    const scratch = await createScratchDatabase();
    try {
      await applyMigrations(scratch.db);
    } catch (error) {
      await scratch.drop();
      throw error;
    }
    return scratch;
  }
  const name = scratchName();
  const admin = new pg.Client({ connectionString: maintenanceUrl() });
  await admin.connect();
  try {
    await admin.query(`create database ${quoteIdentifier(name)} template ${quoteIdentifier(template)}`);
  } finally {
    await admin.end();
  }
  return scratchAt(name);
}

function providedTemplate(): string | null {
  try {
    return inject("catalogTemplate") ?? null;
  } catch {
    // Outside a vitest worker there is nothing to inject.
    return null;
  }
}

/**
 * Makes the template `migratedScratchDatabase` clones: an empty scratch
 * database, migrated, closed, and then barred from connections. Postgres
 * refuses to copy a database anyone is connected to, so the bar is what makes
 * a stray connection to it fail on its own rather than fail some other
 * suite's clone. Concurrent clones of one template are fine: CREATE DATABASE
 * reads the template without connecting to it.
 */
export async function createMigratedTemplate(): Promise<string> {
  const scratch = await createScratchDatabase(scratchName("test_template"));
  let closed = false;
  try {
    await applyMigrations(scratch.db);
    await scratch.close();
    closed = true;
    const admin = new pg.Client({ connectionString: maintenanceUrl() });
    await admin.connect();
    try {
      await admin.query(`alter database ${quoteIdentifier(scratch.name)} with allow_connections false`);
    } finally {
      await admin.end();
    }
  } catch (error) {
    // A pool's `end` rejects the second time, so `drop` is only for one still open.
    await (closed ? dropDatabase(scratch.name) : scratch.drop());
    throw error;
  }
  return scratch.name;
}

/** Drops a scratch database or a template, whoever is still connected to it. */
export async function dropDatabase(name: string): Promise<void> {
  const admin = new pg.Client({ connectionString: maintenanceUrl() });
  await admin.connect();
  try {
    // FORCE (Postgres 13+) terminates anything still attached. Without it a
    // pooled connection that has not finished closing turns cleanup into a
    // flaky "database is being accessed by other users".
    await admin.query(`drop database if exists ${quoteIdentifier(name)} with (force)`);
  } finally {
    await admin.end();
  }
}

/** A connection to a scratch database that exists, and the way to drop it. */
function scratchAt(name: string): Scratch {
  const url = new URL(databaseUrl());
  url.pathname = `/${name}`;
  const connection = connect({ url: url.toString() });

  return {
    ...connection,
    name,
    url: url.toString(),
    drop: async () => {
      await connection.close();
      await dropDatabase(name);
    },
  };
}

/**
 * A copy of a scratch database made the way a person makes one of theirs,
 * `CREATE DATABASE ... TEMPLATE` (what `createdb -T` runs): every row comes
 * along, `index_run` and `catalog_instance` included. The template may have
 * no other session while it is copied, so the source's pooled connections are
 * ended first; its pool records the error and opens a fresh one on its next
 * query.
 */
export async function copyScratchDatabase(source: Scratch): Promise<Scratch> {
  const name = `${source.name}_copy_${Math.random().toString(36).slice(2, 6)}`;
  const admin = new pg.Client({ connectionString: maintenanceUrl() });
  await admin.connect();
  try {
    await admin.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
      [source.name],
    );
    await admin.query(`create database ${quoteIdentifier(name)} template ${quoteIdentifier(source.name)}`);
  } finally {
    await admin.end();
  }
  return scratchAt(name);
}

/**
 * Record `root` as where `source`'s files were imported from, by this
 * database, the way `catalog index` records it: for a test that seeds rows
 * directly and then calls a writer that keeps the files in step (D17).
 */
export async function markImported(db: CatalogDatabase, source: string, root: string): Promise<void> {
  const metadata = { root, database: await databaseIdentity(db) };
  const now = new Date();
  await db
    .insert(indexRun)
    .values({ source, sourceRoot: root, startedAt: now, finishedAt: now, metadata })
    .onConflictDoUpdate({
      target: indexRun.source,
      set: { metadata: sql`${indexRun.metadata} || ${JSON.stringify(metadata)}::jsonb` },
    });
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
