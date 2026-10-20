import { CONTENT_TYPES as READER_TYPES, type Ownership } from "@gnosia/content";
import { catalogInstance, contentSource, type ContentType } from "@gnosia/schema";
import { eq, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { copyOk } from "../env";

/**
 * `content_source`: which content types the database owns (D18 of
 * docs/CONTENT-MIGRATION.md), what the last export of each wrote, and the
 * parity its flip checked.
 *
 * The row is the authority. `catalog flip` writes it; the importers and the
 * writers obey it whatever `CONTENT_SOURCE` says; a reader follows it unless
 * the variable overrides it for that reader (`selectSource` in
 * `packages/content`). A type with no row is read from its files, which is
 * every type until its track flips it.
 */

export type ContentSourceRow = typeof contentSource.$inferSelect;

/** Every row, by type. */
export async function readContentSources(db: CatalogDatabase): Promise<Map<string, ContentSourceRow>> {
  const rows = await db.select().from(contentSource);
  return new Map(rows.map((row) => [row.type, row]));
}

/**
 * The rows as `selectSource`'s `ownership()` callback wants them: the reader
 * types only (`manimkc` has no reader in the seam), and only rows that name a
 * source. Throws when the table cannot be read, which `selectSource` turns
 * into "no rows, read files" and reports once.
 */
export async function contentOwnership(db: CatalogDatabase): Promise<Ownership> {
  const rows = await db.select({ type: contentSource.type, source: contentSource.source }).from(contentSource);
  const out: Ownership = {};
  for (const row of rows) {
    const type = (READER_TYPES as readonly string[]).find((t) => t === row.type);
    if (type === undefined) continue;
    if (row.source === "files" || row.source === "db") out[type as keyof Ownership] = row.source;
  }
  return out;
}

/**
 * Whether this process may write the bookkeeping columns here: always on the
 * primary, and on a copy only with `CATALOG_COPY_OK=1`, which is what the copy
 * guard trigger would say anyway. Asked first so `export`, which is a read of
 * the database, stays one on a copy instead of failing on its last line.
 */
export async function mayRecord(db: CatalogDatabase): Promise<boolean> {
  const [instance] = await db.select({ role: catalogInstance.role }).from(catalogInstance).limit(1);
  return instance?.role !== "copy" || copyOk();
}

/** Create the type's row if it has none, leaving an existing one's source alone. */
async function ensureRow(db: CatalogDatabase, type: ContentType): Promise<void> {
  await db.insert(contentSource).values({ type }).onConflictDoNothing();
}

/** What `catalog export` wrote for a type: the hash an import checks a `db` type's files against (edge case 12). */
export async function recordExport(db: CatalogDatabase, type: ContentType, hash: string): Promise<void> {
  await ensureRow(db, type);
  await db
    .update(contentSource)
    .set({ exportHash: hash, exportedAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(contentSource.type, type));
}

/** The parity `catalog flip` checked before it flipped a type, kept on the row. */
export interface ParityRecord {
  at: string;
  dir: string;
  clean: boolean;
  expected: number;
  actual: number;
  mismatches: number;
}
