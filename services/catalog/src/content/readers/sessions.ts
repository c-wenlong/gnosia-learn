import type { SessionLogSource } from "@self-learn/content";

import { logPath, readLog } from "../session-logs";
import type { TypeReader } from "./reader";

/**
 * The database reader for `sessions`: one session log by its id, as
 * `SessionLogSource`, its entries concatenated, or null.
 *
 * Track C's file (docs/CONTENT-MIGRATION.md, phase 1). Each entry is the exact
 * text that was appended, so the concatenation is the file, byte for byte. A
 * session with no entries has no log, as a session with no file had none.
 */
export const reader: TypeReader<"sessionLog"> = {
  ready: true,
  read: (db) => async (id): Promise<SessionLogSource | null> => {
    const markdown = await readLog(db, id);
    return markdown === null ? null : { id, path: logPath(id), markdown };
  },
};
