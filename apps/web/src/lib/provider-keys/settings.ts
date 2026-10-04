import "server-only";

import type { ProviderName } from "@self-learn/schema/shared";

import { customProviderConfig, providerConfigs, type KeySource } from "@/lib/agent/providers";
import { type CustomProvider, readOwnerCustomProviders } from "@/lib/custom-providers/store";
import { failureCode, savedKeyStatuses, type SavedKeyStatus } from "@/lib/provider-keys/store";

/**
 * What the Settings page's Provider keys card is handed (docs/BYOK.md): per
 * provider, whether the owner saved a key (its last four characters and the
 * day, never the key), whether the server holds one, and which of the two the
 * tutor uses. Built on the server; the client component gets exactly this.
 */

export interface ProviderKeyView {
  id: ProviderName;
  label: string;
  model: string;
  /** Where a person makes a key for this provider. */
  keyUrl?: string;
  /** A provider the owner added (T14): its base URL. Absent for a built-in. */
  custom?: { baseUrl: string };
  saved: {
    last4: string;
    /** The day of the last save, already formatted, so server and browser render the same text. */
    savedOn: string;
    /** False when it no longer decrypts: Settings asks for it again. */
    readable: boolean;
  } | null;
  /** The server's environment holds a key for this provider. */
  server: boolean;
  /** Whose key the tutor calls this provider with now, or null when it has none. */
  inUse: KeySource | null;
}

export interface ProviderKeysView {
  /** False when the saved keys could not be read; `rows` then shows the server's keys only. */
  reachable: boolean;
  rows: ProviderKeyView[];
  /** The cascade as the tutor will try it: the owner's keys first, then the server's. */
  order: { id: ProviderName; label: string; source: KeySource }[];
}

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** The pure half: saved statuses and the environment in, the card's rows and order out. */
export function providerKeyViews(
  statuses: readonly SavedKeyStatus[],
  env: Record<string, string | undefined>,
  reachable: boolean,
  custom: readonly CustomProvider[] = [],
): ProviderKeysView {
  const byProvider = new Map<string, SavedKeyStatus>(statuses.map((s) => [s.provider, s]));
  const configs = [...providerConfigs(env), ...custom.map(customProviderConfig)];
  const rows = configs.map((config): ProviderKeyView => {
    const status = byProvider.get(config.id);
    const server = config.apiKeyEnv !== "" && Boolean(env[config.apiKeyEnv]?.trim());
    const own = status?.readable === true;
    return {
      id: config.id,
      label: config.label,
      model: config.model,
      ...(config.keyUrl === undefined ? {} : { keyUrl: config.keyUrl }),
      ...(config.custom ? { custom: { baseUrl: config.baseUrl } } : {}),
      saved: status === undefined ? null : { last4: status.last4, savedOn: DAY.format(new Date(status.updatedAt)), readable: status.readable },
      server,
      inUse: own ? "saved" : server ? "server" : null,
    };
  });
  // The same rule as `orderCredentials`: the owner's usable keys in the
  // cascade's order, then the server's for the rest. A custom provider has
  // no built-in default, so it is never in this order (T14).
  const builtIn = rows.filter((r) => r.custom === undefined);
  const order = [
    ...builtIn.filter((r) => r.inUse === "saved"),
    ...builtIn.filter((r) => r.inUse === "server"),
  ].map((r) => ({ id: r.id, label: `${r.label} (${r.model})`, source: r.inUse as KeySource }));
  return { reachable, rows, order };
}

/** The card's data for this owner. Never throws: an unreadable database shows the server's keys alone. */
export async function loadProviderKeys(owner: string): Promise<ProviderKeysView> {
  try {
    const [statuses, custom] = await Promise.all([savedKeyStatuses(owner), readOwnerCustomProviders(owner)]);
    return providerKeyViews(statuses, process.env, true, custom);
  } catch (error) {
    console.warn(`settings: saved provider keys unavailable (${failureCode(error)})`);
    return providerKeyViews([], process.env, false);
  }
}

