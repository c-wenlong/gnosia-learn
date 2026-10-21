import "server-only";

import type { AssetBlob, AssetRef, CatalogDatabase } from "@gnosia/catalog/state";
import type { BlobRead, BlobStore } from "@gnosia/blob";
import type { AssetSeams } from "@gnosia/tutor/server/deps";
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
} from "@gnosia/tutor/server/asset-files";

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
} from "@gnosia/tutor/server/asset-files";
export type {
  AssetFileProblem,
  AssetRowText,
  AssetSource,
  AssetSourceResult,
  AssetStored,
  RangeRequest,
} from "@gnosia/tutor/server/asset-files";

/**
 * Turning an `asset` row into bytes a browser can play. The resolution itself
 * lives in `@gnosia/tutor/server/asset-files`, which the native sidecar
 * calls with its own blob store; this file hands it this app's three seams:
 * the request's owner scope, the selected content source and the blob store.
 */
/**
 * The store resolved on first use, not at seams() time: `assetBlobStore()`
 * refuses a bad `GNOSIA_HOME` by throwing, and a throw here would turn
 * every catalog-only read (`resolveRowText`, `servedAssets`, …) into a
 * blob-store failure. Deferred, the refusal surfaces inside the core that
 * touched the store, where `blobStoreProblem` classifies it.
 */
function lazyBlobStore(): BlobStore {
  const store = () => assetBlobStore();
  return {
    get provider() {
      return store().provider;
    },
    put: (key, body, meta) => store().put(key, body, meta),
    head: (key) => store().head(key),
    stat: (key) => store().stat(key),
    get: (key, range) => store().get(key, range),
    signedUrl: (key, ttl) => store().signedUrl(key, ttl),
    delete: (key) => store().delete(key),
    list: (prefix) => store().list(prefix),
  };
}

async function seams(): Promise<AssetSeams> {
  return { scope: await currentScope(), source: contentSource(), blobStore: lazyBlobStore() };
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
