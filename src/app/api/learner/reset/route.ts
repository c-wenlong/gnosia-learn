import { PREFERENCE_KEYS } from "@self-learn/schema/shared";
import { readPreference, resetProgress, writePreference } from "@self-learn/catalog/state";

import { handler, requireIdList } from "@/lib/learner-api";

/**
 * Clear the ticks and notes for one course, and bump the epoch so client
 * components holding their own UI state remount.
 *
 * Recaps are not touched, here or in the store. Resetting progress means
 * "study this again", not "forget what I concluded".
 */
export const POST = handler(
  "reset",
  (body) => ({ curriculumItemIds: requireIdList(body, "curriculumItemIds") }),
  async (db, { curriculumItemIds }) => {
    const cleared = await resetProgress(db, curriculumItemIds);
    const current = await readPreference(db, PREFERENCE_KEYS.epoch);
    const epoch = (typeof current === "number" && Number.isFinite(current) ? current : 0) + 1;
    await writePreference(db, PREFERENCE_KEYS.epoch, epoch);
    return { cleared, epoch };
  },
);
