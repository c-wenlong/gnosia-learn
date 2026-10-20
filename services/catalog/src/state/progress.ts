import { curriculumItem, LOCAL_LEARNER_ID, progress } from "@self-learn/schema";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { PREFERENCE_KEYS } from "@self-learn/schema";

import { ownedBy, type Owners, readableFor } from "../content/scope";
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
 * Curriculum item ids the catalog does not know, and those it knows only as
 * archived. `progress.curriculum_item_id` is a foreign key, so this is checked
 * first to turn a 23503 into a sentence that names the id — which, for a write
 * coming from a browser, is the difference between a 400 the caller can act
 * on and a 500.
 */
async function itemStates(
  db: CatalogDatabase,
  ids: string[],
  owners?: Owners,
): Promise<{ unknown: string[]; archived: string[] }> {
  if (ids.length === 0) return { unknown: [], archived: [] };
  const known = await db
    .select({ id: curriculumItem.id, archivedAt: curriculumItem.archivedAt })
    .from(curriculumItem)
    .where(and(inArray(curriculumItem.id, ids), ownedBy(curriculumItem.ownerId, owners)));
  const present = new Map(known.map((row) => [row.id, row.archivedAt !== null]));
  return {
    unknown: ids.filter((id) => !present.has(id)),
    archived: ids.filter((id) => present.get(id) === true),
  };
}

/**
 * `allowArchived`: the learner-state import (`import.ts`) restores a
 * learner's own export, and an export carries what was recorded on archived
 * items (D12), so a round trip must put it back rather than stop at the first
 * one. Nothing else passes it.
 */
export interface WriteOptions {
  allowArchived?: boolean;
}

/**
 * Refuse a write to an item the catalog does not know, or has archived.
 *
 * An archived item is one its course file stopped listing (D12 of
 * docs/CONTENT-MIGRATION.md). The learner's tick, note and recap on it are
 * kept, and the Settings export still carries them, but it is on no course
 * path any more, so a new tick there would record progress on something the
 * course no longer teaches. Only a stale page can send one, and a sentence
 * that says why beats a tick that silently lands nowhere.
 */
export async function assertKnownItems(
  db: CatalogDatabase,
  ids: string[],
  options: WriteOptions = {},
  owners?: Owners,
): Promise<void> {
  const { unknown, archived } = await itemStates(db, ids, owners);
  if (unknown.length > 0) {
    throw new StateError(
      `no curriculum item in the catalog for ${unknown.map((id) => `"${id}"`).join(", ")}. ` +
        `Courses are rows in the catalog: \`npm run catalog -- ls\` lists them, and \`catalog course import\` writes one.`,
    );
  }
  if (archived.length > 0 && options.allowArchived !== true) {
    throw new StateError(
      `curriculum item ${archived.map((id) => `"${id}"`).join(", ")} is archived: its course no ` +
        `longer lists it. What was recorded on it is kept, and nothing new is. Reload the course page.`,
    );
  }
}

/**
 * `assertKnownItems`, for a learner's own write: only an item the learner may
 * read counts (phase 4), one of their own or the commons'. Another owner's
 * item is refused with the sentence a missing one gets, so a tick is neither
 * a row on something the learner cannot open nor a way to ask whether an id
 * exists. Every learner write that names an item checks this: a tick, a note,
 * a recap, and the legacy import.
 */
export async function assertReadableItems(
  db: CatalogDatabase,
  ids: string[],
  learnerId: string,
  options: WriteOptions = {},
): Promise<void> {
  await assertKnownItems(db, ids, options, await readableFor(db, learnerId));
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
  options: { learnerId?: string; at?: Date } & WriteOptions = {},
): Promise<void> {
  const { learnerId = LOCAL_LEARNER_ID, at = new Date() } = options;
  await assertReadableItems(db, [curriculumItemId], learnerId, options);
  await ensureLearner(db, learnerId);
  const completedAt = completed ? at : null;
  await db
    .insert(progress)
    .values({ learnerId, curriculumItemId, completedAt })
    .onConflictDoUpdate({
      target: [progress.learnerId, progress.curriculumItemId],
      set: { completedAt: sql`excluded.completed_at`, updatedAt: sql`cast(unixepoch('subsec') * 1000 as integer)` },
    });
  if (!completed) await pruneEmpty(db, learnerId, curriculumItemId);
}

/** Write or clear the learner's note on one item. An empty note clears it. */
export async function setNote(
  db: CatalogDatabase,
  curriculumItemId: string,
  note: string,
  learnerId: string = LOCAL_LEARNER_ID,
  options: WriteOptions = {},
): Promise<void> {
  await assertReadableItems(db, [curriculumItemId], learnerId, options);
  await ensureLearner(db, learnerId);
  const value = note.trim() === "" ? null : note;
  await db
    .insert(progress)
    .values({ learnerId, curriculumItemId, note: value })
    .onConflictDoUpdate({
      target: [progress.learnerId, progress.curriculumItemId],
      set: { note: sql`excluded.note`, updatedAt: sql`cast(unixepoch('subsec') * 1000 as integer)` },
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
  // Only items the learner may read (phase 4). The learner's own rows are all
  // that is ever deleted; this keeps the count a reset reports from saying
  // anything about an item they cannot open. Nothing is refused, so a course
  // page listing an id the catalog lacks resets what it can, as before.
  const owners = await readableFor(db, learnerId);
  const readable =
    owners === undefined
      ? undefined
      : inArray(
          progress.curriculumItemId,
          db.select({ id: curriculumItem.id }).from(curriculumItem).where(ownedBy(curriculumItem.ownerId, owners)),
        );
  const result = await db
    .delete(progress)
    .where(
      and(
        eq(progress.learnerId, learnerId),
        inArray(progress.curriculumItemId, curriculumItemIds),
        readable,
      ),
    );
  return result.changes;
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
    .select({ total: sql<number>`count(*)` })
    .from(progress)
    .where(and(eq(progress.learnerId, learnerId), isNotNull(progress.completedAt)));
  return rows[0]?.total ?? 0;
}
