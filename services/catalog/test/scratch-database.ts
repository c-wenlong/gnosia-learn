import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { indexRun } from "@gnosia/schema";
import { sql } from "drizzle-orm";
import { inject } from "vitest";

import { databaseIdentity } from "../src/content/import-root";
import { type CatalogDatabase, connect, type Connection } from "../src/db";
import { applyMigrations } from "../src/migrations";

declare module "vitest" {
  export interface ProvidedContext {
    /** The migrated template file `migrated-template.ts` made for this run; null when it could not make one. */
    catalogTemplate: string | null;
  }
}

/**
 * The schema tests run against a real SQLite database file, for the same
 * reason they ran against a real Postgres: the point of the schema is the
 * constraints, and no fake enforces a foreign key. A scratch database is a
 * file under the OS temp dir now, not a `CREATE DATABASE` on a shared
 * server, so there is nothing to reach, nothing to drop by SQL, and no
 * `probe`: a machine that cannot open a temp file cannot run the tests
 * either.
 */

export interface Reachability {
  ok: boolean;
  /** Why the suite is being skipped. Empty when it is not. */
  reason: string;
}

/**
 * Kept from the Postgres suite: callers ask once at module load and skip
 * with the reason rather than fail. SQLite's file is always reachable, so
 * the answer is always `ok`; the shape stays so the call sites read the same.
 */
export async function probe(): Promise<Reachability> {
  return { ok: true, reason: "" };
}

/**
 * `ALTER TABLE … DISABLE TRIGGER` has no SQLite spelling: a trigger is
 * dropped and created again, so clearing `event` means taking its
 * append-only guards off and putting them back with the same DDL the
 * migration wrote (`event_no_update`/`event_no_delete` in
 * drizzle-sqlite/0000).
 */
export async function clearTables(db: CatalogDatabase, tables: readonly string[]): Promise<void> {
  // `ALTER TABLE … DISABLE TRIGGER` has no SQLite spelling: the append-only
  // guards on the listed tables are dropped for the delete and put back from
  // their stored DDL.
  // `truncate … cascade` also emptied the rows that referenced these tables:
  // children first, every table whose foreign keys can reach one of them.
  const all = db.all<{ name: string }>(sql`select name from sqlite_master where type = 'table' and name not like 'sqlite_%'`);
  const referencedBy = new Map<string, string[]>();
  for (const { name } of all) {
    for (const fk of db.all<{ table: string }>(sql.raw(`pragma foreign_key_list("${name}")`))) {
      referencedBy.set(fk.table, [...(referencedBy.get(fk.table) ?? []), name]);
    }
  }
  const clearing = new Set(tables);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [parent, children] of referencedBy) {
      if (clearing.has(parent)) for (const child of children) if (!clearing.has(child)) (clearing.add(child), (grew = true));
    }
  }
  const order = [...clearing];
  const guards = db.all<{ name: string; sql: string }>(sql`
    select name, sql from sqlite_master
    where type = 'trigger' and (name like '%!_no!_update' escape '!' or name like '%!_no!_delete' escape '!')
      and tbl_name in ${order}`);
  const drops = guards.map((trigger) => `drop trigger "${trigger.name}"`).join("; ");
  const puts = guards.map((trigger) => trigger.sql).join("; ");
  await db.execute(
    `pragma foreign_keys=off; ` +
      (drops === "" ? "" : `${drops}; `) +
      order.map((table) => `delete from "${table}"`).join("; ") +
      (puts === "" ? "" : `; ${puts}`) +
      `; pragma foreign_keys=on;`,
  );
}

/**
 * SQLite cannot drop a CHECK constraint, so a suite wanting a table the
 * contract-era checks have not reached rebuilds it: rename, recreate from
 * the sqlite_master DDL with the named constraint removed, copy the rows,
 * and replay the indexes and triggers the rename took away.
 */
