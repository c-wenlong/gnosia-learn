import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

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
