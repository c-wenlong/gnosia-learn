import "server-only";

import {
  addChainEntry as addChainEntryCore,
  readChain as readChainCore,
  removeChainEntry as removeChainEntryCore,
} from "@hermes/tutor/server/tutor-models";
import type { ChainEntry } from "@hermes/tutor/providers";

import { catalogDatabase } from "@/lib/learner-store";

/**
 * The owner's model chain (docs/TUTOR-MODELS.md). The reads and writes live
 * in `@hermes/tutor/server/tutor-models`; this file hands them this
 * app's pool.
 */

export async function readChain(owner: string): Promise<ChainEntry[]> {
  return readChainCore(await catalogDatabase(), owner);
}

export async function addChainEntry(owner: string, provider: unknown, model: unknown, serverKey: boolean): Promise<ChainEntry[]> {
  return addChainEntryCore(await catalogDatabase(), owner, provider, model, serverKey);
}

export async function removeChainEntry(owner: string, provider: unknown, model: unknown): Promise<ChainEntry[]> {
  return removeChainEntryCore(await catalogDatabase(), owner, provider, model);
}
