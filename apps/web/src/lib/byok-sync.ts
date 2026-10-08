import "server-only";

import type { ProviderName } from "@self-learn/schema/shared";

import { byokToTutor, TUTOR_TO_BYOK } from "@/lib/byok-providers";
import { openSavedKeys } from "@/lib/provider-keys/store";
import { studioApi, studioEnabled } from "@/lib/studio";

export { byokToTutor, TUTOR_TO_BYOK };

/**
 * The tutor key a provider was just saved with, mirrored to the runner.
 * Returns true when the key landed, false when the runner is off, down or
 * refused — the tutor write has already happened and stands alone, so the
 * caller reports the mismatch rather than failing the save.
 */
export async function pushByokKey(provider: ProviderName, key: string): Promise<boolean> {
  const byok = TUTOR_TO_BYOK[provider];
  if (byok === undefined || !studioEnabled()) return false;
  try {
    const result = await studioApi("/api/settings/byok", { method: "PUT", body: JSON.stringify({ provider: byok, apiKey: key }) });
    return result.ok;
  } catch {
    return false;
  }
}

/** The mirror of `pushByokKey` for a delete: the provider leaves `byok.json` too — key, tiers and the active pick. */
export async function dropByokProvider(provider: ProviderName): Promise<boolean> {
  const byok = TUTOR_TO_BYOK[provider];
  if (byok === undefined || !studioEnabled()) return false;
  try {
    const result = await studioApi("/api/settings/byok", { method: "DELETE", body: JSON.stringify({ provider: byok }) });
    return result.ok;
  } catch {
    return false;
  }
}

/**
 * The saved tutor key pushed to the runner (`POST /api/learner/provider-key/sync`):
 * for a provider the tutor has a key for but `byok.json` does not — connected
 * before the stores merged, or while the runner was down. False when there is
 * no key to push or the runner did not take it.
 */
export async function syncByokFromSaved(owner: string, provider: ProviderName): Promise<boolean> {
  const byok = TUTOR_TO_BYOK[provider];
  if (byok === undefined || !studioEnabled()) return false;
  const key = (await openSavedKeys(owner))[provider];
  if (key === undefined) return false;
  try {
    const result = await studioApi("/api/settings/byok", { method: "PUT", body: JSON.stringify({ provider: byok, apiKey: key }) });
    return result.ok;
  } catch {
    return false;
  }
}
