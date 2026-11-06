import type { ProviderName } from "@gnosia/schema/shared";
import { tutorProviderMoveTurn, tutorProviderRemoveTurn } from "@gnosia/tutor/server/turns";

import { dropByokProvider } from "@/lib/byok-sync";
import { byokField, settingsRoute } from "@/lib/provider-keys/requests";
import { CHAIN_WRITE_RATE_LIMIT } from "@/lib/tutor-models/requests";

export const runtime = "nodejs";

/**
 * One provider in the Settings Providers card, as a whole
 * (docs/TUTOR-MODELS.md, T12).
 *
 * `PATCH { provider, direction }` moves the provider's models together past
 * the next provider's, which is how the card's provider order is stored: a
 * provider's place is where its models sit in the chain.
 *
 * `DELETE { provider }` is the card's Delete: the provider's models leave the
 * chain and the owner's saved key for it goes, in one transaction under the
 * learner lock (`deleteTutorProvider`). An add racing it checks for the key
 * inside the same lock, so no model is ever left without a key. A server key
 * is the environment's and stays.
 */

export const PATCH = settingsRoute("tutor-model", CHAIN_WRITE_RATE_LIMIT, tutorProviderMoveTurn);

// The key went with the provider; Studio's list is told too (D95), and the
// answer says whether the runner's copy is gone.
export const DELETE = settingsRoute("tutor-model", CHAIN_WRITE_RATE_LIMIT, tutorProviderRemoveTurn, async (body, answered) =>
  byokField(answered.keyRemoved === true ? await dropByokProvider(body.provider as ProviderName) : undefined),
);
