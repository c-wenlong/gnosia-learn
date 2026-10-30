import type { CatalogDatabase } from "@gnosia/catalog/state";
import type { ProviderName } from "@gnosia/schema/shared";

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
} from "../providers";
import { readOwnerCustomProviders } from "./custom-providers";
import type { Env } from "./deps";
import { failureCode, openSavedKeys } from "./provider-keys";
import { pointsAtThisApp } from "./self-address";
import { readChain } from "./tutor-models";

/**
 * The owner's provider credentials (docs/BYOK.md, docs/TUTOR-MODELS.md): the
 * request-independent half of `apps/web/src/lib/agent/credentials.ts`.
 *
 * `db` arrives as a promise, not a resolved handle: a database that cannot be
 * reached rejects it inside whichever read asks first, and that read's own
 * catch decides the cost — saved keys fall back to the server's env keys, a
 * missing chain is an empty chain. None of these functions throws for it.
 */

/**
 * The owner's saved keys and model chain, each empty when it cannot be read.
 * `openSavedKeys` takes `process.env` rather than the caller's `env` on
 * purpose: `env` is the *provider* map the request resolves keys and models
 * against (a test hands in `{}` for "the server holds no key"), while the
 * `AUTH_SECRET` the saved keys are sealed under is the process's own and is
 * never part of that map.
 */
async function ownerInputs(
  db: Promise<CatalogDatabase>,
  owner: string,
): Promise<{ saved: SavedKeys; chain: ChainEntry[]; custom: ProviderConfig[] }> {
  const [saved, chain, custom] = await Promise.all([
    db
      .then((handle) => openSavedKeys(handle, owner, process.env))
      .catch((error: unknown) => {
        console.warn(`tutor: saved provider keys unavailable (${failureCode(error)}), using the server's`);
        return {};
      }),
    db
      .then((handle) => readChain(handle, owner))
      .catch((error: unknown) => {
        console.warn(`tutor: model chain unavailable (${failureCode(error)}), the tutor has no chain`);
        return [];
      }),
    customConfigs(db, owner),
  ]);
  return { saved, chain, custom };
}

/**
 * The owner's own providers as the tutor calls them (T14). Empty when they
 * cannot be read: their chain entries then have no config and are left out,
 * as an entry for a provider this build does not know would be. A provider
 * whose base URL is this app or the studio runner (`pointsAtThisApp`), saved
 * before that was refused or written by hand, is left out the same way, so
 * neither a turn nor Test sends the owner's key there.
 */
async function customConfigs(db: Promise<CatalogDatabase>, owner: string): Promise<ProviderConfig[]> {
  try {
    const rows = await readOwnerCustomProviders(await db, owner);
    return rows
      .filter((row) => {
        if (!pointsAtThisApp(row.baseUrl, process.env)) return true;
        console.warn(`tutor: custom provider ${row.id} points at this app or its studio runner, left out`);
        return false;
      })
      .map(customProviderConfig);
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
export async function tutorCredentials(
  db: Promise<CatalogDatabase>,
  owner: string,
  env: Env = process.env,
): Promise<ChainStep[]> {
  const { saved, chain, custom } = await ownerInputs(db, owner);
  return tutorSteps(chain, saved, env, custom);
}

/**
 * The key the tutor would call one provider with, and the model it would call
 * first with it: the owner's first chain entry for that provider, else the
 * provider's default. Null when nothing holds a key for it. For the key Test.
 */
export async function keyTestCredential(
  db: Promise<CatalogDatabase>,
  owner: string,
  provider: ProviderName,
  env: Env = process.env,
): Promise<ProviderCredential | null> {
  const { saved, chain, custom } = await ownerInputs(db, owner);
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
  db: Promise<CatalogDatabase>,
  owner: string,
  provider: ProviderName,
  model?: string,
  env: Env = process.env,
): Promise<ProviderCredential | null> {
  // process.env here for the same reason as in `ownerInputs` above.
  const saved = await db
    .then((handle) => openSavedKeys(handle, owner, process.env))
    .catch((error: unknown) => {
      console.warn(`tutor: saved provider keys unavailable (${failureCode(error)}), using the server's`);
      return {};
    });
  const custom = provider.startsWith("custom-") ? await customConfigs(db, owner) : [];
  const config = [...providerConfigs(env), ...custom].find((c) => c.id === provider);
  const key = keyFor(provider, saved, env);
  if (config === undefined || key === null) return null;
  return { config: model === undefined ? config : { ...config, model }, ...key, modelFrom: "chain" };
}
