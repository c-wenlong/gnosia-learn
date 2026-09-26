import { readConceptGraph, recordObservation } from "@self-learn/catalog/state";

import { BadRequest, handler, optionalBoolean, requireBoolean } from "@/lib/learner-api";
import { isConceptSlug } from "@/lib/concept-workspace-core";
import { isSessionToken, OBSERVE_SOURCES, SESSION_TEXT_LIMIT, type ObserveSource } from "@/lib/session-core";

/**
 * `POST /api/learner/observe`: one graded answer from a session, recorded as
 * evidence.
 *
 * ```ts
 * { conceptSlug, correct, source: "probe" | "teach", requestId, sessionId?, question?, answer?, chosen?, closeSession? }
 * ```
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
 */

interface ObserveRequest {
  conceptSlug: string;
  correct: boolean;
  source: ObserveSource;
  requestId: string;
  sessionId: string | null;
  question: string | null;
  /** The correct answer, as `learn observe --answer` means it. */
  answer: string | null;
  /** What the learner picked; null for "I don't know". */
  chosen: string | null;
  /** Close the session once this answer is recorded: the page leaving mid-save. */
  closeSession: boolean;
}

function optionalText(body: Record<string, unknown>, field: string): string | null {
  const value = body[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new BadRequest(`"${field}" must be a string.`);
  if (value.length > SESSION_TEXT_LIMIT) {
    throw new BadRequest(`"${field}" is longer than ${SESSION_TEXT_LIMIT} characters.`);
  }
  return value.trim() === "" ? null : value;
}

function parseObserve(body: Record<string, unknown>): ObserveRequest {
  const conceptSlug = body.conceptSlug;
  if (!isConceptSlug(conceptSlug)) {
    throw new BadRequest(`"conceptSlug" must be a concept id: lowercase letters, digits and hyphens.`);
  }
  const correct = requireBoolean(body, "correct");
  const source = body.source;
  if (typeof source !== "string" || !(OBSERVE_SOURCES as readonly string[]).includes(source)) {
    throw new BadRequest(`"source" must be "probe" or "teach". A review grade goes to /api/review/grade.`);
  }
  if (!isSessionToken(body.requestId)) {
    throw new BadRequest(`"requestId" is required: a short token of letters, digits, "-" and "_".`);
  }
  const sessionId = body.sessionId;
  if (sessionId !== undefined && sessionId !== null && !isSessionToken(sessionId)) {
    throw new BadRequest(`"sessionId" must be a short token of letters, digits, "-" and "_".`);
  }
  return {
    conceptSlug,
    correct,
    source: source as ObserveSource,
    requestId: body.requestId,
    sessionId: typeof sessionId === "string" ? sessionId : null,
    question: optionalText(body, "question"),
    answer: optionalText(body, "answer"),
    chosen: optionalText(body, "chosen"),
    closeSession: optionalBoolean(body, "closeSession", false),
  };
}

export const POST = handler("observe", parseObserve, async (db, input: ObserveRequest) => {
  const graph = await readConceptGraph(db);
  const titleOf = (slug: string) => (graph.nodes.get(slug) as { title?: string } | undefined)?.title ?? slug;

  const recorded = await recordObservation(db, {
    conceptId: input.conceptSlug,
    correct: input.correct,
    graph,
    source: input.source,
    question: input.question,
    answer: input.answer,
    chosen: input.chosen,
    session: input.sessionId,
    // The first answer opens the session, in the answer's own transaction:
    // a refused answer leaves no `session-start`, and a closed session (or a
    // studio one) refuses the answer. Idempotent for every later answer.
    openSession: input.sessionId === null ? undefined : { title: titleOf(input.conceptSlug), goal: input.conceptSlug },
    requestId: input.requestId,
    // A page going away with an answer still saving sends it again with this:
    // the answer and the close commit together, so neither lands without the
    // other. The answer is idempotent by its request id, so whichever copy
    // arrives first records it and the other replays.
    closeSession: input.closeSession,
  });

  return {
    concept: recorded.concept,
    correct: recorded.correct,
    pLBefore: recorded.pLBefore,
    pLAfter: recorded.pLAfter,
    delta: recorded.pLAfter - recorded.pLBefore,
    mastery: recorded.mastery,
    mastered: recorded.mastered,
    due: recorded.due,
    propagated: recorded.propagated.map((p) => ({ ...p, title: titleOf(p.concept) })),
    card:
      recorded.card === null
        ? null
        : { due: recorded.card.due, intervalDays: recorded.card.intervalDays, created: recorded.cardCreated },
    session: input.sessionId,
    replayed: recorded.replayed,
    closed: recorded.closed,
  };
});
