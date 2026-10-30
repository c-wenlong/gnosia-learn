import "server-only";

import type { ProviderName } from "@gnosia/schema/shared";

import { TUTOR_TO_BYOK } from "@/lib/byok-providers";
import { studioApi, studioEnabled } from "@/lib/studio";

/**
 * Keeping Studio's provider list in step with the keys saved in Settings
 * (D95 of docs/STUDIO-CHAT-FIRST.md). The runner reads each key itself, sealed,
 * from the catalog when a turn spawns (docs/BYOK.md, D12), so nothing here
 * sends a key: these calls only tell the runner which providers Studio uses.
 * Each returns `undefined` when there was nothing to tell (not a BYOK
 * preset, or the studio is off), else whether the runner took it.
 */

/** A provider whose key was just saved joins Studio's list, without moving Studio's pick (`activate: false`). */
export async function connectByokProvider(provider: ProviderName): Promise<boolean | undefined> {
  const byok = TUTOR_TO_BYOK[provider];
  if (byok === undefined || !studioEnabled()) return undefined;
  try {
    const result = await studioApi("/api/settings/byok", { method: "PUT", body: JSON.stringify({ provider: byok, activate: false }) });
    return result.ok;
  } catch {
    return false;
  }
}

/** A provider whose key was just removed leaves Studio's list too: its tiers and the active pick. */
export async function dropByokProvider(provider: ProviderName): Promise<boolean | undefined> {
  const byok = TUTOR_TO_BYOK[provider];
  if (byok === undefined || !studioEnabled()) return undefined;
  try {
    const result = await studioApi("/api/settings/byok", { method: "DELETE", body: JSON.stringify({ provider: byok }) });
    return result.ok;
  } catch {
    return false;
  }
}
