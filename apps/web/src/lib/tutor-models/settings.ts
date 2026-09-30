import "server-only";

import type { ProviderId } from "@self-learn/schema/shared";

import type { ChainEntry, KeySource } from "@/lib/agent/providers";
import type { ProviderKeysView } from "@/lib/provider-keys/settings";
import { failureCode } from "@/lib/provider-keys/store";
import { readChain } from "@/lib/tutor-models/store";

/**
 * What the Settings page's Models card is handed (docs/TUTOR-MODELS.md): the
 * owner's chain, every provider with whose key the tutor would call it, and
 * the built-in defaults the tutor uses while the chain is empty. Provider
 * names, model ids and where a key comes from; never a key.
 */

export interface TutorModelsView {
  /** False when the chain could not be read: the card says so and the tutor uses the defaults. */
  reachable: boolean;
  chain: ChainEntry[];
  /** Every provider, in the built-in order, with whose key the tutor calls it, or null for none. */
  providers: { id: ProviderId; label: string; key: KeySource | null }[];
  /** The built-in defaults the tutor tries with no chain, in order, for the providers that have a key. */
  defaults: { id: ProviderId; label: string; model: string; key: KeySource }[];
}

/** The pure half: the Provider keys card's data and the chain in, the Models card's out. */
export function tutorModelsView(keys: ProviderKeysView, chain: ChainEntry[], reachable: boolean): TutorModelsView {
  return {
    reachable,
    chain,
    providers: keys.rows.map((row) => ({ id: row.id, label: row.label, key: row.inUse })),
    defaults: keys.order.map((entry) => {
      const row = keys.rows.find((r) => r.id === entry.id);
      return { id: entry.id, label: row?.label ?? entry.id, model: row?.model ?? "", key: entry.source };
    }),
  };
}

/** The card's data for this owner. Never throws: an unreadable chain shows as unreachable and empty. */
export async function loadTutorModels(owner: string, keys: ProviderKeysView): Promise<TutorModelsView> {
  try {
    return tutorModelsView(keys, await readChain(owner), true);
  } catch (error) {
    console.warn(`settings: model chain unavailable (${failureCode(error)})`);
    return tutorModelsView(keys, [], false);
  }
}
