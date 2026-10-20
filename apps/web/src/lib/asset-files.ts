import "server-only";

import type { AssetBlob, AssetRef, CatalogDatabase } from "@self-learn/catalog/state";
import type { BlobRead } from "@self-learn/blob";
import type { AssetSeams } from "@self-learn/tutor/server/deps";
import {
  openBlob as openBlobCore,
  posterSource as posterSourceCore,
  pdfSource as pdfSourceCore,
  resolveAsset as resolveAssetCore,
  resolveBlob as resolveBlobCore,
  resolveRowText as resolveRowTextCore,
  servedAssets as servedAssetsCore,
  storedPdfs as storedPdfsCore,
  storedPosters as storedPostersCore,
  type AssetFileProblem,
  type AssetSourceResult,
  type AssetStored,
} from "@self-learn/tutor/server/asset-files";

import { contentSource } from "@/data/source";
import { assetBlobStore } from "@/lib/blob-store";
import { currentScope } from "@/lib/owner";

export {
  BYTE_QUEUE,
  CONTENT_TYPES,
  contentTypeFor,
  blobStoreProblem,
  isRangeRefusal,
  parseRange,
  rowTypeFor,
  safeFilename,
  webStreamFrom,
} from "@self-learn/tutor/server/asset-files";
export type {
  AssetFileProblem,
  AssetRowText,
  AssetSource,
  AssetSourceResult,
  AssetStored,
  RangeRequest,
} from "@self-learn/tutor/server/asset-files";

/**
 * Turning an `asset` row into bytes a browser can play. The resolution itself
 * lives in `@self-learn/tutor/server/asset-files`, which the native sidecar
 * calls with its own blob store; this file hands it this app's three seams:
 * the request's owner scope, the selected content source and the blob store.
 */
async function seams(): Promise<AssetSeams> {
  return { scope: await currentScope(), source: contentSource(), blobStore: assetBlobStore() };
}

export async function resolveBlob(blob: AssetBlob, name: string) {
  return resolveBlobCore(await seams(), blob, name);
}

export async function resolveRowText(db: CatalogDatabase, row: AssetRef) {
  return resolveRowTextCore(await seams(), db, row);
}

export async function resolveAsset(db: CatalogDatabase, id: string): Promise<AssetSourceResult> {
  return resolveAssetCore(await seams(), db, id);
}

export async function servedAssets(db: CatalogDatabase, rows: readonly Pick<AssetRef, "id" | "kind">[]): Promise<Set<string>> {
  return servedAssetsCore(await seams(), db, rows);
}

export async function storedPosters(db: CatalogDatabase, rows: readonly Pick<AssetRef, "id" | "kind">[]): Promise<Set<string>> {
  return storedPostersCore(await seams(), db, rows);
}

export async function storedPdfs(db: CatalogDatabase, rows: readonly Pick<AssetRef, "id" | "kind">[]): Promise<Set<string>> {
  return storedPdfsCore(await seams(), db, rows);
}

export async function posterSource(db: CatalogDatabase, id: string): Promise<AssetStored | AssetFileProblem> {
  return posterSourceCore(await seams(), db, id);
}

export async function pdfSource(db: CatalogDatabase, id: string): Promise<AssetStored | AssetFileProblem> {
  return pdfSourceCore(await seams(), db, id);
}

export async function openBlob(key: string, range?: { start: number; end: number }): Promise<BlobRead> {
  return openBlobCore(await seams(), key, range);
}
