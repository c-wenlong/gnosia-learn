import {
  checkModelId,
  groupByProvider,
  isProviderId,
  type ProviderId,
  TUTOR_MODEL_LIMITS,
  tutorModel,
} from "@self-learn/schema";
import { asc, eq } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { StateError } from "./errors";
import { withLearnerLock } from "./learner";
import { deleteProviderKey, readProviderKeys } from "./provider-keys";

/**
 * The tutor's model chain (docs/TUTOR-MODELS.md): an owner's ordered list of
 * provider and model pairs, which the web app's tutor tries top to bottom.
 *
 * **The one writer of `tutor_model`.** Every change reads the owner's chain,
 * works out the new order, and writes the whole chain back, all inside the
 * learner lock (`withLearnerLock`), so two tabs reordering at once are
 * serialised and `position` is always 0 to n-1 with no gaps. Rewriting the
 * rows rather than updating positions in place is deliberate: a swap done
 * with two UPDATEs trips the unique `(owner_id, position)` index halfway,
 * since Postgres checks a non-deferrable unique index row by row. The chain
 * is at most `TUTOR_MODEL_LIMITS.maxEntries` rows, so a rewrite is cheap.
 *
 * **Grouped by provider.** Settings shows each provider's models under it,
 * so every write stores the chain grouped (`groupByProvider`): an added
 * model goes to the end of its provider's models, a model moves within its
 * provider, and a provider's models move together past the next provider's.
 * A chain stored before the grouping is grouped on its next write.
 *
 * Every function takes the owner and has no default, like the provider keys
 * beside it: nothing here is ever read or written for `local` by omission.
 */

export interface TutorModelEntry {
  provider: ProviderId;
  model: string;
}

export interface StoredTutorModel extends TutorModelEntry {
  position: number;
  createdAt: Date;
}

export type TutorModelErrorCode = "INVALID" | "DUPLICATE" | "FULL" | "NOT_FOUND" | "NO_KEY";

/** A chain change the chain refused: a bad entry, one already there, a full chain, or an entry that is not there. */
export class TutorModelError extends StateError {
  constructor(
    readonly code: TutorModelErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TutorModelError";
  }
}

/** The entry as the chain may hold it, or a `TutorModelError("INVALID")`. */
export function tutorModelEntry(provider: unknown, model: unknown): TutorModelEntry {
  if (!isProviderId(provider)) throw new TutorModelError("INVALID", `"${String(provider).slice(0, 40)}" is not a model provider.`);
  const checked = checkModelId(model);
  if (!checked.ok) throw new TutorModelError("INVALID", checked.reason);
  return { provider, model: checked.model };
}

function same(a: TutorModelEntry, b: TutorModelEntry): boolean {
  return a.provider === b.provider && a.model === b.model;
}

/** This owner's chain, top first. Empty for an owner who never added a model. */
export async function readTutorModels(db: CatalogDatabase, owner: string): Promise<StoredTutorModel[]> {
  const rows = await db
    .select()
    .from(tutorModel)
    .where(eq(tutorModel.ownerId, owner))
    .orderBy(asc(tutorModel.position));
  return rows.flatMap((row) =>
    isProviderId(row.provider)
      ? [{ provider: row.provider, model: row.model, position: row.position, createdAt: row.createdAt }]
      : [],
  );
}

/**
 * Read, change and write back the owner's chain under the learner lock.
 * `change` returns the new order; an entry it keeps keeps its `createdAt`.
 */
async function rewrite(
  db: CatalogDatabase,
  owner: string,
  change: (current: StoredTutorModel[]) => TutorModelEntry[],
  hooks: { before?: (tx: CatalogDatabase) => Promise<void>; after?: (tx: CatalogDatabase) => Promise<void> } = {},
): Promise<StoredTutorModel[]> {
  return withLearnerLock(db, owner, async (tx) => {
    await hooks.before?.(tx);
    const current = groupByProvider(await readTutorModels(tx, owner));
    const next = groupByProvider(change(current));
    const createdAt = new Map(current.map((row) => [`${row.provider}\u0000${row.model}`, row.createdAt]));
    await tx.delete(tutorModel).where(eq(tutorModel.ownerId, owner));
    if (next.length > 0) {
      await tx.insert(tutorModel).values(
        next.map((entry, position) => ({
          ownerId: owner,
          position,
          provider: entry.provider,
          model: entry.model,
          createdAt: createdAt.get(`${entry.provider}\u0000${entry.model}`) ?? new Date(),
        })),
      );
    }
    await hooks.after?.(tx);
    return readTutorModels(tx, owner);
  });
}

