import { setNote } from "@self-learn/catalog/state";

import { handler, requireId, requireString, MAX_NOTE_CHARS } from "@/lib/learner-api";

/** Write or clear the learner's scratch note on one curriculum item. */
export const POST = handler(
  "note",
  (body) => ({
    curriculumItemId: requireId(body, "curriculumItemId"),
    note: requireString(body, "note", MAX_NOTE_CHARS),
  }),
  async (db, { curriculumItemId, note }, owner) => {
    await setNote(db, curriculumItemId, note, owner);
    return { curriculumItemId, cleared: note.trim() === "" };
  },
);
