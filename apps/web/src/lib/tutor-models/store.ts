import "server-only";

import {
  addTutorModel,
  deleteTutorProvider,
  moveTutorModel,
  moveTutorProvider,
  readTutorModels,
  removeTutorModel,
} from "@self-learn/catalog/state";
import { groupByProvider } from "@self-learn/schema/shared";

import type { ChainEntry } from "@/lib/agent/providers";
import { catalogDatabase } from "@/lib/learner-store";

/**
 * The web app's side of `tutor_model` (docs/TUTOR-MODELS.md): the owner's
 * model chain, as provider and model pairs, top first, grouped by provider
 * (`groupByProvider`) so a chain stored before the grouping is walked and
 * shown the way its next write will store it.
 *
 * Every function takes the owner, resolved by the caller from the session
 * (`currentOwner()`), and has no default. The catalog functions filter by it,
 * so one owner's request never reads or changes another's chain. A refused
 * change throws the catalog's `TutorModelError`, whose `code` the route maps
 * to a status; a database that cannot be reached throws the driver's error.
 */

function entries(rows: readonly ChainEntry[]): ChainEntry[] {
  return groupByProvider(rows).map((row) => ({ provider: row.provider, model: row.model }));
}

export async function readChain(owner: string): Promise<ChainEntry[]> {
  return entries(await readTutorModels(await catalogDatabase(), owner));
}

/**
 * `serverKey` says whether the environment holds a key for the provider; with
 * none, the catalog checks inside the learner lock that a saved key is still
 * there, so an add that raced the provider's Delete is refused, not stranded.
 */
export async function addChainEntry(owner: string, provider: unknown, model: unknown, serverKey: boolean): Promise<ChainEntry[]> {
  return entries(await addTutorModel(await catalogDatabase(), owner, provider, model, { requireKey: { server: serverKey } }));
}

export async function removeChainEntry(owner: string, provider: unknown, model: unknown): Promise<ChainEntry[]> {
  return entries(await removeTutorModel(await catalogDatabase(), owner, provider, model));
}

export async function moveChainEntry(
  owner: string,
  provider: unknown,
  model: unknown,
  direction: "up" | "down",
): Promise<ChainEntry[]> {
  return entries(await moveTutorModel(await catalogDatabase(), owner, provider, model, direction));
}

/** Move a provider's models together one provider up or down. */
export async function moveChainProvider(owner: string, provider: unknown, direction: "up" | "down"): Promise<ChainEntry[]> {
  return entries(await moveTutorProvider(await catalogDatabase(), owner, provider, direction));
}

/** A provider's Delete: its models and the owner's saved key for it, in one transaction. */
export async function deleteChainProvider(owner: string, provider: unknown): Promise<{ chain: ChainEntry[]; keyRemoved: boolean }> {
  const { chain, keyRemoved } = await deleteTutorProvider(await catalogDatabase(), owner, provider);
  return { chain: entries(chain), keyRemoved };
}
