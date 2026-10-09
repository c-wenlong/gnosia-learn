import "server-only";

import type { ChainEntry } from "@/lib/agent/providers";
import { failureCode } from "@/lib/provider-keys/store";
import { readChain } from "@/lib/tutor-models/store";

/**
 * What the Settings page's Model selection card is handed
 * (docs/TUTOR-MODELS.md): the owner's chain, whose first entry is the pick
 * the tutor calls. Provider names and model ids; never a key.
 */

export interface TutorModelsView {
  /** False when the chain could not be read: the card says so and the tutor calls nothing until it is back. */
  reachable: boolean;
  chain: ChainEntry[];
}

/** The card's data for this owner. Never throws: an unreadable chain shows as unreachable and empty. */
export async function loadTutorModels(owner: string): Promise<TutorModelsView> {
  try {
    return { reachable: true, chain: await readChain(owner) };
  } catch (error) {
    console.warn(`settings: model chain unavailable (${failureCode(error)})`);
    return { reachable: false, chain: [] };
  }
}
