import { readCards, readModel, type CatalogDatabase } from "@gnosia/catalog/state";
import type { TutorDeps } from "@gnosia/tutor/server/deps";
import type { TurnReply } from "@gnosia/tutor/server/turns";

/**
 * The catalog's rows behind an answer, sent back with the answer's reply.
 *
 * The macOS app draws an answer's p(L) and card the moment it is picked,
 * from its own copy of the rules, and keeps the rows in learner.db until a
 * snapshot brings the catalog's back. Once the catalog has recorded the
 * answer, those rows are the truth: the learner may have answered on the web
 * since the last snapshot, so the catalog's prior, and so its posterior, can
 * differ from the app's. The web reads the rows straight from the database;
 * the app reads them here, on the reply to the write that moved them, and
 * replaces its own (S9-06).
 *
 * The rows are read after the write commits, outside its lock, so they are
 * the catalog's state as it stands then: a write that slipped in between is
 * in them, which is what the app should show. A read that fails costs the
 * rows and nothing else: the answer is recorded, and the reply says so
 * without them.
 */

export interface RecordedMastery {
  conceptSlug: string;
  pL: number;
  observations: number;
  correct: number;
  lastSeen: string | null;
}

export interface RecordedReview {
  conceptSlug: string;
  repetitions: number;
  ease: number;
  intervalDays: number;
  lapses: number;
  due: string;
  lastReviewed: string | null;
  leech: boolean;
}

export interface RecordedRows {
  mastery: RecordedMastery[];
  review: RecordedReview[];
}

/** The owner's mastery and review rows for `concepts`, the ones that exist. */
export async function recordedRows(db: CatalogDatabase, owner: string, concepts: string[]): Promise<RecordedRows> {
  const wanted = [...new Set(concepts)];
  const [model, cards] = await Promise.all([readModel(db, owner), readCards(db, wanted, owner)]);
  const mastery = wanted.flatMap((slug) => {
    const entry = model.concepts[slug];
    return entry === undefined
      ? []
      : [{ conceptSlug: slug, pL: entry.pL, observations: entry.observations, correct: entry.correct, lastSeen: entry.lastSeen }];
  });
  const review = cards.map((card) => ({
    conceptSlug: card.conceptId,
    repetitions: card.repetitions,
    ease: card.ease,
    intervalDays: card.intervalDays,
    lapses: card.lapses,
    due: card.due,
    lastReviewed: card.lastReviewed,
    leech: card.leech,
  }));
  return { mastery, review };
}

/** The concepts an observe reply moved: the one answered and each prerequisite it spread to. */
export function observedConcepts(result: Record<string, unknown>): string[] {
  const concept = typeof result.concept === "string" ? [result.concept] : [];
  const propagated = Array.isArray(result.propagated)
    ? result.propagated.flatMap((p) =>
        p !== null && typeof p === "object" && typeof (p as { concept?: unknown }).concept === "string"
          ? [(p as { concept: string }).concept]
          : [],
      )
    : [];
  return [...concept, ...propagated];
}

/** The concept a review grade moved. */
export function gradedConcepts(result: Record<string, unknown>): string[] {
  return typeof result.concept === "string" ? [result.concept] : [];
}

type Turn = (deps: TutorDeps, body: unknown) => Promise<TurnReply>;

/**
 * `turn` with the rows it moved added to a successful reply's `result` as
 * `rows`. A refusal, or a reply of another shape, passes through untouched.
 */
export function withRecordedRows(turn: Turn, conceptsOf: (result: Record<string, unknown>) => string[]): Turn {
  return async (deps, body) => {
    const reply = await turn(deps, body);
    const envelope = reply.body as { ok?: unknown; result?: unknown } | null;
    if (reply.status !== 200 || envelope === null || envelope.ok !== true) return reply;
    const result = envelope.result;
    if (result === null || typeof result !== "object" || Array.isArray(result)) return reply;
    try {
      const rows = await recordedRows(await deps.db, deps.owner, conceptsOf(result as Record<string, unknown>));
      return { ...reply, body: { ...envelope, result: { ...result, rows } } };
    } catch (error) {
      console.error("sidecar: the answer was recorded but its rows could not be read back", error);
      return reply;
    }
  };
}
