import { asset, assetDerivation, blobObject } from "@self-learn/schema";
import { and, eq, inArray } from "drizzle-orm";

import type { CatalogDatabase } from "../db";

/**
 * Where an asset's bytes are in the blob store, for the web app's asset routes
 * (docs/CONTENT-MIGRATION.md, Track E). Read-only, and beside `assets.ts`
 * rather than in it because `AssetRef` is what `catalog show --json` prints,
 * and a blob key is a serving detail no listing needs.
 */

export interface AssetBlob {
  /** The asset whose bytes these are. */
  assetId: string;
  key: string;
  /** `pending` until the upload is confirmed; the routes serve only `present`. */
  state: string;
  bytes: number;
  mime: string;
  sha256: string;
}

const COLUMNS = {
  assetId: asset.id,
  key: blobObject.key,
  state: blobObject.state,
  bytes: blobObject.bytes,
  mime: blobObject.mime,
  sha256: blobObject.sha256,
} as const;

/** The blob behind each of these assets, keyed by asset id. An asset with no `blob_key` is absent. */
export async function assetBlobs(db: CatalogDatabase, ids: readonly string[]): Promise<Map<string, AssetBlob>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select(COLUMNS)
    .from(asset)
    .innerJoin(blobObject, eq(blobObject.key, asset.blobKey))
    .where(inArray(asset.id, [...ids]));
  return new Map(rows.map((row) => [row.assetId, row] as const));
}

/**
 * The stored poster of one video: the `poster` asset derived from it, with its
 * blob. Null when the video has none yet, which is every video until
 * `catalog asset upload` has run, and then the web app's ffmpeg fallback is
 * the answer.
 */
export async function posterBlob(db: CatalogDatabase, videoId: string): Promise<AssetBlob | null> {
  const [row] = await db
    .select(COLUMNS)
    .from(assetDerivation)
    .innerJoin(asset, eq(asset.id, assetDerivation.assetId))
    .innerJoin(blobObject, eq(blobObject.key, asset.blobKey))
    .where(and(eq(assetDerivation.sourceAssetId, videoId), eq(asset.kind, "poster")))
    .orderBy(asset.id)
    .limit(1);
  return row ?? null;
}
