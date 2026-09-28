import { resetCourse } from "@self-learn/catalog/state";

import { handler, requireIdList } from "@/lib/learner-api";

/**
 * Clear the ticks and notes for one course, and bump the epoch so client
 * components holding their own draft state remount.
 *
 * Both halves happen in one transaction inside the store, and the epoch is
 * incremented in SQL rather than read and written back. A reset that deleted
 * the rows and then failed to move the epoch would report "not saved" over a
 * deletion that had already committed, and would leave the editors showing
 * text for items that no longer exist.
 *
 * Recaps are not touched, here or in the store. Resetting progress means
 * "study this again", not "forget what I concluded".
 */
export const POST = handler(
  "reset",
  (body) => ({ curriculumItemIds: requireIdList(body, "curriculumItemIds") }),
  async (db, { curriculumItemIds }, owner) => resetCourse(db, curriculumItemIds, owner),
);
