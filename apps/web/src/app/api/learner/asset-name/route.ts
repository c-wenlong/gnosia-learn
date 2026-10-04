import { ASSET_NAME_MAX, cleanAssetName } from "@self-learn/schema/shared";
import { writeAssetName } from "@self-learn/catalog/state";

import { MAX_ASSET_ID_CHARS } from "@/app/api/learner/watched/route";
import { BadRequest, handler } from "@/lib/learner-api";

/**
 * The learner's own name for an asset (`asset_name`), set from the asset's
 * library page. `name` is a string, or null or an empty one to go back to the
 * title the asset's source gave it. Stored cleaned (`cleanAssetName`) and
 * refused past `ASSET_NAME_MAX` characters rather than cut. Answers with the
 * name every page now shows, the learner's own and the source's.
 *
 * State, not content (ARCHITECTURE.md rule 11): the asset row is untouched,
 * so no import undoes the name.
 */
export const POST = handler(
  "asset-name",
  (body) => {
    const assetId = body.assetId;
    if (typeof assetId !== "string" || assetId.trim() === "") {
      throw new BadRequest('"assetId" is required and must be a non-empty string.');
    }
    if (assetId.length > MAX_ASSET_ID_CHARS) {
      throw new BadRequest(`"assetId" is longer than ${MAX_ASSET_ID_CHARS} characters.`);
    }
    const name = body.name;
    if (name !== null && typeof name !== "string") throw new BadRequest('"name" must be a string, or null to clear it.');
    const cleaned = cleanAssetName(name);
    if (cleaned !== null && cleaned.length > ASSET_NAME_MAX) {
      throw new BadRequest(`"name" must be at most ${ASSET_NAME_MAX} characters.`);
    }
    return { assetId, name: cleaned };
  },
  (db, input, owner) => writeAssetName(db, input.assetId, input.name, owner),
);
