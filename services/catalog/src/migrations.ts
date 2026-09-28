import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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
 * drizzle records each applied migration as the sha256 of its SQL file's bytes
 * and the journal timestamp (`when`) it was generated with, never its name, so
 * this recomputes those hashes to turn the table back into names. That is the
 * catalog's own reading, and it differs from drizzle's: drizzle decides what to
 * apply by timestamp alone, running every entry whose `when` is after the last
 * recorded `created_at`, and never looks at a hash again. So an applied file
 * that was edited shows up here as pending, and drizzle skips it forever;
 * `applyThrough` refuses rather than report that as applied.
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
 * already recorded, so a second run is a no-op rather than an error. It does
 * not check that the run left nothing pending; `migrateHolding` does.
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
 *
 * So a registered contract migration must be the last entry in the journal,
 * and `test/blob-contract.test.ts` fails when one is not. Once every database
 * has applied it, its entry comes out of this table, and migrations can
 * follow it again.
 *
 * Empty since phase 3's cut-over: `0013_asset_blob_contract` was the only
 * one, and it came out once the owner's database had applied it, which the
 * cut-over checks (`scripts/flip-rehearsal.mjs --cutover`) before its PR
 * merges. On a database without it, `catalog migrate` now applies it like any
 * other migration, and its guard raises with the offending ids and rolls that
 * run back if the data is not ready. The machinery stays for the next
 * contract; its tests register 0013 through the `contracts` option.
 */
export type ContractMigrations = Readonly<Record<string, (db: CatalogDatabase) => Promise<string | null>>>;

const CONTRACT_MIGRATIONS: ContractMigrations = {};

export function isContractMigration(tag: string, contracts: ContractMigrations = CONTRACT_MIGRATIONS): boolean {
  return tag in contracts;
}

/** Where to find migrations, and which of them are contracts; the defaults are the catalog's own. */
export interface MigrationOptions {
  folder?: string;
  migrationsSchema?: string;
  /** Replaces the registered contract migrations, for a test of the holding machinery. */
  contracts?: ContractMigrations;
}

/** A migration `migrateHolding` did not apply, and why. */
export interface HeldMigration {
  tag: string;
  reason: string;
}

/**
 * A migration drizzle was asked to apply and skipped. drizzle applies by
 * journal timestamp and the catalog reads pending by hash (`hashesByTag`), so
 * a file whose hash matches nothing applied but whose timestamp is not after
 * the last applied one is skipped by every run while every status calls it
 * pending. Before this was thrown, `catalog migrate` looped forever on a held
 * contract migration edited after it was applied: each pass applied it, found
 * it still pending, and applied it again.
 */
export class MigrationSkipped extends Error {
  readonly tags: readonly string[];
  constructor(tags: readonly string[]) {
    super(
      `drizzle did not apply ${tags.join(", ")}: each file's sha256 matches no applied migration, and its ` +
        `journal timestamp is not after the last one applied, so drizzle skips it on every run. Either the ` +
        `file was edited after it was applied (restore it from git: \`git log -p -- services/catalog/drizzle/\`), ` +
        `or it was generated with an older timestamp than a migration already applied here (regenerate it).`,
    );
    this.name = "MigrationSkipped";
    this.tags = tags;
  }
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
 * One drizzle run over the journal's first `count` entries (all of them when
 * `count` is omitted), then a check that it applied every one of them: throws
 * {@link MigrationSkipped} naming any still pending.
 */
async function applyThrough(
  db: CatalogDatabase,
  tags: readonly string[],
  options: { folder?: string; migrationsSchema?: string },
  count?: number,
): Promise<void> {
  const folder = options.folder ?? MIGRATIONS_FOLDER;
  if (count === undefined) {
    await applyMigrations(db, options);
  } else {
    const partial = await firstMigrations(count, folder);
    try {
      await applyMigrations(db, { ...options, folder: partial });
    } finally {
      await rm(partial, { recursive: true, force: true });
    }
  }
  const wanted = new Set(count === undefined ? tags : tags.slice(0, count));
  const skipped = (await migrationStatus(db, options)).pending.filter((tag) => wanted.has(tag));
  if (skipped.length > 0) throw new MigrationSkipped(skipped);
}

/**
 * `catalog migrate`: every outstanding migration, except a contract
 * migration whose data is not ready and everything after it. Each run up to
 * a contract migration is its own drizzle run, so a guard that raises there
 * cannot roll back the migrations before it. Every run is checked to have
 * applied what it was given (`applyThrough`), which is what ends the loop.
 */
export async function migrateHolding(db: CatalogDatabase, options: MigrationOptions = {}): Promise<HeldMigration[]> {
  const contracts = options.contracts ?? CONTRACT_MIGRATIONS;
  const tags = await journalTags(options.folder ?? MIGRATIONS_FOLDER);
  for (;;) {
    const { pending } = await migrationStatus(db, options);
    const contract = pending.find((tag) => isContractMigration(tag, contracts));
    if (contract === undefined) {
      if (pending.length > 0) await applyThrough(db, tags, options);
      return [];
    }
    const before = tags.indexOf(contract);
    if (pending.some((tag) => tags.indexOf(tag) < before)) await applyThrough(db, tags, options, before);
    const reason = await contracts[contract]?.(db);
    if (reason !== null && reason !== undefined) return holding(pending, tags, contract, reason);
    // Applies the contract, so the next pass finds the next one or none.
    await applyThrough(db, tags, options, before + 1);
  }
}

function holding(pending: readonly string[], tags: readonly string[], contract: string, reason: string): HeldMigration[] {
  const before = tags.indexOf(contract);
  return pending
    .filter((tag) => tags.indexOf(tag) >= before)
    .map((tag) => ({ tag, reason: tag === contract ? reason : `waits for ${contract}, which is held` }));
}

/**
 * What `catalog migrate` would hold on this database now, read without
 * applying anything: the outstanding migrations, each with its reason, when
 * the first of them is a contract migration whose data is not ready. Null when
 * nothing is outstanding, when an ordinary migration is first (the database is
 * behind, and `migrate` is the remedy), or when the contract's data is ready
 * (`migrate` applies it). `catalog status`, `learn init` and `learn doctor`
 * read it so they say what is held and why, instead of telling a database
 * `migrate` would only hold again to run `migrate`.
 */
export async function heldMigrations(
  db: CatalogDatabase,
  options: MigrationOptions & { status?: MigrationStatus } = {},
): Promise<HeldMigration[] | null> {
  const contracts = options.contracts ?? CONTRACT_MIGRATIONS;
  const status = options.status ?? (await migrationStatus(db, options));
  const first = status.pending[0];
  if (first === undefined || !isContractMigration(first, contracts)) return null;
  const reason = await contracts[first]?.(db);
  if (reason === null || reason === undefined) return null;
  return holding(status.pending, await journalTags(options.folder ?? MIGRATIONS_FOLDER), first, reason);
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
 * Not when the first outstanding migration is a contract migration: it adds
 * constraints and no column, `catalog migrate` holds it and everything after
 * it until the data is ready, and the commands that make the data ready (the
 * import, the upload) are among these. Refusing them there would leave the
 * database no way forward. A migration queued behind a held one is therefore
 * one those commands must not need, which is the rule for adding one while a
 * database anywhere still holds 0013 (SCHEMA.md, "Still open").
 */
export async function assertMigrated(db: CatalogDatabase, options: MigrationOptions = {}): Promise<void> {
  const status = await migrationStatus(db, options);
  const first = status.pending[0];
  if (first !== undefined && !isContractMigration(first, options.contracts)) {
    throw new MigrationsOutstanding(status.pending);
  }
}
