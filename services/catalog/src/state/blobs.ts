import { asset, assetDerivation, blobObject, type OwnerScope } from "@self-learn/schema";
import { and, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { ownedBy } from "../content/scope";
import type { CatalogDatabase } from "../db";
import { sqlstate } from "./errors";

/**
 * Where an asset's bytes are in the blob store, for the web app's asset routes
 * (docs/CONTENT-MIGRATION.md, Track E). Read-only, and beside `assets.ts`
 * rather than in it because `AssetRef` is what `catalog show --json` prints,
 * and a blob key is a serving detail no listing needs.
 *
 * **A database from before the blob store has no blobs.** `blob_object` and
 * `asset.blob_key` arrive with migration 0010. Against a database still at
 * 0009 (the owner's, until they run `npm run catalog -- migrate`) both
 * readers answer "no blob" instead of failing, so the asset routes fall
 * through to the legacy file exactly as they did before this existed. Any
 * other failure is thrown, and the routes report it as the catalog being
 * unreachable.
 */

/** undefined_table, undefined_column: the schema predates 0010. */
const BEFORE_BLOBS = new Set(["42P01", "42703"]);

let warned = false;

async function orNoBlobs<T>(read: () => Promise<T>, none: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    const code = sqlstate(error);
    if (code === undefined || !BEFORE_BLOBS.has(code)) throw error;
    if (!warned) {
      warned = true;
      console.warn("asset blobs: this database predates the blob store (0010); run `npm run catalog -- migrate`");
    }
    return none;
  }
}

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

/**
 * The video a poster is derived from, joined under its own name: a poster is
 * served for a video id, so both the poster and the video it stands for must
 * be readable (phase 4). A readable poster of another owner's video would
 * otherwise answer for a video the reader cannot open.
 */
const video = alias(asset, "video");

/**
 * The asset's blob, and only when the reader may read the blob's owner: a
 * key's prefix is whose store and quota the bytes are in (D5), so a row
 * naming another owner's key would otherwise serve bytes that owner stored to
 * anyone who can read the row. The write seam refuses a new such key; this is
 * the read side, and it holds for a row written before the seam checked.
 * Keyed on the reader rather than on the row's owner so that D23's move of a
 * row to the commons, which leaves its `local/` key until `catalog asset
 * upload` re-keys it, keeps serving the owner who stored the bytes. The
 * table's check ties `owner_id` to the key's prefix, so this is the prefix.
 */
function keyedFor(scope: OwnerScope) {
  return and(eq(blobObject.key, asset.blobKey), ownedBy(blobObject.ownerId, scope.readable));
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
export async function assetBlobs(
  db: CatalogDatabase,
  ids: readonly string[],
  scope: OwnerScope,
): Promise<Map<string, AssetBlob>> {
  if (ids.length === 0) return new Map();
  const rows = await orNoBlobs(
    () =>
      db
        .select(COLUMNS)
        .from(asset)
        .innerJoin(blobObject, keyedFor(scope))
        .where(and(inArray(asset.id, [...ids]), ownedBy(asset.ownerId, scope.readable))),
    [],
  );
  return new Map(rows.map((row) => [row.assetId, row] as const));
}

/**
 * Which of these videos have a stored poster whose blob is `present`: the
 * thumbnail check for a page of cards, in one query. A video whose own blob is
 * stored can still have no poster (the upload ran without ffmpeg), and its
 * card must not ask the poster route for one the route would have to cut.
 */
export async function videosWithStoredPoster(
  db: CatalogDatabase,
  videoIds: readonly string[],
  scope: OwnerScope,
): Promise<Set<string>> {
  if (videoIds.length === 0) return new Set();
  const rows = await orNoBlobs(
    () =>
      db
        .select({ videoId: assetDerivation.sourceAssetId })
        .from(assetDerivation)
        .innerJoin(asset, eq(asset.id, assetDerivation.assetId))
        .innerJoin(video, eq(video.id, assetDerivation.sourceAssetId))
        .innerJoin(blobObject, keyedFor(scope))
        .where(
          and(
            inArray(assetDerivation.sourceAssetId, [...videoIds]),
            eq(asset.kind, "poster"),
            eq(blobObject.state, "present"),
            ownedBy(asset.ownerId, scope.readable),
            ownedBy(video.ownerId, scope.readable),
          ),
        ),
    [],
  );
  return new Set(rows.map((row) => row.videoId));
}

/**
 * The stored poster of one video: the `poster` asset derived from it, with its
 * blob. Null when the video has none yet, which is every video until
 * `catalog asset upload` has run, and then the web app's ffmpeg fallback is
 * the answer.
 */
export async function posterBlob(db: CatalogDatabase, videoId: string, scope: OwnerScope): Promise<AssetBlob | null> {
  const [row] = await orNoBlobs(
    () =>
      db
        .select(COLUMNS)
        .from(assetDerivation)
        .innerJoin(asset, eq(asset.id, assetDerivation.assetId))
        .innerJoin(video, eq(video.id, assetDerivation.sourceAssetId))
        .innerJoin(blobObject, keyedFor(scope))
        .where(
          and(
            eq(assetDerivation.sourceAssetId, videoId),
            eq(asset.kind, "poster"),
            ownedBy(asset.ownerId, scope.readable),
            ownedBy(video.ownerId, scope.readable),
          ),
        )
        .orderBy(asset.id)
        .limit(1),
    [],
  );
  return row ?? null;
}
