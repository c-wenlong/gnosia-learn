import { asset, blobObject, type NewAsset } from "@self-learn/schema";
import { eq, inArray } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import type { SourceRows } from "./source";

/**
 * An indexer never knows about blobs: it reads a tree and hands over rows
 * without a `blobKey`. The writer's upsert sets every column from the row it
 * is given (`updateSet` in `../content/upsert.ts`, deliberately), so without
 * this a plain `catalog import --only manimkc` after `catalog asset upload`
 * would put every `blob_key` back to null and write an asset revision saying
 * so, and the file route would drop back to the legacy file.
 *
 * The rule is the content addressing itself: a row that names no blob keeps
 * the one it has when that blob holds exactly the bytes the indexer just
 * hashed (`blob_object.sha256 = content_hash`). A re-render changes the hash,
 * so the stale key is dropped, the asset falls back to its file, and the next
 * upload hooks up the new bytes. A row that names a blob itself (Track D's
 * diagram import) is left as given.
 *
 * Read under the writer's type locks, before the upsert, so nothing can move
 * the stored key between this read and the write that carries it forward.
 */
export async function keepBlobKeys(tx: CatalogDatabase, rows: SourceRows, owner: string): Promise<SourceRows> {
  const given = rows.asset ?? [];
  const open = given.filter((row) => row.blobKey === undefined && typeof row.contentHash === "string");
  if (open.length === 0) return rows;

  const stored = await tx
    .select({ id: asset.id, key: blobObject.key, sha256: blobObject.sha256 })
    .from(asset)
    .innerJoin(blobObject, eq(blobObject.key, asset.blobKey))
    .where(
      inArray(
        asset.id,
        open.map((row) => row.id),
      ),
    );
  if (stored.length === 0) return rows;
  const byId = new Map(stored.map((row) => [row.id, row] as const));

  const kept: NewAsset[] = given.map((row) => {
    if (row.blobKey !== undefined) return row;
    const blob = byId.get(row.id);
    // Only a key under the row's own owner: the prefix is whose store and
    // whose quota the bytes are in (D5), so a key another owner uploaded is
    // not carried onto this row, and the next upload stores its own copy.
    return blob !== undefined && blob.sha256 === row.contentHash && blob.key.startsWith(`${owner}/`)
      ? { ...row, blobKey: blob.key }
      : row;
  });
  return { ...rows, asset: kept };
}
