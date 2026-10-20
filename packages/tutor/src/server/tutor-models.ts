import {
  addTutorModel,
  deleteTutorProvider,
  moveTutorModel,
  moveTutorProvider,
  readTutorModels,
  removeTutorModel,
  setTutorModel,
  type CatalogDatabase,
} from "@self-learn/catalog/state";
import { groupByProvider } from "@self-learn/schema/shared";

import type { ChainEntry } from "../providers";

/**
 * The owner's model chain (docs/TUTOR-MODELS.md), the request-independent
 * half of `apps/web/src/lib/tutor-models/store.ts`: the database handle is a
 * parameter, so the Next app and the sidecar read the same rows.
 */

function entries(rows: readonly ChainEntry[]): ChainEntry[] {
  return groupByProvider(rows).map((row) => ({ provider: row.provider, model: row.model }));
}

export async function readChain(db: CatalogDatabase, owner: string): Promise<ChainEntry[]> {
  return entries(await readTutorModels(db, owner));
}

export async function addChainEntry(
  db: CatalogDatabase,
  owner: string,
  provider: unknown,
  model: unknown,
  serverKey: boolean,
): Promise<ChainEntry[]> {
  return entries(await addTutorModel(db, owner, provider, model, { requireKey: { server: serverKey } }));
}

/** The whole chain becomes this one entry, in one locked rewrite — a refused write keeps the chain it would have replaced. */
export async function setChainEntry(
  db: CatalogDatabase,
  owner: string,
  provider: unknown,
  model: unknown,
  serverKey: boolean,
): Promise<ChainEntry[]> {
  return entries(await setTutorModel(db, owner, provider, model, { requireKey: { server: serverKey } }));
}

export async function removeChainEntry(
  db: CatalogDatabase,
  owner: string,
  provider: unknown,
  model: unknown,
): Promise<ChainEntry[]> {
  return entries(await removeTutorModel(db, owner, provider, model));
}

export async function moveChainEntry(
  db: CatalogDatabase,
  owner: string,
  provider: unknown,
  model: unknown,
  direction: "up" | "down",
): Promise<ChainEntry[]> {
  return entries(await moveTutorModel(db, owner, provider, model, direction));
}

/** Move a provider's models together one provider up or down. */
export async function moveChainProvider(
  db: CatalogDatabase,
  owner: string,
  provider: unknown,
  direction: "up" | "down",
): Promise<ChainEntry[]> {
  return entries(await moveTutorProvider(db, owner, provider, direction));
}

/** A provider's Delete: its models and the owner's saved key for it, in one transaction. */
export async function deleteChainProvider(
  db: CatalogDatabase,
  owner: string,
  provider: unknown,
): Promise<{ chain: ChainEntry[]; keyRemoved: boolean }> {
  const { chain, keyRemoved } = await deleteTutorProvider(db, owner, provider);
  return { chain: entries(chain), keyRemoved };
}
