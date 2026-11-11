import { assetNameTurn } from "@hermes/tutor/server/learner-writes";

import { turnRoute } from "@/lib/learner-api";

/**
 * The learner's own name for an asset (`asset_name`), set from the asset's
 * library page. `name` is a string, or null or an empty one to go back to the
 * title the asset's source gave it. Stored cleaned (`cleanAssetName`) and
 * refused past `ASSET_NAME_MAX` characters rather than cut. Answers with the
 * name every page now shows, the learner's own and the source's.
 *
 * State, not content (ARCHITECTURE.md rule 11): the asset row is untouched,
 * so no import undoes the name.
 *
 * The parse and the write are `assetNameTurn` in
 * `@hermes/tutor/server/learner-writes`.
 */
export const POST = turnRoute("asset-name", assetNameTurn);
