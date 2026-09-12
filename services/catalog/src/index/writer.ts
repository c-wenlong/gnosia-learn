import {
  asset,
  assetConcept,
  assetDerivation,
  assetTopic,
  collection,
  collectionItem,
  concept,
  conceptCurriculumItem,
  conceptPrerequisite,
  curriculumItem,
  curriculumItemTopic,
  indexRun,
  topic,
} from "@self-learn/schema";
import { and, getTableColumns, getTableName, inArray, notInArray, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import type { CatalogDatabase } from "../db";
import { IndexError } from "./errors";
import type { Indexer, SourceRows } from "./source";

/**
 * Turning one source's rows into SQL, in one transaction.
 *
 * Two rules shape everything here.
 *
 * **The content half is derived, so a row the source no longer produces is a
 * bug.** Every write is an upsert followed by a prune, and the prune is scoped
 * to what this source owns: a tree that vanishes from `learn/` takes its rows
 * with it, and a stale row cannot outlive its file the way
 * `out/networking/adguard-home` outlived its source once already.
 *
 * **Entities are upserted, links are replaced.** A `concept` or
 * `curriculum_item` row is the target of foreign keys from the state tables —
 * `mastery`, `review`, `progress`, `recap`, all `ON DELETE CASCADE` — so
 * deleting and reinserting one destroys the learner's record of it and puts an
 * identical-looking row back in its place. Link rows are the target of nothing,
 * so for them delete-then-insert is both simpler and exactly right: it is the
 * only way a link the source *stopped* producing goes away, which an upsert
 * would silently keep forever.
 *
 * One transaction per source, not one for the whole run. A source either lands
 * whole or not at all, and a manimkc checkout that cannot be read must not roll
 * back the concepts that were already indexed correctly.
 */

/** Everything one `catalog index` run did to one source. */
export interface SourceWrite {
  source: string;
  /** Rows inserted or updated, per SQL table name. */
  written: Record<string, number>;
  /**
   * Rows that went away, per SQL table name. Link tables are replaced wholesale
   * on every run, so this counts the *net* loss rather than the churn — a run
   * that rewrites the same 61 links reports nothing, which is the truth.
   */
  deleted: Record<string, number>;
  /**
   * Which entity rows were pruned, capped at 25. A deletion here cascades into
   * the learner's mastery, review and progress, so `index` prints the keys
   * rather than a bare count: "3 concepts deleted" is not something anyone
   * notices, three slugs is.
   */
  deletedKeys: string[];
  notes: string[];
  totalWritten: number;
  totalDeleted: number;
}

const DELETED_KEYS_SHOWN = 25;

/** The entity tables an indexer may own, and the column identifying a row. */
const ENTITY_KEY = {
  topic: "slug",
  concept: "slug",
  collection: "id",
  curriculumItem: "id",
  asset: "id",
} as const;

/** Entity tables, in the order a foreign key needs them written. */
const ENTITY_ORDER = ["topic", "concept", "collection", "curriculumItem", "asset"] as const;
type EntityName = (typeof ENTITY_ORDER)[number];

/** Link tables, written after every entity they point at exists. */
const LINK_ORDER = [
  "assetTopic",
  "assetConcept",
  "conceptPrerequisite",
  "collectionItem",
  "assetDerivation",
  "curriculumItemTopic",
  "conceptCurriculumItem",
] as const;
type LinkName = (typeof LINK_ORDER)[number];

/**
 * Link tables hanging off an asset. These are scoped by the writing source's
 * asset id prefix rather than owned outright, because three different sources
 * write `asset_concept` and each may only prune its own rows.
 */
const ASSET_LINKED = new Set<LinkName>(["assetTopic", "assetConcept", "assetDerivation"]);

const TABLES = {
  topic,
  concept,
  collection,
  curriculumItem,
  asset,
  assetTopic,
  assetConcept,
  conceptPrerequisite,
  collectionItem,
  assetDerivation,
  curriculumItemTopic,
  conceptCurriculumItem,
} as const satisfies Record<keyof SourceRows, PgTable>;

/** Conflict targets for the entity upserts, matching each table's primary key. */
const CONFLICT_TARGET = {
  topic: topic.slug,
  concept: concept.slug,
  collection: collection.id,
  curriculumItem: curriculumItem.id,
  asset: asset.id,
} as const;

/**
 * `created_at` is when the catalog first saw a row, and re-indexing is not a
 * new sighting. `updated_at` is handled separately. Everything else on the row
 * belongs to the source.
 */
const NEVER_UPDATED = new Set(["created_at", "updated_at"]);

type AnyRow = Record<string, unknown>;

/*
 * The two places this file admits it is generic.
 *
 * drizzle types `.values()` and every column against one specific table. This
 * writer is deliberately generic over twelve of them, and the row shapes are
 * already guaranteed at the indexer boundary by `SourceRows`, which is built
 * from drizzle's own `$inferInsert` types. Two narrow casts here beat twelve
 * near-identical copies of the same forty lines, each free to drift.
 */

/** Rows for a table chosen at runtime. Checked by `SourceRows`, not by drizzle. */
function rowsFor(rows: AnyRow[]): never {
  return rows as never;
}

/** One column off a table chosen at runtime. Throws rather than passing undefined on. */
function columnOf(table: PgTable, name: string): PgColumn {
  const column = (table as unknown as Record<string, PgColumn | undefined>)[name];
  if (column === undefined) {
    throw new IndexError(`table ${getTableName(table)} has no column "${name}"`);
  }
  return column;
}

/**
 * The SET clause for an upsert: every column the table has, taken from the row
 * being inserted.
 *
 * Deliberately not "every column this batch happened to supply". The source is
 * authoritative for the whole row, so a field that disappears from a file has
 * to disappear from the database, and a key-union SET cannot express that — an
 * omitted key is simply absent from the clause and the old value survives
 * forever. Reading the columns off the table instead makes `excluded.<column>`
 * the insert's own value, which for an omitted column is its default. A summary
 * deleted from a note's frontmatter therefore becomes null, rather than living
 * on as the last value anyone ever wrote.
 *
 * `created_at` is the one exception: it is when the catalog first saw the row,
 * and re-indexing is not a new sighting. `updated_at` is set to now() rather
 * than to the insert's default for the same reason in reverse — it is a fact
 * about this write.
 */
function updateSet(table: PgTable): Record<string, SQL> {
  const set: Record<string, SQL> = {};
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    if (NEVER_UPDATED.has(column.name)) continue;
    set[key] = sql.raw(`excluded.${quote(column.name)}`);
  }
  set["updatedAt"] = sql`now()`;
  return set;
}

