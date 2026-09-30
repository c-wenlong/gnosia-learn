import "server-only";

import type { ProviderId } from "@self-learn/schema/shared";

import {
  type ChainEntry,
  type ChainStep,
  keyFor,
  providerConfigs,
  type ProviderCredential,
  tutorSteps,
} from "@/lib/agent/providers";
import { failureCode, openSavedKeys } from "@/lib/provider-keys/store";
import { readChain } from "@/lib/tutor-models/store";

type Env = Record<string, string | undefined>;

/** The owner's saved keys and model chain, each empty when it cannot be read. */
async function ownerInputs(owner: string): Promise<{ saved: Partial<Record<ProviderId, string>>; chain: ChainEntry[] }> {
  const [saved, chain] = await Promise.all([
    openSavedKeys(owner).catch((error: unknown) => {
      console.warn(`tutor: saved provider keys unavailable (${failureCode(error)}), using the server's`);
      return {};
    }),
    readChain(owner).catch((error: unknown) => {
      console.warn(`tutor: model chain unavailable (${failureCode(error)}), using the built-in defaults`);
      return [];
    }),
  ]);
  return { saved, chain };
}

/**
 * What the tutor tries for this owner, in order (docs/TUTOR-MODELS.md): their
 * model chain when they have one, each entry with the key `keyFor` finds or
 * marked skipped; otherwise the built-in defaults with their saved keys first,
 * then the server's (docs/BYOK.md, decision 4).
 *
 * Per request, never cached: a key or a chain entry changed in Settings
 * applies from the next turn. Never throws: a database that cannot be read
 * costs the saved keys and the chain, not the turn, and the server's keys
 * still answer with the built-in defaults, which is the deployment as it was
 * before either existed. The warnings name a code and nothing else (see
 * `failureCode`).
 */
export async function tutorCredentials(owner: string, env: Env = process.env): Promise<ChainStep[]> {
  const { saved, chain } = await ownerInputs(owner);
  return tutorSteps(chain, saved, env);
}

/**
 * The key the tutor would call one provider with, and the model it would call
 * first with it: the owner's first chain entry for that provider, else the
 * provider's default. Null when nothing holds a key for it. For the key Test.
 */
export async function keyTestCredential(
  owner: string,
  provider: ProviderId,
  env: Env = process.env,
): Promise<ProviderCredential | null> {
  const { saved, chain } = await ownerInputs(owner);
  const config = providerConfigs(env).find((c) => c.id === provider);
  const key = keyFor(provider, saved, env);
  if (config === undefined || key === null) return null;
  const entry = chain.find((e) => e.provider === provider);
  return entry === undefined
    ? { config, ...key, modelFrom: "default" }
    : { config: { ...config, model: entry.model }, ...key, modelFrom: "chain" };
}

/**
 * The call a chain entry's Test or a model list makes: that provider's
 * endpoint, `model` (the provider's default when omitted, which a model list
 * never sends), and the key `keyFor` finds. Null when nothing holds a key for
 * it. Reads the saved keys only; a database that cannot be read leaves the
 * server's key.
 */
export async function entryCredential(
  owner: string,
  provider: ProviderId,
  model?: string,
  env: Env = process.env,
): Promise<ProviderCredential | null> {
  const saved = await openSavedKeys(owner).catch((error: unknown) => {
    console.warn(`tutor: saved provider keys unavailable (${failureCode(error)}), using the server's`);
    return {};
  });
  const config = providerConfigs(env).find((c) => c.id === provider);
  const key = keyFor(provider, saved, env);
  if (config === undefined || key === null) return null;
  return { config: model === undefined ? config : { ...config, model }, ...key, modelFrom: "chain" };
}
