import { PROVIDER_IDS, TUTOR_MODEL_LIMITS, type ProviderId } from "@self-learn/schema/shared";

import type { ChainEntry } from "@/lib/agent/providers";
import type { ProviderKeyView, ProviderKeysView } from "@/lib/provider-keys/settings";

/**
 * What the Settings Providers card is handed (docs/TUTOR-MODELS.md, T12):
 * the provider keys and the model chain as one list of providers, each with
 * its key's state and its models in the order the tutor tries them.
 * Provider names, model ids and where a key comes from; never a key.
 */

export interface ProviderRowView extends ProviderKeyView {
  /** This provider's models, in the chain's order. */
  models: string[];
}

export interface ProvidersView {
  /** False when the saved keys could not be read. */
  keysReachable: boolean;
  /** False when the chain could not be read: the tutor uses the built-in defaults. */
  chainReachable: boolean;
  /** No provider has a model, so the tutor uses each keyed provider's built-in default. */
  usingDefaults: boolean;
  /**
   * The providers the card lists, in the order the tutor tries them: those
   * with models in the chain's order, then the rest that have a key (or a
   * model, but no key). With no models at all the tutor walks the built-in
   * defaults, your saved keys before the server's (`orderCredentials`), and
   * the rows follow that order; otherwise the rest follow the built-in order.
   */
  rows: ProviderRowView[];
  /** The providers not listed yet, for Add provider. */
  addable: { id: ProviderId; label: string }[];
  /** The chain holds as many models as it may. */
  full: boolean;
}

export function providersView(keys: ProvidersKeysInput, chain: readonly ChainEntry[], chainReachable: boolean): ProvidersView {
  const byId = new Map(keys.rows.map((row) => [row.id, row]));
  const withModels = [...new Set(chain.map((e) => e.provider))];
  const listed = (id: ProviderId) => {
    const row = byId.get(id);
    return row !== undefined && (row.saved !== null || row.server || withModels.includes(id));
  };
  const rest = PROVIDER_IDS.filter((id) => !withModels.includes(id) && listed(id));
  const rank = (id: ProviderId) => {
    const use = byId.get(id)?.inUse;
    return use === "saved" ? 0 : use === "server" ? 1 : 2;
  };
  const order = [...withModels, ...(chain.length === 0 ? [...rest].sort((a, b) => rank(a) - rank(b)) : rest)];
  const rows = order.flatMap((id): ProviderRowView[] => {
    const row = byId.get(id);
    return row === undefined ? [] : [{ ...row, models: chain.filter((e) => e.provider === id).map((e) => e.model) }];
  });
  return {
    keysReachable: keys.reachable,
    chainReachable,
    usingDefaults: chain.length === 0,
    rows,
    addable: keys.rows.filter((row) => !order.includes(row.id)).map((row) => ({ id: row.id, label: row.label })),
    full: chain.length >= TUTOR_MODEL_LIMITS.maxEntries,
  };
}

type ProvidersKeysInput = Pick<ProviderKeysView, "reachable" | "rows">;
