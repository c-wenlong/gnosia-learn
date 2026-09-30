import {
  checkModelId,
  isProviderId,
  type ProviderId,
  TUTOR_MODEL_LIMITS,
  tutorModel,
} from "@self-learn/schema";
import { asc, eq } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { StateError } from "./errors";
import { withLearnerLock } from "./learner";

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

export type TutorModelErrorCode = "INVALID" | "DUPLICATE" | "FULL" | "NOT_FOUND";

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
): Promise<StoredTutorModel[]> {
  return withLearnerLock(db, owner, async (tx) => {
    const current = await readTutorModels(tx, owner);
    const next = change(current);
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
    return readTutorModels(tx, owner);
  });
}

/** Add an entry at the bottom of the owner's chain. Refuses a duplicate and a full chain. */
export async function addTutorModel(
  db: CatalogDatabase,
  owner: string,
  provider: unknown,
  model: unknown,
): Promise<StoredTutorModel[]> {
  const entry = tutorModelEntry(provider, model);
  return rewrite(db, owner, (current) => {
    if (current.some((row) => same(row, entry))) {
      throw new TutorModelError("DUPLICATE", "That model is already in the chain.");
    }
    if (current.length >= TUTOR_MODEL_LIMITS.maxEntries) {
      throw new TutorModelError("FULL", `The chain holds at most ${TUTOR_MODEL_LIMITS.maxEntries} models. Remove one first.`);
    }
    return [...current, entry];
  });
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
 * Move an entry one place up (earlier, tried sooner) or down. Moving the top
 * entry up or the bottom one down changes nothing and is not an error.
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
    if (to < 0 || to >= next.length) return next;
    [next[at], next[to]] = [next[to]!, next[at]!];
    return next;
  });
}
