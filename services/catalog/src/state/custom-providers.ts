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

/**
 * The providers an owner added themselves (docs/TUTOR-MODELS.md, T14): a
 * name and an OpenAI-compatible base URL, under an id `custom-<slug>` that
 * the key (`provider_key`) and the models (`tutor_model`) are filed under.
 *
 * **The one writer of `custom_provider`**, apart from the Delete in
 * `deleteTutorProvider`, which removes the row with its key and models in
 * one transaction. Every function takes the owner and has no default.
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

/**
 * Add a custom provider, its id made from its name and unique among the
 * owner's. Refuses a bad name or base URL, and an owner who already has
 * `CUSTOM_PROVIDER_LIMITS.maxProviders`.
 */
export async function addCustomProvider(
  db: CatalogDatabase,
  owner: string,
  input: { label: unknown; baseUrl: unknown },
): Promise<StoredCustomProvider> {
  const name = label(input.label);
  const url = baseUrl(input.baseUrl);
  return withLearnerLock(db, owner, async (tx) => {
    const existing = await readCustomProviders(tx, owner);
    if (existing.length >= CUSTOM_PROVIDER_LIMITS.maxProviders) {
      throw new CustomProviderError("FULL", `You can add at most ${CUSTOM_PROVIDER_LIMITS.maxProviders} providers of your own.`);
    }
    const id = customProviderId(name, existing.map((p) => p.id));
    await tx.insert(customProvider).values({ ownerId: owner, id, label: name, baseUrl: url });
    const [row] = (await readCustomProviders(tx, owner)).filter((p) => p.id === id);
    if (row === undefined) throw new CustomProviderError("NOT_FOUND", "The provider was not stored.");
    return row;
  });
}

/** Change a custom provider's name or base URL. Its id, key and models stay. */
export async function updateCustomProvider(
  db: CatalogDatabase,
  owner: string,
  id: unknown,
  input: { label?: unknown; baseUrl?: unknown },
): Promise<StoredCustomProvider> {
  if (!isCustomProviderId(id)) throw new CustomProviderError("INVALID", "That is not one of your providers.");
  const set: { label?: string; baseUrl?: string; updatedAt: ReturnType<typeof sql> } = { updatedAt: sql`now()` };
  if (input.label !== undefined) set.label = label(input.label);
  if (input.baseUrl !== undefined) set.baseUrl = baseUrl(input.baseUrl);
  const updated = await db
    .update(customProvider)
    .set(set)
    .where(and(eq(customProvider.ownerId, owner), eq(customProvider.id, id)))
    .returning({ id: customProvider.id });
  if (updated.length === 0) throw new CustomProviderError("NOT_FOUND", "That is not one of your providers.");
  const [row] = (await readCustomProviders(db, owner)).filter((p) => p.id === id);
  if (row === undefined) throw new CustomProviderError("NOT_FOUND", "That is not one of your providers.");
  return row;
}

/** Remove a custom provider's row. Only `deleteTutorProvider` calls it, inside its transaction. */
export async function removeCustomProviderRow(tx: CatalogDatabase, owner: string, id: CustomProviderId): Promise<boolean> {
  const removed = await tx
    .delete(customProvider)
    .where(and(eq(customProvider.ownerId, owner), eq(customProvider.id, id)))
    .returning({ id: customProvider.id });
  return removed.length > 0;
}
