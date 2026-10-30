import {
  deleteProviderKey,
  readProviderKeys,
  saveCustomProviderKey,
  writeProviderKey,
  type CatalogDatabase,
} from "@gnosia/catalog/state";
import {
  AUTH_SECRET_VAR,
  isCustomProviderId,
  MIN_SECRET_LENGTH,
  type ProviderName,
} from "@gnosia/schema/shared";

import { openKey, sealKey } from "./seal";

/**
 * The environment a read is given, the same shape as `Env` in `./deps`,
 * declared here so this module imports nothing beyond the catalog's door and
 * the seal: the studio runner opens the BYOK keys through it (docs/BYOK.md,
 * D12) without type-checking the tutor's request seams.
 */
type Env = Record<string, string | undefined>;

/**
 * The owner's saved provider keys (docs/BYOK.md), the request-independent
 * half of `apps/web/src/lib/provider-keys/store.ts`: the database handle and
 * the environment are parameters, so the Next app, the sidecar and the studio
 * runner resolve the same sealed rows the same way.
 */

/** The secret keys are sealed under, or null when the deployment has none worth the name. */
export function keySecret(env: Env = process.env): string | null {
  // Trimmed and floored exactly as `readAuthConfig` does, so the secret that
  // seals is the secret the session cookie is signed with.
  const secret = env[AUTH_SECRET_VAR]?.trim() ?? "";
  return secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

/** What Settings may know about a saved key. Never the key, never its ciphertext. */
export interface SavedKeyStatus {
  provider: ProviderName;
  last4: string;
  /** ISO instant of the last save. */
  updatedAt: string;
  /** False when it no longer decrypts (a rotated `AUTH_SECRET`): Settings asks for it again. */
  readable: boolean;
}

/** The owner's saved keys as Settings shows them. Throws when the database cannot be read. */
export async function savedKeyStatuses(
  db: CatalogDatabase,
  owner: string,
  env: Env = process.env,
): Promise<SavedKeyStatus[]> {
  const secret = keySecret(env) ?? "";
  const rows = await readProviderKeys(db, owner);
  return rows.map((row) => ({
    provider: row.provider,
    last4: row.last4,
    updatedAt: row.updatedAt.toISOString(),
    readable: openKey(row, { secret, owner, provider: row.provider }) !== null,
  }));
}

export async function openSavedKeys(
  db: CatalogDatabase,
  owner: string,
  env: Env = process.env,
): Promise<Partial<Record<ProviderName, string>>> {
  const secret = keySecret(env);
  if (secret === null) return {};
  const rows = await readProviderKeys(db, owner);
  const out: Partial<Record<ProviderName, string>> = {};
  for (const row of rows) {
    const key = openKey(row, { secret, owner, provider: row.provider });
    if (key !== null) out[row.provider] = key;
  }
  return out;
}

/** The deployment has no `AUTH_SECRET` to seal with. */
export class NoKeySecretError extends Error {
  constructor() {
    super("AUTH_SECRET is not set, so a provider key cannot be stored.");
    this.name = "NoKeySecretError";
  }
}

/** A sealer for a key that passed `checkKeyShape`, for an owner, or `NoKeySecretError` before anything is written. */
export function keySealer(
  env: Env,
  owner: string,
  key: string,
): (provider: ProviderName) => ReturnType<typeof sealKey> {
  const secret = keySecret(env);
  if (secret === null) throw new NoKeySecretError();
  return (provider) => sealKey(key, { secret, owner, provider });
}

/** What Settings is told of a key just stored. */
export function savedStatus(provider: ProviderName, saved: { last4: string; updatedAt: Date }): SavedKeyStatus {
  return { provider, last4: saved.last4, updatedAt: saved.updatedAt.toISOString(), readable: true };
}

export async function saveProviderKey(
  db: CatalogDatabase,
  owner: string,
  provider: ProviderName,
  key: string,
  env: Env = process.env,
): Promise<SavedKeyStatus> {
  const sealed = keySealer(env, owner, key)(provider);
  const { updatedAt } = isCustomProviderId(provider)
    ? await saveCustomProviderKey(db, owner, provider, sealed)
    : await writeProviderKey(db, owner, provider, sealed);
  return savedStatus(provider, { last4: sealed.last4, updatedAt });
}

/** Remove the owner's key for one provider. True when there was one. */
export async function removeProviderKey(
  db: CatalogDatabase,
  owner: string,
  provider: ProviderName,
): Promise<boolean> {
  return deleteProviderKey(db, owner, provider);
}

export function failureCode(error: unknown): string {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && typeof current === "object"; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z0-9_]{2,32}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return error instanceof Error ? error.name : typeof error;
}