export async function withoutConstraint(
  db: CatalogDatabase,
  table: string,
  constraint: string,
): Promise<void> {
  const ddl = db.get<{ sql: string }>(
    sql`select sql from sqlite_master where type = 'table' and name = ${table}`,
  );
  if (ddl === undefined) throw new Error(`no table ${table}`);
  const extra = db
    .all<{ sql: string }>(
      sql`select sql from sqlite_master where tbl_name = ${table} and type in ('index', 'trigger') and sql is not null`,
    )
    .map((row) => row.sql);
  const without = ddl.sql.replace(
    new RegExp(String.raw`,\s*CONSTRAINT "${constraint}" CHECK\([^;]*?\)(?=\s*[,)])`),
    "",
  );
  if (without === ddl.sql) throw new Error(`${table} has no constraint ${constraint}`);
  // The rebuild needs the new table beside the old one first: retarget its
  // `create table "x"` at `x_kept`.
  const stripped = without.replace(/\bCREATE TABLE\s+(?:IF NOT EXISTS\s+)?[`"]?(?:main\.)?[`"\w]+/i, `CREATE TABLE "${table}_kept"`);
  if (!stripped.includes(`"${table}_kept"`)) throw new Error(`could not retarget ${table}'s create table`);
  // Not `rename to asset_kept` then rename back: a rename rewrites every
  // other table's `references asset` to the new name, and the rebuild would
  // leave the catalog pointing at a table it then drops. Build the kept one
  // beside it, copy, drop the original, and rename the kept one — the other
  // tables' `references asset` resolve to it by name again.
  await db.execute(
    `pragma foreign_keys=off; ${stripped}; insert into "${table}_kept" select * from "${table}"; ` +
      `drop table "${table}"; alter table "${table}_kept" rename to "${table}"; ` +
      extra.join("; ") +
      "; pragma foreign_keys=on;",
  );
}

export interface Scratch extends Connection {
  name: string;
  /** The file path, for a test that spawns a process of its own. */
  url: string;
  /** The scratch directory the file sits in; `drop` removes it whole. */
  dir: string;
  drop: () => Promise<void>;
}

function scratchDir(kind = "test"): string {
  return mkdtempSync(path.join(tmpdir(), `gnosia_${kind}_${process.pid}_`));
}

/**
 * A new, empty SQLite file with a connection to it. For a suite that wants
 * every migration applied, `migratedScratchDatabase` is the same thing made
 * faster; this one is for a suite that applies migrations itself, all of
 * them from empty or only some.
 */
export async function createScratchDatabase(name?: string): Promise<Scratch> {
  const dir = scratchDir();
  return scratchAt(name ?? path.basename(dir), path.join(dir, "catalog.db"), dir);
}

/**
 * A scratch database with every migration applied, copied from the file
 * `migrated-template.ts` migrated once for this vitest run rather than
 * migrated again by each suite — the same shortcut `CREATE DATABASE …
 * TEMPLATE` was, except a SQLite "template" is just a file to copy. The copy
 * carries the rows the migration seeds (the `local` learner and
 * `catalog_instance` saying `primary`), so it is the database
 * `createScratchDatabase` plus `applyMigrations` would make.
 * `schema.test.ts` still migrates from empty, which is what keeps that true.
 *
 * Without a template (no global setup ran, or it could not make one) it does
 * exactly that instead.
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
  const dir = scratchDir();
  const file = path.join(dir, "catalog.db");
  // The template was closed and checkpointed before it was named, so a plain
  // file copy carries the whole database — WAL sidecars and all.
  copyFileSync(template, file);
  return scratchAt(path.basename(dir), file, dir);
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
 * Makes the template `migratedScratchDatabase` copies: a scratch file,
 * migrated, checkpointed (`wal_checkpoint(truncate)` folds the -wal back into
 * the main file so the copy is whole), closed, and its path returned.
 */
export async function createMigratedTemplate(): Promise<string> {
  const scratch = await createScratchDatabase(`template_${process.pid}`);
  try {
    await applyMigrations(scratch.db);
    scratch.sqlite.pragma("wal_checkpoint(truncate)");
    await scratch.close();
  } catch (error) {
    await scratch.drop();
    throw error;
  }
  return scratch.url;
}

/** Removes a scratch database's directory, or a template's. */
export async function dropDatabase(name: string): Promise<void> {
  rmSync(name, { recursive: true, force: true });
  rmSync(`${name}-wal`, { force: true });
  rmSync(`${name}-shm`, { force: true });
}

/** A connection to a scratch file that exists, and the way to drop it. */
function scratchAt(name: string, file: string, dir: string): Scratch {
  const connection = connect({ url: file });
  return {
    ...connection,
    name,
    url: file,
    dir,
    drop: async () => {
      await connection.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * A copy of a scratch database made the way a person copies a SQLite file:
 * checkpoint the WAL back into the main file, then copy it. Every row comes
 * along, `index_run` and `catalog_instance` included, as
 * `CREATE DATABASE … TEMPLATE` did on Postgres.
 */
export async function copyScratchDatabase(source: Scratch): Promise<Scratch> {
  source.sqlite.pragma("wal_checkpoint(truncate)");
  const dir = scratchDir();
  const file = path.join(dir, "catalog.db");
  copyFileSync(source.url, file);
  return scratchAt(`${source.name}_copy`, file, dir);
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
      set: { metadata: sql`json_patch(${indexRun.metadata}, ${JSON.stringify(metadata)})` },
    });
}

/**
 * Postgres answered errors with a five-char SQLSTATE; better-sqlite3 answers
 * with `SQLITE_*` codes, and the trigger guards carry the SQLSTATE their
 * Postgres function raised as the first five chars of the message
 * (`23001: event is append-only…`). So `sqlstate` reads that prefix first —
 * the guard's own code, whichever engine said it — then falls back to a
 * SQLite error code, so `SQLSTATE.checkViolation` below maps `SQLITE_CONSTRAINT_*`
 * onto `23514` the way the same assertion read it before.
 */
export const SQLSTATE = {
  foreignKeyViolation: "23503",
  checkViolation: "23514",
  /** What the append-only trigger raises. */
  restrictViolation: "23001",
} as const;

/** Maps the better-sqlite3 `code` onto the SQLSTATE its Postgres check carried. */
const SQLITE_TO_SQLSTATE: Record<string, string> = {
  SQLITE_CONSTRAINT_FOREIGNKEY: "23503",
  SQLITE_CONSTRAINT_TRIGGER: "23001",
  SQLITE_CONSTRAINT_CHECK: "23514",
  SQLITE_CONSTRAINT_UNIQUE: "23505",
  SQLITE_CONSTRAINT_PRIMARYKEY: "23505",
  SQLITE_CONSTRAINT_NOTNULL: "23502",
  SQLITE_BUSY: "55P03",
};

export function sqlstate(error: unknown): string | undefined {
  // Two passes: the guard's own SQLSTATE is carried in its raise() message
  // anywhere down the cause chain, and a drizzle wrapper's `code` is
  // SQLITE_ERROR for every one of them — so a code is only the answer when
  // no level named one.
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth += 1) {
    const message = (current as { message?: unknown }).message;
    if (typeof message === "string") {
      const embedded = /^([0-9A-Z]{5}):/.exec(message)?.[1];
      if (embedded !== undefined) return embedded;
    }
    current = (current as { cause?: unknown }).cause;
  }
  current = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") {
      // An extended code can lie: a plain `delete` whose RESTRICT foreign key
      // refuses answers `SQLITE_CONSTRAINT_TRIGGER` ("trigger" because the FK
      // action itself is one), and the message is the honest part.
      const message = (current as { message?: unknown }).message;
      if (typeof message === "string" && /foreign key constraint failed/i.test(message)) return "23503";
      return SQLITE_TO_SQLSTATE[code] ?? code;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * The driver's own message. The `DrizzleQueryError` wrapper only prints the
 * failed SQL, so asserting on the wrapper would never see what SQLite said.
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
