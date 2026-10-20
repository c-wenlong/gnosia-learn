import "server-only";

import {
  addCustomProvider,
  readCustomProviders,
  type StoredCustomProvider,
  updateCustomProvider,
} from "@gnosia/catalog/state";
import { isCustomProviderId } from "@gnosia/schema/shared";

import { catalogDatabase } from "@/lib/learner-store";
import { keySealer, type SavedKeyStatus, savedStatus } from "@/lib/provider-keys/store";

/**
 * The web app's side of `custom_provider` (docs/TUTOR-MODELS.md, T14): the
 * providers the owner added, by name and base URL. Every function takes the
 * owner, resolved by the caller from the session, and has no default. A
 * refused change throws the catalog's `CustomProviderError`, and a key with
 * no `AUTH_SECRET` to seal it `NoKeySecretError`, before anything is written.
 * A key given here is stored in the transaction that writes the provider.
 */

export type CustomProvider = Pick<StoredCustomProvider, "id" | "label" | "baseUrl">;

function view(row: StoredCustomProvider): CustomProvider {
  return { id: row.id, label: row.label, baseUrl: row.baseUrl };
}

export async function readOwnerCustomProviders(owner: string): Promise<CustomProvider[]> {
  return (await readCustomProviders(await catalogDatabase(), owner)).map(view);
}

/** Add a provider with its key, both or neither. */
export async function createCustomProvider(
  owner: string,
  input: { label: unknown; baseUrl: unknown },
  key: string,
): Promise<{ provider: CustomProvider; key: SavedKeyStatus }> {
  const seal = keySealer(owner, key);
  const added = await addCustomProvider(await catalogDatabase(), owner, input, seal);
  return { provider: view(added.provider), key: savedStatus(added.provider.id, added.key) };
}

/** Rename or move a provider, and replace its key when one is given, all in one write. */
export async function changeCustomProvider(
  owner: string,
  id: unknown,
  input: { label?: unknown; baseUrl?: unknown },
  key?: string,
): Promise<{ provider: CustomProvider; key: SavedKeyStatus | null }> {
  const sealed = key === undefined || !isCustomProviderId(id) ? undefined : keySealer(owner, key)(id);
  const changed = await updateCustomProvider(await catalogDatabase(), owner, id, input, sealed);
  return { provider: view(changed.provider), key: changed.key === null ? null : savedStatus(changed.provider.id, changed.key) };
}
