import { curriculumItem, LOCAL_LEARNER_ID, progress } from "@self-learn/schema";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { PREFERENCE_KEYS } from "@self-learn/schema";

import type { CatalogDatabase } from "../db";
import { StateError } from "./errors";
import { bumpEpoch, ensureLearner, withLearnerLock } from "./learner";

/**
 * The checklist: a tick and a scratch note per curriculum item.
 *
 * `LearnerState.completed` and `LearnerState.notes` were two maps in
 * localStorage keyed by the same id, so they are one table here with two
 * nullable columns. A note without a tick is a real state the UI has always
 * allowed, which is why `completed_at` is nullable rather than the row's
 * existence meaning "done".
 *
 * A row with neither is deleted rather than kept empty. Nothing reads the
 * difference, and leaving one behind would mean "unticked" and "never touched"
 * both show up as a row, so the table would grow one entry per item the learner
 * ever glanced at.
 */

export interface ProgressRow {
  curriculumItemId: string;
  completedAt: string | null;
  note: string | null;
}

/**
 * Curriculum item ids the catalog does not know. `progress.curriculum_item_id`
 * is a foreign key, so this is checked first to turn a 23503 into a sentence
 * that names the id — which, for a write coming from a browser, is the
 * difference between a 400 the caller can act on and a 500.
 */
async function unknownItems(db: CatalogDatabase, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const known = await db
    .select({ id: curriculumItem.id })
    .from(curriculumItem)
    .where(inArray(curriculumItem.id, ids));
  const present = new Set(known.map((row) => row.id));
  return ids.filter((id) => !present.has(id));
}

export async function assertKnownItems(db: CatalogDatabase, ids: string[]): Promise<void> {
  const unknown = await unknownItems(db, ids);
  if (unknown.length > 0) {
    throw new StateError(
      `no curriculum item in the catalog for ${unknown.map((id) => `"${id}"`).join(", ")}. ` +
        `Course data is indexed from content/courses/: run \`npm run catalog -- index\`.`,
    );
  }
}

export async function readProgress(
  db: CatalogDatabase,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<ProgressRow[]> {
  const rows = await db.select().from(progress).where(eq(progress.learnerId, learnerId));
  return rows.map((row) => ({
    curriculumItemId: row.curriculumItemId,
    completedAt: row.completedAt === null ? null : row.completedAt.toISOString(),
    note: row.note,
  }));
}

/** Delete the row if it now carries neither a tick nor a note. */
async function pruneEmpty(
  db: CatalogDatabase,
  learnerId: string,
  curriculumItemId: string,
): Promise<void> {
  await db
    .delete(progress)
    .where(
      and(
        eq(progress.learnerId, learnerId),
        eq(progress.curriculumItemId, curriculumItemId),
        sql`${progress.completedAt} is null`,
        sql`coalesce(${progress.note}, '') = ''`,
      ),
    );
}

/** Tick or untick one item. */
export async function setProgress(
  db: CatalogDatabase,
  curriculumItemId: string,
  completed: boolean,
  options: { learnerId?: string; at?: Date } = {},
): Promise<void> {
  const { learnerId = LOCAL_LEARNER_ID, at = new Date() } = options;
  await assertKnownItems(db, [curriculumItemId]);
  await ensureLearner(db, learnerId);
  const completedAt = completed ? at : null;
  await db
    .insert(progress)
    .values({ learnerId, curriculumItemId, completedAt })
    .onConflictDoUpdate({
      target: [progress.learnerId, progress.curriculumItemId],
      set: { completedAt: sql`excluded.completed_at`, updatedAt: sql`now()` },
    });
  if (!completed) await pruneEmpty(db, learnerId, curriculumItemId);
}

/** Write or clear the learner's note on one item. An empty note clears it. */
export async function setNote(
  db: CatalogDatabase,
  curriculumItemId: string,
  note: string,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<void> {
  await assertKnownItems(db, [curriculumItemId]);
  await ensureLearner(db, learnerId);
  const value = note.trim() === "" ? null : note;
  await db
    .insert(progress)
    .values({ learnerId, curriculumItemId, note: value })
    .onConflictDoUpdate({
      target: [progress.learnerId, progress.curriculumItemId],
      set: { note: sql`excluded.note`, updatedAt: sql`now()` },
    });
  if (value === null) await pruneEmpty(db, learnerId, curriculumItemId);
}

/**
 * Clear ticks and notes for a set of items, and return how many rows went.
 *
 * Recaps are deliberately untouched: resetting progress means "study this
 * again", not "forget what I concluded". That rule predates the database and
 * is enforced here by this function simply not naming the `recap` table.
 */
export async function resetProgress(
  db: CatalogDatabase,
  curriculumItemIds: string[],
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<number> {
  if (curriculumItemIds.length === 0) return 0;
  const result = await db
    .delete(progress)
    .where(
      and(
        eq(progress.learnerId, learnerId),
        inArray(progress.curriculumItemId, curriculumItemIds),
      ),
    );
  return result.rowCount ?? 0;
}

/**
 * A reset is one act: the ticks and notes go, and the epoch moves.
 *
 * One transaction, because the two halves fail differently and the difference
 * matters. If the delete commits and the epoch write does not, the caller sees
 * "not saved" over a deletion that already happened — and the components
 * holding draft state for those items never remount, so the page keeps showing
 * text for rows that no longer exist.
 */
export async function resetCourse(
  db: CatalogDatabase,
  curriculumItemIds: string[],
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<{ cleared: number; epoch: number }> {
  return withLearnerLock(db, learnerId, async (tx) => ({
    cleared: await resetProgress(tx, curriculumItemIds, learnerId),
    epoch: await bumpEpoch(tx, PREFERENCE_KEYS.epoch, learnerId),
  }));
}

/** How many items are ticked. Cheaper than pulling the whole map to count it. */
export async function countCompleted(
  db: CatalogDatabase,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(progress)
    .where(and(eq(progress.learnerId, learnerId), isNotNull(progress.completedAt)));
  return rows[0]?.total ?? 0;
}
