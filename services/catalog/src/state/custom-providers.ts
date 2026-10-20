import {
  checkBaseUrl,
  checkProviderLabel,
  CUSTOM_PROVIDER_LIMITS,
  customProvider,
  type CustomProviderId,
  customProviderId,
  isCustomProviderId,
} from "@self-learn/schema";
import { and, asc, eq, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { bytewise } from "../sql-order";
import { StateError } from "./errors";
import { withLearnerLock } from "./learner";
import { type SealedProviderKey, writeProviderKey } from "./provider-keys";

/**
 * The providers an owner added themselves (docs/TUTOR-MODELS.md, T14): a
 * name and an OpenAI-compatible base URL, under an id `custom-<slug>` that
 * the key (`provider_key`) and the models (`tutor_model`) are filed under.
 *
 * **The one writer of `custom_provider`**, apart from the Delete in
 * `deleteTutorProvider`, which removes the row with its key and models in
 * one transaction. Every function takes the owner and has no default.
 *
 * A custom provider's key is written here too, never by a bare
 * `writeProviderKey`: each write runs under the learner lock that the
 * Delete holds, in the transaction that checks or makes the row, so a key
 * is never filed under an id the owner no longer has.
 */

export interface StoredCustomProvider {
  id: CustomProviderId;
  label: string;
  baseUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CustomProviderErrorCode = "INVALID" | "FULL" | "NOT_FOUND";

export class CustomProviderError extends StateError {
  constructor(
    readonly code: CustomProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CustomProviderError";
  }
}

function label(value: unknown): string {
  const checked = checkProviderLabel(value);
  if (!checked.ok) throw new CustomProviderError("INVALID", checked.reason);
  return checked.label;
}

function baseUrl(value: unknown): string {
  const checked = checkBaseUrl(value);
  if (!checked.ok) throw new CustomProviderError("INVALID", checked.reason);
  return checked.url;
}

/** This owner's custom providers, by name. */
export async function readCustomProviders(db: CatalogDatabase, owner: string): Promise<StoredCustomProvider[]> {
  const rows = await db
    .select()
    .from(customProvider)
    .where(eq(customProvider.ownerId, owner))
    .orderBy(asc(bytewise(customProvider.label)), asc(bytewise(customProvider.id)));
  return rows.flatMap((row) =>
    isCustomProviderId(row.id)
      ? [{ id: row.id, label: row.label, baseUrl: row.baseUrl, createdAt: row.createdAt, updatedAt: row.updatedAt }]
      : [],
  );
}

/** What a custom provider's key write left: its last four and when. */
export interface CustomProviderKeySaved {
  last4: string;
  updatedAt: Date;
}

/**
 * Add a custom provider with its key, both or neither: the id is made from
 * the name, unique among the owner's, and `seal` seals the key under that id
 * (the id is in the seal's additional data) inside the same transaction.
 * Refuses a bad name or base URL, and an owner who already has
 * `CUSTOM_PROVIDER_LIMITS.maxProviders`.
 */
export async function addCustomProvider(
  db: CatalogDatabase,
  owner: string,
  input: { label: unknown; baseUrl: unknown },
  seal: (id: CustomProviderId) => SealedProviderKey,
): Promise<{ provider: StoredCustomProvider; key: CustomProviderKeySaved }> {
  const name = label(input.label);
  const url = baseUrl(input.baseUrl);
  return withLearnerLock(db, owner, async (tx) => {
    const existing = await readCustomProviders(tx, owner);
    if (existing.length >= CUSTOM_PROVIDER_LIMITS.maxProviders) {
      throw new CustomProviderError("FULL", `You can add at most ${CUSTOM_PROVIDER_LIMITS.maxProviders} providers of your own.`);
    }
    const id = customProviderId(name, existing.map((p) => p.id));
    await tx.insert(customProvider).values({ ownerId: owner, id, label: name, baseUrl: url });
    const sealed = seal(id);
    // An upsert: a key left under this id by anything older is replaced.
    const { updatedAt } = await writeProviderKey(tx, owner, id, sealed);
    const [row] = (await readCustomProviders(tx, owner)).filter((p) => p.id === id);
    if (row === undefined) throw new CustomProviderError("NOT_FOUND", "The provider was not stored.");
    return { provider: row, key: { last4: sealed.last4, updatedAt } };
  });
}

/** Lock-held check that the owner has this custom provider. */
async function requireRow(tx: CatalogDatabase, owner: string, id: CustomProviderId): Promise<void> {
  const [row] = await tx
    .select({ id: customProvider.id })
    .from(customProvider)
    .where(and(eq(customProvider.ownerId, owner), eq(customProvider.id, id)));
  if (row === undefined) throw new CustomProviderError("NOT_FOUND", "That is not one of your providers.");
}

/**
 * Save a new key for one of the owner's custom providers, refused when the
 * provider is not theirs, or was deleted a moment before.
 */
export async function saveCustomProviderKey(
  db: CatalogDatabase,
  owner: string,
  id: CustomProviderId,
  sealed: SealedProviderKey,
): Promise<CustomProviderKeySaved> {
  return withLearnerLock(db, owner, async (tx) => {
    await requireRow(tx, owner, id);
    const { updatedAt } = await writeProviderKey(tx, owner, id, sealed);
    return { last4: sealed.last4, updatedAt };
  });
}

/**
 * Change a custom provider's name or base URL, and its key when `sealed` is
 * given, in one transaction: a key that cannot be stored leaves the name and
 * the URL as they were. Its id and models stay.
 */
export async function updateCustomProvider(
  db: CatalogDatabase,
  owner: string,
  id: unknown,
  input: { label?: unknown; baseUrl?: unknown },
  sealed?: SealedProviderKey,
): Promise<{ provider: StoredCustomProvider; key: CustomProviderKeySaved | null }> {
  if (!isCustomProviderId(id)) throw new CustomProviderError("INVALID", "That is not one of your providers.");
  const set: { label?: string; baseUrl?: string; updatedAt: ReturnType<typeof sql> } = { updatedAt: sql`cast(unixepoch('subsec') * 1000 as integer)` };
  if (input.label !== undefined) set.label = label(input.label);
  if (input.baseUrl !== undefined) set.baseUrl = baseUrl(input.baseUrl);
  return withLearnerLock(db, owner, async (tx) => {
    const updated = await tx
      .update(customProvider)
      .set(set)
      .where(and(eq(customProvider.ownerId, owner), eq(customProvider.id, id)))
      .returning({ id: customProvider.id });
    if (updated.length === 0) throw new CustomProviderError("NOT_FOUND", "That is not one of your providers.");
    let key: CustomProviderKeySaved | null = null;
    if (sealed !== undefined) {
      const { updatedAt } = await writeProviderKey(tx, owner, id, sealed);
      key = { last4: sealed.last4, updatedAt };
    }
    const [row] = (await readCustomProviders(tx, owner)).filter((p) => p.id === id);
    if (row === undefined) throw new CustomProviderError("NOT_FOUND", "That is not one of your providers.");
    return { provider: row, key };
  });
}

/** Remove a custom provider's row. Only `deleteTutorProvider` calls it, inside its transaction. */
export async function removeCustomProviderRow(tx: CatalogDatabase, owner: string, id: CustomProviderId): Promise<boolean> {
  const removed = await tx
    .delete(customProvider)
    .where(and(eq(customProvider.ownerId, owner), eq(customProvider.id, id)))
    .returning({ id: customProvider.id });
  return removed.length > 0;
}
