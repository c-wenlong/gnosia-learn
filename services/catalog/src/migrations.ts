import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { BLOB_CONTRACT_MIGRATION, blobContractDistance, describeDistance } from "./content/blob-contract";
import type { CatalogDatabase } from "./db";
import { SERVICE_ROOT } from "./env";

export const MIGRATIONS_FOLDER = path.join(SERVICE_ROOT, "drizzle");

/**
 * Where drizzle records what it has applied. Kept configurable because the
 * tests run migrations inside a throwaway schema and must not touch, or be
 * confused by, the journal of the real database.
 */
export const DEFAULT_MIGRATIONS_SCHEMA = "drizzle";
const MIGRATIONS_TABLE = "__drizzle_migrations";

interface JournalEntry {
  idx: number;
  tag: string;
}

interface Journal {
  entries?: JournalEntry[];
}

export interface MigrationStatus {
  /** The last migration recorded as applied, or null on an empty database. */
  head: string | null;
  /** The last migration on disk. Equals `head` when nothing is outstanding. */
  latest: string | null;
  applied: string[];
  pending: string[];
}

/** The tags on disk, in the order drizzle would apply them. */
export async function journalTags(folder = MIGRATIONS_FOLDER): Promise<string[]> {
  const raw = await readFile(path.join(folder, "meta", "_journal.json"), "utf8");
  const journal = JSON.parse(raw) as Journal;
  return [...(journal.entries ?? [])]
    .sort((a, b) => a.idx - b.idx)
    .map((entry) => entry.tag);
}

/**
 * drizzle keys applied migrations by the sha256 of the SQL file's bytes, not by
 * name, so this recomputes those hashes to turn the journal back into names.
 * Recomputing rather than trusting the order also catches an edited migration:
 * its hash no longer matches anything applied, so it shows up as pending.
 */
async function hashesByTag(folder: string, tags: string[]): Promise<Map<string, string>> {
  const pairs = await Promise.all(
    tags.map(async (tag) => {
      const contents = await readFile(path.join(folder, `${tag}.sql`), "utf8");
      return [createHash("sha256").update(contents).digest("hex"), tag] as const;
    }),
  );
  return new Map(pairs);
}

export async function migrationStatus(
  db: CatalogDatabase,
  options: { folder?: string; migrationsSchema?: string } = {},
): Promise<MigrationStatus> {
  const folder = options.folder ?? MIGRATIONS_FOLDER;
  const schema = options.migrationsSchema ?? DEFAULT_MIGRATIONS_SCHEMA;
  const tags = await journalTags(folder);
  const byHash = await hashesByTag(folder, tags);

  const appliedHashes = new Set<string>();
  const exists = await db.execute<{ present: boolean }>(
    sql`select to_regclass(${`${schema}.${MIGRATIONS_TABLE}`}) is not null as present`,
  );
  if (exists.rows[0]?.present) {
    const rows = await db.execute<{ hash: string }>(
      sql`select hash from ${sql.identifier(schema)}.${sql.identifier(MIGRATIONS_TABLE)} order by created_at`,
    );
    for (const row of rows.rows) appliedHashes.add(row.hash);
  }

  const applied: string[] = [];
  const pending: string[] = [];
  for (const [hash, tag] of byHash) {
    (appliedHashes.has(hash) ? applied : pending).push(tag);
  }
  const order = (tag: string) => tags.indexOf(tag);
  applied.sort((a, b) => order(a) - order(b));
  pending.sort((a, b) => order(a) - order(b));

  return {
    head: applied.at(-1) ?? null,
    latest: tags.at(-1) ?? null,
    applied,
    pending,
  };
}

/**
 * Applies every outstanding migration. Idempotent: drizzle skips what it has
 * already recorded, so a second run is a no-op rather than an error.
 */
export async function applyMigrations(
  db: CatalogDatabase,
  options: { folder?: string; migrationsSchema?: string } = {},
): Promise<void> {
  await migrate(db, {
    migrationsFolder: options.folder ?? MIGRATIONS_FOLDER,
    migrationsSchema: options.migrationsSchema ?? DEFAULT_MIGRATIONS_SCHEMA,
  });
}

/**
 * Contract migrations: ones that only add constraints over data the code
 * already writes both ways, and that some existing database cannot take yet
 * because its data breaks them. Each names the question that says whether it
 * can apply, which is only asked once everything before it is applied.
 *
 * `catalog migrate` holds such a migration back while the answer is not
 * null, and applies everything before it; `assertMigrated` lets the other
 * commands run on a database whose only outstanding migrations are these,
 * since the code works on both sides of them. That is what lets the owner's
 * database, at 0009 with no video uploaded, migrate to 0012 and then run the
 * upload that 0013 waits on, rather than roll the whole run back when 0013's
 * guard raises. A migration after a held one waits with it: drizzle applies in
 * order and never goes back for a skipped one.
 */
