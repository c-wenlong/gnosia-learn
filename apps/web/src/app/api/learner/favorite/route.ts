import { assetsByIds, clearPreference, StateError, writePreference } from "@self-learn/catalog/state";

import { MAX_ASSET_ID_CHARS } from "@/app/api/learner/watched/route";
import { favoriteKey } from "@/lib/favorite";
import { BadRequest, handler } from "@/lib/learner-api";
import { ownerScope } from "@/lib/owner";

/**
 * Star or unstar a library asset (`@/lib/favorite`).
 *
 * `{ assetId, favorite }`: `true` writes the star with the time it was set,
 * `false` clears it. The asset is looked up under the owner's scope first, so
 * a star can only land on a row the owner can read, and an id from a stale
 * page is a 400 rather than a row pointing at nothing.
 */
export const POST = handler(
  "favorite",
  (body) => {
    const assetId = body.assetId;
    if (typeof assetId !== "string" || assetId.trim() === "") {
      throw new BadRequest('"assetId" is required and must be a non-empty string.');
    }
    if (assetId.length > MAX_ASSET_ID_CHARS) {
      throw new BadRequest(`"assetId" is longer than ${MAX_ASSET_ID_CHARS} characters.`);
    }
    if (typeof body.favorite !== "boolean") throw new BadRequest('"favorite" must be true or false.');
    return { assetId, favorite: body.favorite };
  },
  async (db, input, owner) => {
    const [row] = await assetsByIds(db, [input.assetId], ownerScope(owner));
    if (row === undefined) throw new StateError(`no asset in the catalog for "${input.assetId}"`);
    const key = favoriteKey(row.id);
    if (!input.favorite) {
      await clearPreference(db, key, owner);
      return { assetId: row.id, favorite: false, at: null };
    }
    const at = new Date().toISOString();
    await writePreference(db, key, { at }, owner);
    return { assetId: row.id, favorite: true, at };
  },
);
