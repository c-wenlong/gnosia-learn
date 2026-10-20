import { createHash } from "node:crypto";

import type { ProviderName } from "@self-learn/schema/shared";

import { listProviderModels, type ModelListResult, type ProviderCredential } from "../providers";

/**
 * A provider's model list for Settings' Add a model, cached in this server's
 * memory per owner and provider for a few minutes (docs/TUTOR-MODELS.md, T2).
 *
 * The list is the same for every visit to the form, and OpenRouter's is about
 * 2 MB, so a person opening the form twice should not fetch it twice. Only a
 * list that came back is cached; a failure is asked again next time.
 *
 * Each entry remembers a fingerprint of the key and base URL it was fetched
 * with (a truncated SHA-256, never the key), and a read under a different one
 * misses: a key replaced in Settings, or an operator's new base URL, fetches
 * afresh rather than showing the old account's list. The cache holds model
 * ids and nothing else the provider sent.
 */

export const MODEL_LIST_TTL_MS = 5 * 60_000;

/** Entries kept at most; the oldest goes first. One owner has three. */
const MAX_ENTRIES = 64;

interface Entry {
  fingerprint: string;
  at: number;
  result: Extract<ModelListResult, { ok: true }>;
}

const cache = new Map<string, Entry>();

function fingerprint(credential: ProviderCredential): string {
  return createHash("sha256")
    .update(`${credential.config.baseUrl}\u0000${credential.apiKey}`)
    .digest("hex")
    .slice(0, 16);
}

function slot(owner: string, provider: ProviderName): string {
  return `${owner}\u0000${provider}`;
}

/** The list for this owner's provider, from the cache when it is fresh and was fetched with this key. */
export async function cachedModelList(
  owner: string,
  credential: ProviderCredential,
  now: () => number = Date.now,
): Promise<ModelListResult & { cached: boolean }> {
  const key = slot(owner, credential.config.id);
  const print = fingerprint(credential);
  const hit = cache.get(key);
  if (hit !== undefined && hit.fingerprint === print && now() - hit.at < MODEL_LIST_TTL_MS) {
    return { ...hit.result, cached: true };
  }
  const result = await listProviderModels(credential);
  if (result.ok) {
    cache.delete(key);
    cache.set(key, { fingerprint: print, at: now(), result });
    while (cache.size > MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }
  return { ...result, cached: false };
}

/** Test hook: forget every cached list. */
export function clearModelListCache(): void {
  cache.clear();
}