const CONTRACT_MIGRATIONS: Readonly<Record<string, (db: CatalogDatabase) => Promise<string | null>>> = {
  [BLOB_CONTRACT_MIGRATION]: async (db) => describeDistance(await blobContractDistance(db)),
};

export function isContractMigration(tag: string): boolean {
  return tag in CONTRACT_MIGRATIONS;
}

/** A migration `migrateHolding` did not apply, and why. */
export interface HeldMigration {
  tag: string;
  reason: string;
}

/**
 * A copy of the migrations folder holding the journal's first `count`
 * entries, for applying up to a point: drizzle's migrator takes a folder and
 * applies all of it in one transaction. Removed by the caller.
 */
async function firstMigrations(count: number, folder: string): Promise<string> {
  const into = await mkdtemp(path.join(tmpdir(), "catalog-migrations-"));
  await mkdir(path.join(into, "meta"), { recursive: true });
  const journal = JSON.parse(await readFile(path.join(folder, "meta", "_journal.json"), "utf8")) as Journal & {
    entries: JournalEntry[];
  };
  const kept = [...journal.entries].sort((a, b) => a.idx - b.idx).slice(0, count);
  for (const entry of kept) await copyFile(path.join(folder, `${entry.tag}.sql`), path.join(into, `${entry.tag}.sql`));
  await writeFile(path.join(into, "meta", "_journal.json"), JSON.stringify({ ...journal, entries: kept }), "utf8");
  return into;
}

/**
 * `catalog migrate`: every outstanding migration, except a contract
 * migration whose data is not ready and everything after it. Each run up to
 * a contract migration is its own drizzle run, so a guard that raises there
 * cannot roll back the migrations before it.
 */
export async function migrateHolding(
  db: CatalogDatabase,
  options: { folder?: string; migrationsSchema?: string } = {},
): Promise<HeldMigration[]> {
  const folder = options.folder ?? MIGRATIONS_FOLDER;
  const tags = await journalTags(folder);
  for (;;) {
    const { pending } = await migrationStatus(db, options);
    const contract = pending.find(isContractMigration);
    if (contract === undefined) {
      if (pending.length > 0) await applyMigrations(db, options);
      return [];
    }
    const before = tags.indexOf(contract);
    if (pending.some((tag) => tags.indexOf(tag) < before)) {
      const partial = await firstMigrations(before, folder);
      try {
        await applyMigrations(db, { ...options, folder: partial });
      } finally {
        await rm(partial, { recursive: true, force: true });
      }
    }
    const reason = await CONTRACT_MIGRATIONS[contract]?.(db);
    if (reason !== null && reason !== undefined) {
      return pending
        .filter((tag) => tags.indexOf(tag) >= before)
        .map((tag) => ({ tag, reason: tag === contract ? reason : `waits for ${contract}, which is held` }));
    }
    const upTo = await firstMigrations(before + 1, folder);
    try {
      await applyMigrations(db, { ...options, folder: upTo });
    } finally {
      await rm(upTo, { recursive: true, force: true });
    }
  }
}

/**
 * The catalog CLI's exit code for "the database is behind this code". The
 * next free number after `EXIT_UNREACHABLE`'s 3, and deliberately not 1:
 * a caller can tell "run migrate" from "the command failed" without reading
 * the message, and from 3, which the studio reads as "nothing is there".
 */
export const EXIT_MIGRATIONS_OUTSTANDING = 4;

/**
 * Refused because the database has not had every migration on disk applied.
 * The message is the whole remedy, and nothing is printed with a stack: the
 * alternative was drizzle's `Failed query: select ... from content_source`,
 * which named a table the person had never heard of.
 */
export class MigrationsOutstanding extends Error {
  readonly pending: readonly string[];
  constructor(pending: readonly string[]) {
    super(
      `${pending.length} migration(s) outstanding (${pending.join(", ")}). ` +
        `Run: npm run catalog -- migrate`,
    );
    this.name = "MigrationsOutstanding";
    this.pending = pending;
  }
}

/**
 * Throws {@link MigrationsOutstanding} when any migration on disk is not
 * applied, which is how `catalog doctor` and `catalog status` already read it.
 * For the commands that query tables or columns a later migration added: run
 * first, so they refuse by name instead of failing on a missing relation.
 *
 * Outstanding contract migrations alone do not count: they add constraints
 * and no column, and the upload they wait on is one of these commands.
 */
export async function assertMigrated(db: CatalogDatabase): Promise<void> {
  const status = await migrationStatus(db);
  if (status.pending.length > 0 && !status.pending.every(isContractMigration)) {
    throw new MigrationsOutstanding(status.pending);
  }
}
