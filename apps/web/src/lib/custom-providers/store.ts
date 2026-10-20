import "server-only";

import {
  changeCustomProvider as changeCustomProviderCore,
  createCustomProvider as createCustomProviderCore,
  readOwnerCustomProviders as readOwnerCustomProvidersCore,
  type CustomProvider,
} from "@self-learn/tutor/server/custom-providers";
import type { SavedKeyStatus } from "@self-learn/tutor/server/provider-keys";

import { catalogDatabase } from "@/lib/learner-store";

/**
 * The providers the owner adds themselves (docs/TUTOR-MODELS.md, T14). The
 * reads and writes live in `@self-learn/tutor/server/custom-providers`; this
 * file hands them this app's pool.
 */

export type { CustomProvider };

export async function readOwnerCustomProviders(owner: string): Promise<CustomProvider[]> {
  return readOwnerCustomProvidersCore(await catalogDatabase(), owner);
}

/** Add a provider with its key, both or neither. */
export async function createCustomProvider(
  owner: string,
  input: { label: unknown; baseUrl: unknown },
  key: string,
): Promise<{ provider: CustomProvider; key: SavedKeyStatus }> {
  return createCustomProviderCore(await catalogDatabase(), owner, input, key, process.env);
}

/** Rename or move a provider, and replace its key when one is given, all in one write. */
export async function changeCustomProvider(
  owner: string,
  id: unknown,
  input: { label?: unknown; baseUrl?: unknown },
  key?: string,
): Promise<{ provider: CustomProvider; key: SavedKeyStatus | null }> {
  return changeCustomProviderCore(await catalogDatabase(), owner, id, input, key, process.env);
}
