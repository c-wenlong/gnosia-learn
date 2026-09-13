import { setProgress } from "@self-learn/catalog/state";

import { handler, requireBoolean, requireId } from "@/lib/learner-api";

/** Tick or untick one curriculum item. */
export const POST = handler(
  "progress",
  (body) => ({
    curriculumItemId: requireId(body, "curriculumItemId"),
    completed: requireBoolean(body, "completed"),
  }),
  async (db, { curriculumItemId, completed }) => {
    await setProgress(db, curriculumItemId, completed);
    return { curriculumItemId, completed };
  },
);
