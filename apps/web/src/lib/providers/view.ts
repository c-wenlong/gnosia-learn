import type { ChainEntry } from "@/lib/agent/providers";
import type { ProviderKeyView, ProviderKeysView } from "@/lib/provider-keys/settings";

/**
 * What the Settings Providers card is handed (docs/TUTOR-MODELS.md): every
 * provider the owner could connect — each built-in in the cascade's order,
 * keyed or not, then every custom provider — with its key's state and its
 * models in the chain's order. Provider names, model ids and where a key
 * comes from; never a key. One list serves the whole Models tab: the picks
 * under Model selection read the same rows.
 */
export interface ProviderRowView extends ProviderKeyView {
  /** This provider's models in the model chain's order (T15). */
  models: string[];
}

export interface ProvidersView {
  /** False when the saved keys could not be read. */
  keysReachable: boolean;
  /** False when the chain could not be read: the tutor has nothing to call. */
  chainReachable: boolean;
  /** No provider has a model, so the tutor has nothing to call (T15). */
  usingDefaults: boolean;
  /** Every provider, keyed or not. An unkeyed row is where its key goes. */
  rows: ProviderRowView[];
}

export function providersView(keys: ProvidersKeysInput, chain: readonly ChainEntry[], chainReachable: boolean): ProvidersView {
  return {
    keysReachable: keys.reachable,
    chainReachable,
    usingDefaults: chain.length === 0,
    rows: keys.rows.map((row) => ({
      ...row,
      models: chain.filter((e) => e.provider === row.id).map((e) => e.model),
    })),
  };
}

type ProvidersKeysInput = Pick<ProviderKeysView, "reachable" | "rows">;
