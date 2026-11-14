import { favoriteTurn } from "@hermes/tutor/server/learner-writes";

import { turnRoute } from "@/lib/learner-api";

/**
 * Star or unstar a library asset (`@/lib/favorite`).
 *
 * `{ assetId, favorite }`: `true` writes the star with the time it was set,
 * `false` clears it. The asset is looked up under the owner's scope first, so
 * a star can only land on a row the owner can read, and an id from a stale
 * page is a 400 rather than a row pointing at nothing.
 *
 * The parse and the write are `favoriteTurn` in
 * `@hermes/tutor/server/learner-writes`.
 */
export const POST = turnRoute("favorite", favoriteTurn);
