import { closeTutorSession } from "@self-learn/catalog/state";

import { BadRequest, handler } from "@/lib/learner-api";
import { isSessionToken } from "@/lib/session-core";

/**
 * `POST /api/learner/session/close` with `{ sessionId }`: the close screen's
 * write.
 *
 * `closeTutorSession` appends a `session-close` event naming the concepts the
 * session's observations touched and moves the `session` row to `closed`, the
 * database half of `learn session close`. The file half (a summary appended to
 * the markdown log, a backlink written into each note) is the CLI's alone,
 * since a page never writes under `learn/`.
 *
 * Idempotent: a session that is already closed, or that no answer ever opened,
 * writes nothing and answers `closed: false` with the counts. So the page can
 * send it on every arrival at the close screen without a second event.
 */
export const POST = handler(
  "session-close",
  (body) => {
    if (!isSessionToken(body.sessionId)) {
      throw new BadRequest(`"sessionId" is required: a short token of letters, digits, "-" and "_".`);
    }
    return { sessionId: body.sessionId };
  },
  async (db, { sessionId }: { sessionId: string }, owner) => closeTutorSession(db, sessionId, { learnerId: owner }),
);
