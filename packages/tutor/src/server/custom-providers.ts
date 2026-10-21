import {
  addCustomProvider,
  readCustomProviders,
  type CatalogDatabase,
  type StoredCustomProvider,
  updateCustomProvider,
} from "@gnosia/catalog/state";
import { isCustomProviderId } from "@gnosia/schema/shared";

import type { Env } from "./deps";
import { keySealer, type SavedKeyStatus, savedStatus } from "./provider-keys";

/**
 * The providers the owner adds themselves (docs/TUTOR-MODELS.md, T14), the
 * request-independent half of `apps/web/src/lib/custom-providers/store.ts`.
 */

export type CustomProvider = Pick<StoredCustomProvider, "id" | "label" | "baseUrl">;

function view(row: StoredCustomProvider): CustomProvider {
  return { id: row.id, label: row.label, baseUrl: row.baseUrl };
}

export async function readOwnerCustomProviders(
  db: CatalogDatabase,
  owner: string,
): Promise<CustomProvider[]> {
  return (await readCustomProviders(db, owner)).map(view);
}

/** Add a provider with its key, both or neither. */
export async function createCustomProvider(
  db: CatalogDatabase,
  owner: string,
  input: { label: unknown; baseUrl: unknown },
  key: string,
  env: Env = process.env,
): Promise<{ provider: CustomProvider; key: SavedKeyStatus }> {
  const seal = keySealer(env, owner, key);
  const added = await addCustomProvider(db, owner, input, seal);
  return { provider: view(added.provider), key: savedStatus(added.provider.id, added.key) };
}

/** Rename or move a provider, and replace its key when one is given, all in one write. */
export async function changeCustomProvider(
  db: CatalogDatabase,
  owner: string,
  id: unknown,
  input: { label?: unknown; baseUrl?: unknown },
  key?: string,
  env: Env = process.env,
): Promise<{ provider: CustomProvider; key: SavedKeyStatus | null }> {
  const sealed = key === undefined || !isCustomProviderId(id) ? undefined : keySealer(env, owner, key)(id);
  const changed = await updateCustomProvider(db, owner, id, input, sealed);
  return { provider: view(changed.provider), key: changed.key === null ? null : savedStatus(changed.provider.id, changed.key) };
}
