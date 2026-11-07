import "server-only";

import type { ProviderName } from "@gnosia/schema/shared";
import {
  failureCode,
  openSavedKeys as openSavedKeysCore,
  savedKeyStatuses as savedKeyStatusesCore,
  saveProviderKey as saveProviderKeyCore,
  type SavedKeyStatus,
} from "@gnosia/tutor/server/provider-keys";

import { catalogDatabase } from "@/lib/learner-store";

/**
 * The owner's saved provider keys (docs/BYOK.md). The reads and writes live
 * in `@gnosia/tutor/server/provider-keys`; this file hands them this app's
 * pool and its `process.env`.
 */

export { failureCode };
export type { SavedKeyStatus };

export async function savedKeyStatuses(owner: string): Promise<SavedKeyStatus[]> {
  return savedKeyStatusesCore(await catalogDatabase(), owner, process.env);
}

export async function openSavedKeys(owner: string): Promise<Partial<Record<ProviderName, string>>> {
  return openSavedKeysCore(await catalogDatabase(), owner, process.env);
}

export async function saveProviderKey(owner: string, provider: ProviderName, key: string): Promise<SavedKeyStatus> {
  return saveProviderKeyCore(await catalogDatabase(), owner, provider, key, process.env);
}
