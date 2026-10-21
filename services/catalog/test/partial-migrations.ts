import { readFileSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { MIGRATIONS_FOLDER } from "../src/migrations";

/**
 * A migrations folder holding only the first `count` migrations, so a scratch
 * database can be left deliberately behind.
 *
 * Two suites need it for opposite reasons. `catalog.test.ts` stops at 0002 to
 * reach "head is set but `index_run` does not exist", which is what `status`
 * has to report rather than crash on. `studio.test.ts` stops at 0005 so it can
 * put rows in `event` the way a real database already has them, and then watch
 * 0006's backfill turn them into sessions.
 */
/** 0000 to 0012: everything before phase 2's contract migration, 0013. */
export const BEFORE_BLOB_CONTRACT = 13;

export async function partialMigrations(count = 2): Promise<string> {
  return migrationsWhere((_, index) => index < count);
}

/**
 * Every migration but the ones named, in the journal's order: a database
 * current except for the migration a suite is about. asset-names.test.ts
 * drops 0024, which makes `asset_name`, so the reads and `writeAssetName`
 * take their no-`asset_name` paths while `insert(asset)` still sees today's
 * table.
 */
export async function withoutMigration(...dropped: string[]): Promise<string> {
  return migrationsWhere((tag) => !dropped.includes(tag));
}

/**
 * Every migration but phase 2's contract, 0013: a database holding the rows
 * the contract forbids (a stored-kind asset with a path and no blob) that has
 * had every other migration since. A suite that writes content through
 * today's code needs the columns added after 0013 (0016's
 * `collection.cover_blob_key`, which every collection upsert names), and a
 * database stopped at 0012 has none of them.
 *
 * 0030 goes with 0013: it drops and rewrites `asset_stored_blob_check`, a
 * constraint 0013 created, so it cannot apply to a database that never ran
 * 0013. A suite that needs the `pdf` asset kind it also adds recreates
 * `asset_kind_check` itself, as asset-upload.test.ts does.
 */
export async function withoutBlobContract(): Promise<string> {
  return withoutMigration("0013_asset_blob_contract", "0030_nebulous_lester");
}

/**
 * `asset` as a database stopped before 0031 has it: today's columns minus
 * `inputs_hash`, the column 0031 (`brown_rictor`) adds.
 *
 * `db.insert(asset)` names every column of today's schema, so against a
 * database left behind it dies on `inputs_hash` whatever the row holds. A
 * row written into such a database (a stored-kind asset with a path and no
 * blob, which only a database stopped before 0013 admits) goes in through
 * this table instead. Only the columns are declared; the checks and keys on
 * the real table still judge what the row is.
 */
export const assetBefore0031 = sqliteTable("asset", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  path: text("path"),
  url: text("url"),
  contentHash: text("content_hash"),
  bytes: integer("bytes"),
  title: text("title"),
  sourceRepo: text("source_repo").notNull(),
  blobKey: text("blob_key"),
  resourceType: text("resource_type"),
  ownerId: text("owner_id").notNull().default("local"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(unixepoch('subsec') * 1000 as integer))`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(unixepoch('subsec') * 1000 as integer))`),
});

/** A migrations folder holding the journal's entries `keep` accepts, in order. */
async function migrationsWhere(keep: (tag: string, index: number) => boolean): Promise<string> {
  const folder = await mkdtemp(path.join(tmpdir(), "catalog-partial-"));
  await mkdir(path.join(folder, "meta"), { recursive: true });
  const journal = JSON.parse(
    await readFile(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8"),
  ) as { entries: { tag: string }[] };
  const kept = journal.entries.filter((entry, index) => keep(entry.tag, index));
  for (const entry of kept) {
    await copyFile(
      path.join(MIGRATIONS_FOLDER, `${entry.tag}.sql`),
      path.join(folder, `${entry.tag}.sql`),
    );
  }
  await writeFile(
    path.join(folder, "meta", "_journal.json"),
    JSON.stringify({ ...journal, entries: kept }),
    "utf8",
  );
  return folder;
}

/** Every migration tag in the journal, in order. */
export function journalTags(): string[] {
  const journal = JSON.parse(readFileSync(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8")) as {
    entries: { tag: string }[];
  };
  return journal.entries.map((entry) => entry.tag);
}

/**
 * The tags after `tag`, for a suite that stops a scratch database at an old
 * migration and asserts what is still pending: the migrations added since are
 * pending too, and a list written out by hand would break on every new one.
 */
export function tagsAfter(tag: string): string[] {
  const tags = journalTags();
  const at = tags.indexOf(tag);
  if (at === -1) throw new Error(`no migration ${tag} in the journal`);
  return tags.slice(at + 1);
}

/** The newest migration, which a fully migrated database has as its head. */
export function latestTag(): string {
  return journalTags().at(-1)!;
}
