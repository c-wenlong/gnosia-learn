import { tutorModelAddTurn, tutorModelMoveTurn, tutorModelRemoveTurn, tutorModelSetTurn } from "@gnosia/tutor/server/turns";

import { settingsRoute } from "@/lib/provider-keys/requests";
import { CHAIN_WRITE_RATE_LIMIT } from "@/lib/tutor-models/requests";

export const runtime = "nodejs";

/**
 * The owner's model chain (docs/TUTOR-MODELS.md): the provider and model
 * pairs the tutor tries, top to bottom.
 *
 * `POST { provider, model }` adds an entry at the bottom. `PUT { provider,
 * model }` makes the entry the whole chain (T16): Model selection's pick,
 * replaced in one write so a refused save keeps the chain it would have
 * replaced. `DELETE { provider, model }` removes one. `PATCH { provider,
 * model, direction: "up" | "down" }` moves one a place. Each answers 200
 * `{ ok: true, chain }`, the whole chain after the change, top first.
 *
 * 400 `BAD_REQUEST` for a body that is not a provider and a model id of the
 * right shape (a model id that looks like, or is, an API key included), 400
 * `NO_KEY` when adding for a provider nothing holds a key for, 409 `DUPLICATE` or `FULL`, 404 `NOT_FOUND` for an entry that is not
 * there, 403 from another origin, 429, 401 with no session, 503
 * `STORE_UNAVAILABLE` (the chain, or on an add the saved keys, could not be
 * read). The same guards as the provider-key routes, under
 * their own rate-limit buckets. Each method is the turn the sidecar answers
 * with (`tutorModelAddTurn` and the rest), key gate included.
 */

export const POST = settingsRoute("tutor-model", CHAIN_WRITE_RATE_LIMIT, tutorModelAddTurn);
export const PUT = settingsRoute("tutor-model", CHAIN_WRITE_RATE_LIMIT, tutorModelSetTurn);
export const DELETE = settingsRoute("tutor-model", CHAIN_WRITE_RATE_LIMIT, tutorModelRemoveTurn);
export const PATCH = settingsRoute("tutor-model", CHAIN_WRITE_RATE_LIMIT, tutorModelMoveTurn);
