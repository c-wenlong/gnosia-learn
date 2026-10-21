import "server-only";

import type { ProviderName } from "@gnosia/schema/shared";
import {
  failureCode,
  keySecret,
  keySealer as keySealerCore,
  NoKeySecretError,
  openSavedKeys as openSavedKeysCore,
  removeProviderKey as removeProviderKeyCore,
  savedKeyStatuses as savedKeyStatusesCore,
  saveProviderKey as saveProviderKeyCore,
  savedStatus,
  type SavedKeyStatus,
} from "@gnosia/tutor/server/provider-keys";

import { catalogDatabase } from "@/lib/learner-store";

/**
 * The owner's saved provider keys (docs/BYOK.md). The reads and writes live
 * in `@gnosia/tutor/server/provider-keys`, which the native sidecar calls
 * with its own pool; this file hands them this app's pool and its
 * `process.env`.
 */

export { failureCode, keySecret, NoKeySecretError, savedStatus };
export type { SavedKeyStatus };

export async function savedKeyStatuses(owner: string): Promise<SavedKeyStatus[]> {
  return savedKeyStatusesCore(await catalogDatabase(), owner, process.env);
}

export async function openSavedKeys(owner: string): Promise<Partial<Record<ProviderName, string>>> {
  return openSavedKeysCore(await catalogDatabase(), owner, process.env);
}

export function keySealer(owner: string, key: string): ReturnType<typeof keySealerCore> {
  return keySealerCore(process.env, owner, key);
}

export async function saveProviderKey(owner: string, provider: ProviderName, key: string): Promise<SavedKeyStatus> {
  return saveProviderKeyCore(await catalogDatabase(), owner, provider, key, process.env);
}

export async function removeProviderKey(owner: string, provider: ProviderName): Promise<boolean> {
  return removeProviderKeyCore(await catalogDatabase(), owner, provider);
}
