import "server-only";

import { fsStore, type BlobStore } from "@self-learn/blob";
import { blobRoot } from "@self-learn/catalog/state";

/**
 * The blob store the asset routes read from (docs/CONTENT-MIGRATION.md,
 * Track E): the same one `catalog asset upload` wrote to, because both resolve
 * the root through the catalog's `blobRoot()` (`SELF_LEARN_HOME`).
 *
 * Only the `fs` adapter exists while everything is local ("Decided by the
 * owner"). Its `signedUrl` is null, so the routes stream through `get`; the
 * cloud adapter that comes with go-live returns a URL and the same routes
 * redirect to it instead. This is the one place that choice will be made.
 *
 * Opened per call and memoised by root, so a test or a developer changing
 * `SELF_LEARN_HOME` gets the store it names without a restart. `fsStore`
 * refuses a root inside a checkout and a relative `SELF_LEARN_HOME`; that
 * refusal is thrown from here, and the routes answer it as
 * `blob-store-unavailable` rather than as a 500.
 */

/**
 * How long a signed URL lives: an hour, the plan's guess against a longest
 * video far shorter (edge case 15). A seek after expiry fails, and the page
 * asks the route again for a fresh one.
 */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

let memo: { root: string; store: BlobStore } | null = null;

export function assetBlobStore(): BlobStore {
  const root = blobRoot();
  if (memo !== null && memo.root === root) return memo.store;
  const store = fsStore(root);
  memo = { root, store };
  return store;
}
