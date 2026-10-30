import { sessionCloseTurn } from "@gnosia/tutor/server/learner-writes";

import { turnRoute } from "@/lib/learner-api";

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
 *
 * The parse and the write are `sessionCloseTurn` in
 * `@gnosia/tutor/server/learner-writes`, which the sidecar runs too.
 */
export const POST = turnRoute("session-close", sessionCloseTurn);
