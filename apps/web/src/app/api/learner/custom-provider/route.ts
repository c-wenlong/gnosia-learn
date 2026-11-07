import { customProviderAddTurn, customProviderChangeTurn } from "@gnosia/tutor/server/turns";

import { settingsRoute } from "@/lib/provider-keys/requests";
import { CHAIN_WRITE_RATE_LIMIT } from "@/lib/tutor-models/requests";

export const runtime = "nodejs";

/**
 * A provider the owner adds themselves (docs/TUTOR-MODELS.md, T14).
 *
 * `POST { label, baseUrl, key }` makes it: the name and the base URL are
 * checked (`checkBaseUrl`: https, or http to this machine only, and never
 * this app's own port or the studio runner's: `pointsAtThisApp`), the key's
 * shape is checked before anything is stored, and the row and the key,
 * sealed under the id made from the name, are written in one transaction, so
 * a provider never exists without its key. The answer names the new id,
 * never the key.
 *
 * `PATCH { provider, label?, baseUrl?, key? }` renames it, moves it, and
 * replaces its key, all in one transaction: a key that cannot be stored
 * leaves the name and the URL as they were. A move to a new base URL is
 * refused (`KEY_REQUIRED`) unless the key comes with it, so a saved key never
 * goes to a host it was not saved for. Its models stay. Its Delete is
 * the provider route's, which removes it whole. Both are turns in
 * `@gnosia/tutor/server/turns` (`customProviderAddTurn`,
 * `customProviderChangeTurn`).
 */

export const POST = settingsRoute("tutor-model", CHAIN_WRITE_RATE_LIMIT, customProviderAddTurn);
export const PATCH = settingsRoute("tutor-model", CHAIN_WRITE_RATE_LIMIT, customProviderChangeTurn);
