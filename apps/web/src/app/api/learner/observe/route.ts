import { observeTurn } from "@gnosia/tutor/server/learner-writes";

import { turnRoute } from "@/lib/learner-api";

/**
 * `POST /api/learner/observe`: one graded answer from a session, recorded as
 * evidence.
 *
 * ```ts
 * { conceptSlug, correct, source: "probe" | "teach", requestId, sessionId?, question?, answer?, chosen?, closeSession?, module?, sessionTitle?, sessionGoal? }
 * ```
 *
 * `sessionTitle` and `sessionGoal` name the session the answer opens, and are
 * read only then: the course topic tutor's chat (recall in the chat, phase 3)
 * records answers on several concepts in one session, which is the topic's,
 * not its first concept's. Without them a session is named after the concept.
 *
 * `module` is set by a module's week check (docs/proposals/module-learning-path.md,
 * "The week check"): a live module id the owner can read, written into the
 * event's payload, and the session the first answer opens is then the
 * module's (its title, the module id as its goal). An id the catalog has no
 * live module for, or one the owner cannot read, is a 400 like an unknown
 * concept.
 *
 * It runs `recordObservation`, the function `learn observe` runs, so an answer
 * from this page and one from the terminal are the same write: an
 * `observation` event with `correct`, `pLBefore`, `pLAfter`, the grade and the
 * session; then the mastery row (a correct answer spread to the
 * prerequisites); then the concept's review card, created or rescheduled. All
 * of it under the learner lock in one transaction, which is layering rule 11:
 * a page never assembles evidence itself.
 *
 * `source` is `probe` (asked before teaching: it measures, so no BKT learning
 * step) or `teach` (asked after it). A review grade is `POST /api/review/grade`,
 * never this. The graph a correct answer propagates along is the catalog's
 * (`readConceptGraph`), the one every page's frontier is computed from.
 *
 * `sessionId` names the session the answer belongs to. The first answer opens
 * it (the row and one `session-start` event) inside the same locked
 * transaction as the answer, so a visit that answers nothing leaves no row
 * behind, a refused answer leaves no start, and a closed session refuses.
 *
 * `requestId` is required and names this one answer. The page makes one per
 * answer and resends it on a retry, so an answer that was saved but whose
 * response never arrived is found and answered (`replayed: true`) rather than
 * recorded twice in a log nothing can delete from.
 *
 * The answer mirrors `learn observe --json` (concept, correct, pLBefore,
 * pLAfter, delta, mastery, mastered, due, propagated) plus the card it wrote,
 * each propagated concept's title, the session and `replayed`. `logged` is
 * not there: the markdown session log is the CLI's, and a page never writes
 * under `learn/`. Guarded like every `/api/learner/*` route: same origin, 60 a
 * minute, and a concept the catalog does not know is a 400, not a 503.
 *
 * The parse and the write are `observeTurn` in
 * `@gnosia/tutor/server/learner-writes`, which the sidecar runs too.
 */
export const POST = turnRoute("observe", observeTurn);
