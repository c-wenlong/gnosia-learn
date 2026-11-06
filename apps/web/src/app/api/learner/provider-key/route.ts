import type { ProviderName } from "@gnosia/schema/shared";
import { providerKeyRemoveTurn, providerKeySaveTurn } from "@gnosia/tutor/server/turns";

import { connectByokProvider, dropByokProvider } from "@/lib/byok-sync";
import { byokField, KEY_WRITE_RATE_LIMIT, settingsRoute } from "@/lib/provider-keys/requests";

export const runtime = "nodejs";

/**
 * The owner's own model provider keys (docs/BYOK.md).
 *
 * `POST { provider, key }` seals and saves a key, replacing the owner's key
 * for that provider: 200 `{ ok: true, key: { provider, last4, updatedAt,
 * readable } }`. `DELETE { provider }` removes it: 200 `{ ok: true, removed }`.
 * 400 `BAD_REQUEST` for a body that is not a provider and a key of the right
 * shape, 403 from another origin, 429, 401 with no session, 503
 * `STORE_UNAVAILABLE` when the database cannot be written, 503 `NO_SECRET`
 * when the deployment has no `AUTH_SECRET` to seal with.
 *
 * Write-only. No answer carries the key or its ciphertext, and nothing is
 * logged but a code: a refused key is refused without repeating it, and a
 * failed write is reported without the driver's message, which would quote
 * the sealed bytes. The save and the removal are the sidecar's turns
 * (`providerKeySaveTurn`, `providerKeyRemoveTurn`); telling Studio's list
 * is this app's own step after them.
 */

// One key (D95): a provider the studio harness can name joins Studio's list,
// and the runner opens this same sealed row when a turn spawns (docs/BYOK.md,
// D12); the key itself is never sent to it. `byok` in the reply says whether
// the runner took the provider: `false` means it did not answer, and the
// tutor's save still stands.
export const POST = settingsRoute("provider-key", KEY_WRITE_RATE_LIMIT, providerKeySaveTurn, async (body) =>
  byokField(await connectByokProvider(body.provider as ProviderName)),
);

// Studio's list is told whenever a preset's key went away, and the answer
// says whether it landed: `byok: false` tells the card the runner still lists
// the provider (with no key to run on), so the row can say so.
export const DELETE = settingsRoute("provider-key", KEY_WRITE_RATE_LIMIT, providerKeyRemoveTurn, async (body, answered) =>
  byokField(answered.removed === true ? await dropByokProvider(body.provider as ProviderName) : undefined),
);
