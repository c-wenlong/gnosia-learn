import "server-only";

import type { ProviderName } from "@self-learn/schema/shared";

import {
  type ChainEntry,
  type ChainStep,
  customProviderConfig,
  keyFor,
  keyTestModel,
  providerConfigs,
  type ProviderConfig,
  type ProviderCredential,
  type SavedKeys,
  tutorSteps,
} from "@/lib/agent/providers";
import { readOwnerCustomProviders } from "@/lib/custom-providers/store";
import { failureCode, openSavedKeys } from "@/lib/provider-keys/store";
import { readChain } from "@/lib/tutor-models/store";

type Env = Record<string, string | undefined>;

/** The owner's saved keys and model chain, each empty when it cannot be read. */
async function ownerInputs(owner: string): Promise<{ saved: SavedKeys; chain: ChainEntry[]; custom: ProviderConfig[] }> {
  const [saved, chain, custom] = await Promise.all([
    openSavedKeys(owner).catch((error: unknown) => {
      console.warn(`tutor: saved provider keys unavailable (${failureCode(error)}), using the server's`);
      return {};
    }),
    readChain(owner).catch((error: unknown) => {
      console.warn(`tutor: model chain unavailable (${failureCode(error)}), the tutor has no chain`);
      return [];
    }),
    customConfigs(owner),
  ]);
  return { saved, chain, custom };
}

/**
 * The owner's own providers as the tutor calls them (T14). Empty when they
 * cannot be read: their chain entries then have no config and are left out,
 * as an entry for a provider this build does not know would be.
 */
async function customConfigs(owner: string): Promise<ProviderConfig[]> {
  try {
    return (await readOwnerCustomProviders(owner)).map(customProviderConfig);
  } catch (error) {
    console.warn(`tutor: custom providers unavailable (${failureCode(error)})`);
    return [];
  }
}

/**
 * What the tutor tries for this owner, in order (docs/TUTOR-MODELS.md): their
 * model chain alone, each entry with the key `keyFor` finds or marked
 * skipped. No chain means no steps — the built-in defaults are gone (T15),
 * so the tutor calls only models the owner added.
 *
 * Per request, never cached: a key or a chain entry changed in Settings
 * applies from the next turn. Never throws: a database that cannot be read
 * costs the saved keys and the chain, not the turn. The warnings name a
 * code and nothing else (see `failureCode`).
 */
export async function tutorCredentials(owner: string, env: Env = process.env): Promise<ChainStep[]> {
  const { saved, chain, custom } = await ownerInputs(owner);
  return tutorSteps(chain, saved, env, custom);
}

/**
 * The key the tutor would call one provider with, and the model it would call
 * first with it: the owner's first chain entry for that provider, else the
 * provider's default. Null when nothing holds a key for it. For the key Test.
 */
export async function keyTestCredential(
  owner: string,
  provider: ProviderName,
  env: Env = process.env,
): Promise<ProviderCredential | null> {
  const { saved, chain, custom } = await ownerInputs(owner);
  const config = [...providerConfigs(env), ...custom].find((c) => c.id === provider);
  const key = keyFor(provider, saved, env);
  if (config === undefined || key === null) return null;
  const { model, modelFrom } = keyTestModel(chain, provider, env);
  return { config: { ...config, model }, ...key, modelFrom };
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
  provider: ProviderName,
  model?: string,
  env: Env = process.env,
): Promise<ProviderCredential | null> {
  const saved = await openSavedKeys(owner).catch((error: unknown) => {
    console.warn(`tutor: saved provider keys unavailable (${failureCode(error)}), using the server's`);
    return {};
  });
  const custom = provider.startsWith("custom-") ? await customConfigs(owner) : [];
  const config = [...providerConfigs(env), ...custom].find((c) => c.id === provider);
  const key = keyFor(provider, saved, env);
  if (config === undefined || key === null) return null;
  return { config: model === undefined ? config : { ...config, model }, ...key, modelFrom: "chain" };
}
