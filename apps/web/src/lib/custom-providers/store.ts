import "server-only";

import {
  addCustomProvider,
  readCustomProviders,
  type StoredCustomProvider,
  updateCustomProvider,
} from "@self-learn/catalog/state";

import { catalogDatabase } from "@/lib/learner-store";

/**
 * The web app's side of `custom_provider` (docs/TUTOR-MODELS.md, T14): the
 * providers the owner added, by name and base URL. Every function takes the
 * owner, resolved by the caller from the session, and has no default. A
 * refused change throws the catalog's `CustomProviderError`.
 */

export type CustomProvider = Pick<StoredCustomProvider, "id" | "label" | "baseUrl">;

function view(row: StoredCustomProvider): CustomProvider {
  return { id: row.id, label: row.label, baseUrl: row.baseUrl };
}

export async function readOwnerCustomProviders(owner: string): Promise<CustomProvider[]> {
  return (await readCustomProviders(await catalogDatabase(), owner)).map(view);
}

export async function createCustomProvider(owner: string, input: { label: unknown; baseUrl: unknown }): Promise<CustomProvider> {
  return view(await addCustomProvider(await catalogDatabase(), owner, input));
}

export async function changeCustomProvider(
  owner: string,
  id: unknown,
  input: { label?: unknown; baseUrl?: unknown },
): Promise<CustomProvider> {
  return view(await updateCustomProvider(await catalogDatabase(), owner, id, input));
}