function quote(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

/** The scope of everything one source owns in a table keyed by asset id. */
function inNamespace(column: unknown, prefix: string): SQL {
  return sql`starts_with(${column as SQL}, ${prefix})`;
}

/**
 * Postgres caps a statement at 65535 bind parameters and an asset row carries
 * ten columns, so a large source would otherwise fail on a limit that has
 * nothing to do with its data being wrong.
 */
function chunked<T>(rows: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

export async function writeSource(
  db: CatalogDatabase,
  indexer: Indexer,
  rows: SourceRows,
  notes: string[],
  root: string,
): Promise<SourceWrite> {
  assertNamespaced(indexer, rows);

  const startedAt = new Date();
  const written: Record<string, number> = {};
  const deleted: Record<string, number> = {};
  const deletedKeys: string[] = [];

  const record = (table: PgTable, into: Record<string, number>, count: number) => {
    if (count > 0) into[getTableName(table)] = (into[getTableName(table)] ?? 0) + count;
  };

  await db.transaction(async (tx) => {
    // 1. Clear the link rows this source owns, and remember how many there
    //    were so step 4 can report the net change rather than the churn.
    const clearedLinks: Partial<Record<LinkName, number>> = {};
    for (const name of LINK_ORDER) {
      const scope = linkScope(indexer, name);
      if (scope === null) continue;
      const result = await tx.delete(TABLES[name]).where(scope ?? sql`true`);
      clearedLinks[name] = result.rowCount ?? 0;
    }

    // 2. Upsert the entities, parents before children.
    for (const name of ENTITY_ORDER) {
      const batch = (rows[name] ?? []) as AnyRow[];
      if (batch.length === 0) continue;
      const table = TABLES[name];
      for (const part of chunked(batch)) {
        await tx
          .insert(table)
          .values(rowsFor(part))
          .onConflictDoUpdate({ target: CONFLICT_TARGET[name], set: updateSet(table) });
      }
      record(table, written, batch.length);
    }

    // 3. Prune entities the source no longer produces, children before parents
    //    so a cascade never double-counts.
    for (const name of [...ENTITY_ORDER].reverse()) {
      const pruned = await pruneEntity(tx, indexer, name, rows);
      if (pruned.length === 0) continue;
      const table = TABLES[name];
      record(table, deleted, pruned.length);
      for (const key of pruned) {
        if (deletedKeys.length < DELETED_KEYS_SHOWN) {
          deletedKeys.push(`${getTableName(table)} ${key}`);
        }
      }
    }

    // 4. Insert the links, now that everything they point at exists.
    for (const name of LINK_ORDER) {
      const batch = (rows[name] ?? []) as AnyRow[];
      const table = TABLES[name];
      for (const part of chunked(batch)) await tx.insert(table).values(rowsFor(part));
      if (batch.length > 0) record(table, written, batch.length);
      const cleared = clearedLinks[name];
      if (cleared !== undefined) record(table, deleted, Math.max(0, cleared - batch.length));
    }

    const finishedAt = new Date();
    const run = {
      sourceRoot: root,
      startedAt,
      finishedAt,
      written: sum(written),
      deleted: sum(deleted),
      counts: written,
    };
    await tx
      .insert(indexRun)
      .values({ source: indexer.source, ...run })
      .onConflictDoUpdate({
        target: indexRun.source,
        set: { ...run, updatedAt: sql`now()` },
      });
  });

  return {
    source: indexer.source,
    written,
    deleted,
    deletedKeys,
    notes,
    totalWritten: sum(written),
    totalDeleted: sum(deleted),
  };
}

function sum(counts: Record<string, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

/**
 * Every asset id a source produces must sit in that source's namespace.
 * Without this an indexer could mint `manimkc:` ids from `learn/`, and the
 * manimkc prune would then delete them on its next run — a bug that shows up as
 * rows vanishing at random, days later, nowhere near the code that caused it.
 */
function assertNamespaced(indexer: Indexer, rows: SourceRows): void {
  const prefix = indexer.assetPrefix;
  const assets = rows.asset ?? [];
  if (assets.length > 0 && prefix === undefined) {
    throw new IndexError(`indexer "${indexer.source}" produced assets but declares no assetPrefix`);
  }
  if (prefix === undefined) return;
  for (const row of assets) {
    if (!row.id.startsWith(prefix)) {
      throw new IndexError(
        `indexer "${indexer.source}" produced asset id "${row.id}", outside its ` +
          `"${prefix}" namespace. Asset ids are how the writer knows which rows a ` +
          `source may delete.`,
      );
    }
  }
}

/**
 * The rows of a link table this source may clear: `undefined` for all of them
 * (it is the only writer), a predicate for the ones hanging off its own assets,
 * `null` for none — this source does not write here.
 */
function linkScope(indexer: Indexer, name: LinkName): SQL | undefined | null {
  if ((indexer.owns as readonly string[]).includes(name)) return undefined;
  const prefix = indexer.assetPrefix;
  if (prefix === undefined || !ASSET_LINKED.has(name)) return null;
  const assetId = (TABLES[name] as unknown as Record<string, unknown>)["assetId"];
  return inNamespace(assetId, prefix);
}

/**
 * Delete the rows of one entity table that are in this source's scope and were
 * not produced this run. Returns the keys deleted; a table the source does not
 * own is left entirely alone.
 */
async function pruneEntity(
  tx: CatalogDatabase,
  indexer: Indexer,
  name: EntityName,
  rows: SourceRows,
): Promise<string[]> {
  let scope: SQL | undefined;
  if (name === "asset") {
    const prefix = indexer.assetPrefix;
    if (prefix === undefined) return [];
    scope = inNamespace(asset.id, prefix);
  } else if (!(indexer.owns as readonly string[]).includes(name)) {
    return [];
  }

  const table = TABLES[name];
  const key = ENTITY_KEY[name];
  const column = columnOf(table, key);
  const produced = ((rows[name] ?? []) as AnyRow[]).map((row) => String(row[key]));

  const notProduced = produced.length === 0 ? sql`true` : notInArray(column, produced);
  const where = scope === undefined ? notProduced : and(scope, notProduced);

  const stale = (await tx.select({ key: column }).from(table).where(where)) as { key: string }[];
  if (stale.length === 0) return [];

  const keys = stale.map((row) => row.key);
  await tx.delete(table).where(inArray(column, keys));
  return keys;
}
