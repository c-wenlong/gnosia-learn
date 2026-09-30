import "server-only";

import { deleteProviderKey, readProviderKeys, writeProviderKey } from "@self-learn/catalog/state";
import type { ProviderId } from "@self-learn/schema/shared";

import { AUTH_SECRET_VAR, MIN_SECRET_LENGTH } from "@/lib/auth/core";
import { catalogDatabase } from "@/lib/learner-store";
import { openKey, sealKey } from "@/lib/provider-keys/seal";

/**
 * The web app's side of `provider_key` (docs/BYOK.md): seal on the way in,
 * open on the way out, and nothing that leaves the server but the provider,
 * the last four characters and a date.
 *
 * Every function takes the owner, resolved by the caller from the session
 * (`currentOwner()`), and has no default. The catalog functions it calls
 * filter by that owner, so owner B's request can never read owner A's row;
 * and the seal's additional data names the owner, so even a row moved
 * between owners in the database would not open for the wrong one.
 *
 * **Nothing here logs an error's message.** A drizzle error's message is the
 * failed SQL with its bind parameters, which for a write is the ciphertext
 * and the last four characters. `failureCode` reads the code and nothing
 * else, and it is all a caller may log.
 */

/** The secret keys are sealed under, or null when the deployment has none worth the name. */
export function keySecret(env: Record<string, string | undefined> = process.env): string | null {
  // Trimmed and floored exactly as `readAuthConfig` does, so the secret that
  // seals is the secret the session cookie is signed with.
  const secret = env[AUTH_SECRET_VAR]?.trim() ?? "";
  return secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

/** What Settings may know about a saved key. Never the key, never its ciphertext. */
export interface SavedKeyStatus {
  provider: ProviderId;
  last4: string;
  /** ISO instant of the last save. */
  updatedAt: string;
  /** False when it no longer decrypts (a rotated `AUTH_SECRET`): Settings asks for it again. */
  readable: boolean;
}

/** The owner's saved keys as Settings shows them. Throws when the database cannot be read. */
export async function savedKeyStatuses(owner: string): Promise<SavedKeyStatus[]> {
  const secret = keySecret() ?? "";
  const rows = await readProviderKeys(await catalogDatabase(), owner);
  return rows.map((row) => ({
    provider: row.provider,
    last4: row.last4,
    updatedAt: row.updatedAt.toISOString(),
    readable: openKey(row, { secret, owner, provider: row.provider }) !== null,
  }));
}

/**
 * The owner's saved keys in the clear, for the provider call and nothing
 * else. A key that does not open is left out, which is the "treat it as
 * missing" of decision 2. Throws when the database cannot be read.
 */
export async function openSavedKeys(owner: string): Promise<Partial<Record<ProviderId, string>>> {
  const secret = keySecret();
  if (secret === null) return {};
  const rows = await readProviderKeys(await catalogDatabase(), owner);
  const out: Partial<Record<ProviderId, string>> = {};
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

/** Seal and store a key that passed `checkKeyShape`, replacing the owner's key for that provider. */
export async function saveProviderKey(owner: string, provider: ProviderId, key: string): Promise<SavedKeyStatus> {
  const secret = keySecret();
  if (secret === null) throw new NoKeySecretError();
  const sealed = sealKey(key, { secret, owner, provider });
  const { updatedAt } = await writeProviderKey(await catalogDatabase(), owner, provider, sealed);
  return { provider, last4: sealed.last4, updatedAt: updatedAt.toISOString(), readable: true };
}

/** Remove the owner's key for one provider. True when there was one. */
export async function removeProviderKey(owner: string, provider: ProviderId): Promise<boolean> {
  return deleteProviderKey(await catalogDatabase(), owner, provider);
}

/**
 * An error as a log may carry it: a code from the error or its `cause` chain
 * (an errno, a SQLSTATE) or the error's name. Never its message.
 */
export function failureCode(error: unknown): string {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && typeof current === "object"; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z0-9_]{2,32}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return error instanceof Error ? error.name : typeof error;
}
