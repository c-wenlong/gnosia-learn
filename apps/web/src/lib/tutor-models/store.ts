import "server-only";

import {
  addChainEntry as addChainEntryCore,
  deleteChainProvider as deleteChainProviderCore,
  moveChainEntry as moveChainEntryCore,
  moveChainProvider as moveChainProviderCore,
  readChain as readChainCore,
  removeChainEntry as removeChainEntryCore,
  setChainEntry as setChainEntryCore,
} from "@gnosia/tutor/server/tutor-models";
import type { ChainEntry } from "@gnosia/tutor/providers";

import { catalogDatabase } from "@/lib/learner-store";

/**
 * The owner's model chain (docs/TUTOR-MODELS.md). The reads and writes live
 * in `@gnosia/tutor/server/tutor-models`; this file hands them this
 * app's pool.
 */

export async function readChain(owner: string): Promise<ChainEntry[]> {
  return readChainCore(await catalogDatabase(), owner);
}

export async function addChainEntry(owner: string, provider: unknown, model: unknown, serverKey: boolean): Promise<ChainEntry[]> {
  return addChainEntryCore(await catalogDatabase(), owner, provider, model, serverKey);
}

/** The whole chain becomes this one entry, in one locked rewrite — a refused write keeps the chain it would have replaced. */
export async function setChainEntry(owner: string, provider: unknown, model: unknown, serverKey: boolean): Promise<ChainEntry[]> {
  return setChainEntryCore(await catalogDatabase(), owner, provider, model, serverKey);
}

export async function removeChainEntry(owner: string, provider: unknown, model: unknown): Promise<ChainEntry[]> {
  return removeChainEntryCore(await catalogDatabase(), owner, provider, model);
}

export async function moveChainEntry(
  owner: string,
  provider: unknown,
  model: unknown,
  direction: "up" | "down",
): Promise<ChainEntry[]> {
  return moveChainEntryCore(await catalogDatabase(), owner, provider, model, direction);
}

/** Move a provider's models together one provider up or down. */
export async function moveChainProvider(owner: string, provider: unknown, direction: "up" | "down"): Promise<ChainEntry[]> {
  return moveChainProviderCore(await catalogDatabase(), owner, provider, direction);
}

/** A provider's Delete: its models and the owner's saved key for it, in one transaction. */
export async function deleteChainProvider(owner: string, provider: unknown): Promise<{ chain: ChainEntry[]; keyRemoved: boolean }> {
  return deleteChainProviderCore(await catalogDatabase(), owner, provider);
}
