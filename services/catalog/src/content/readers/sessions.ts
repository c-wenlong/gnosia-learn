import type { SessionLogSource } from "@self-learn/content";
import { session } from "@self-learn/schema";
import { and, eq } from "drizzle-orm";

import { ownedBy } from "../scope";
import { logPath, readLog } from "../session-logs";
import type { TypeReader } from "./reader";

/**
 * The database reader for `sessions`: one session log by its id, as
 * `SessionLogSource`, its entries concatenated, or null.
 *
 * Track C's file (docs/CONTENT-MIGRATION.md, phase 1). Each entry is the exact
 * text that was appended, so the concatenation is the file, byte for byte. A
 * session with no entries has no log, as a session with no file had none.
 *
 * A log belongs to its session's learner (`session.learner_id`, the plan's
 * owner column for this type), so a session another learner ran has no log
 * here either (phase 4).
 */
export const reader: TypeReader<"sessionLog"> = {
  ready: true,
  read: (db, scope) => async (id): Promise<SessionLogSource | null> => {
    const [mine] = await db
      .select({ id: session.id })
      .from(session)
      .where(and(eq(session.id, id), ownedBy(session.learnerId, scope.readable)))
      .limit(1);
    if (mine === undefined) return null;
    const markdown = await readLog(db, id);
    return markdown === null ? null : { id, path: logPath(id), markdown };
  },
};
