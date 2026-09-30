import "server-only";

import { orderCredentials, type ProviderCredential } from "@/lib/agent/providers";
import { failureCode, openSavedKeys } from "@/lib/provider-keys/store";

/**
 * The keys the tutor calls with for this owner (docs/BYOK.md, decision 4):
 * their saved keys first, then the server's, in `orderCredentials`' order.
 *
 * Per request, never cached: a key saved or removed in Settings applies from
 * the next turn. Never throws: a database that cannot be read costs the saved
 * keys, not the turn, and the server's keys still answer. The warning names a
 * code and nothing else (see `failureCode`).
 */
export async function tutorCredentials(
  owner: string,
  env: Record<string, string | undefined> = process.env,
): Promise<ProviderCredential[]> {
  let saved: Awaited<ReturnType<typeof openSavedKeys>> = {};
  try {
    saved = await openSavedKeys(owner);
  } catch (error) {
    console.warn(`tutor: saved provider keys unavailable (${failureCode(error)}), using the server's`);
  }
  return orderCredentials(saved, env);
}