/**
 * Add an entry at the end of its provider's models (the end of the chain for
 * a provider with none yet). Refuses a duplicate and a full chain.
 *
 * `requireKey` checks, inside the learner lock, that the provider still has a
 * key: the server's (`server: true`, which the caller reads from the
 * environment) or a saved one. The caller checks first too; checking again
 * here is what stops an add that raced a provider's Delete
 * (`deleteTutorProvider`, which takes the same lock) from leaving a model
 * with no key behind (NO_KEY).
 */
export async function addTutorModel(
  db: CatalogDatabase,
  owner: string,
  provider: unknown,
  model: unknown,
  options: { requireKey?: { server: boolean } } = {},
): Promise<StoredTutorModel[]> {
  const entry = tutorModelEntry(provider, model);
  const before =
    options.requireKey === undefined || options.requireKey.server
      ? undefined
      : async (tx: CatalogDatabase) => {
          const saved = await readProviderKeys(tx, owner);
          if (!saved.some((row) => row.provider === entry.provider)) {
            throw new TutorModelError("NO_KEY", "That provider has no key any more. Add its key first.");
          }
        };
  return rewrite(db, owner, (current) => {
    if (current.some((row) => same(row, entry))) {
      throw new TutorModelError("DUPLICATE", "That model is already in the chain.");
    }
    if (current.length >= TUTOR_MODEL_LIMITS.maxEntries) {
      throw new TutorModelError("FULL", `The chain holds at most ${TUTOR_MODEL_LIMITS.maxEntries} models. Remove one first.`);
    }
    return [...current, entry];
  }, { before });
}

/** Remove an entry; the ones below it move up, so the positions stay 0 to n-1. */
export async function removeTutorModel(
  db: CatalogDatabase,
  owner: string,
  provider: unknown,
  model: unknown,
): Promise<StoredTutorModel[]> {
  const entry = tutorModelEntry(provider, model);
  return rewrite(db, owner, (current) => {
    if (!current.some((row) => same(row, entry))) throw new TutorModelError("NOT_FOUND", "That model is not in the chain.");
    return current.filter((row) => !same(row, entry));
  });
}

/**
 * Move an entry one place up (earlier, tried sooner) or down among its
 * provider's models. Moving the first up or the last down changes nothing
 * and is not an error; a provider's order is `moveTutorProvider`'s.
 */
export async function moveTutorModel(
  db: CatalogDatabase,
  owner: string,
  provider: unknown,
  model: unknown,
  direction: "up" | "down",
): Promise<StoredTutorModel[]> {
  const entry = tutorModelEntry(provider, model);
  return rewrite(db, owner, (current) => {
    const at = current.findIndex((row) => same(row, entry));
    if (at === -1) throw new TutorModelError("NOT_FOUND", "That model is not in the chain.");
    const to = direction === "up" ? at - 1 : at + 1;
    const next: TutorModelEntry[] = [...current];
    if (to < 0 || to >= next.length || next[to]!.provider !== entry.provider) return next;
    [next[at], next[to]] = [next[to]!, next[at]!];
    return next;
  });
}

/**
 * Move a provider's models together one provider up (tried sooner) or down,
 * past the next provider's models. A provider with no models has no place in
 * the chain: NOT_FOUND. Moving the first up or the last down changes nothing.
 */
export async function moveTutorProvider(
  db: CatalogDatabase,
  owner: string,
  provider: unknown,
  direction: "up" | "down",
): Promise<StoredTutorModel[]> {
  if (!isProviderId(provider)) throw new TutorModelError("INVALID", `"${String(provider).slice(0, 40)}" is not a model provider.`);
  return rewrite(db, owner, (current) => {
    const order = [...new Set(current.map((row) => row.provider))];
    const at = order.indexOf(provider);
    if (at === -1) throw new TutorModelError("NOT_FOUND", "That provider has no models in the chain.");
    const to = direction === "up" ? at - 1 : at + 1;
    if (to >= 0 && to < order.length) [order[at], order[to]] = [order[to]!, order[at]!];
    return order.flatMap((id) => current.filter((row) => row.provider === id));
  });
}

/**
 * A provider's Delete in Settings: every model of the provider leaves the
 * chain and the owner's saved key for it goes, in one transaction under the
 * learner lock, so a concurrent add (`addTutorModel` with `requireKey`) sees
 * either both or neither. A provider with no models or no saved key is not
 * an error; `keyRemoved` says whether there was a key.
 */
export async function deleteTutorProvider(
  db: CatalogDatabase,
  owner: string,
  provider: unknown,
): Promise<{ chain: StoredTutorModel[]; keyRemoved: boolean }> {
  if (!isProviderId(provider)) throw new TutorModelError("INVALID", `"${String(provider).slice(0, 40)}" is not a model provider.`);
  let keyRemoved = false;
  const chain = await rewrite(db, owner, (current) => current.filter((row) => row.provider !== provider), {
    after: async (tx) => {
      keyRemoved = await deleteProviderKey(tx, owner, provider);
    },
  });
  return { chain, keyRemoved };
}
