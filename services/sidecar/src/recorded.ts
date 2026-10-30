import { readConceptGraph, readConceptObservations, type CatalogDatabase } from "@gnosia/catalog/state";
import { mastery, review } from "@gnosia/schema";
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
  /** When the catalog last wrote the row: the app keeps it as the row's merge clock. */
  updatedAt: string;
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
  updatedAt: string;
}

export interface RecordedRows {
  mastery: RecordedMastery[];
  review: RecordedReview[];
}

/**
 * The owner's mastery and review rows for `concepts`, the ones that exist,
 * each with its own `updatedAt`. The app stamps its copy with that rather
 * than the moment the reply arrived, so a web answer committed in between
 * still outdates it at the next snapshot. Read whole and filtered here: a
 * learner's rows are few, and the tables are all this needs.
 */
export async function recordedRows(db: CatalogDatabase, owner: string, concepts: string[]): Promise<RecordedRows> {
  const wanted = new Set(concepts);
  const [masteryRows, reviewRows] = await Promise.all([db.select().from(mastery), db.select().from(review)]);
  const mine = <R extends { learnerId: string; conceptSlug: string }>(row: R) =>
    row.learnerId === owner && wanted.has(row.conceptSlug);
  const iso = (at: Date | null) => (at === null ? null : at.toISOString());
  return {
    mastery: masteryRows.filter(mine).map((row) => ({
      conceptSlug: row.conceptSlug,
      pL: row.pL,
      observations: row.observations,
      correct: row.correct,
      lastSeen: iso(row.lastSeen),
      updatedAt: row.updatedAt.toISOString(),
    })),
    review: reviewRows.filter(mine).map((row) => ({
      conceptSlug: row.conceptSlug,
      repetitions: row.repetitions,
      ease: row.ease,
      intervalDays: row.intervalDays,
      lapses: row.lapses,
      due: row.due.toISOString(),
      lastReviewed: iso(row.lastReviewed),
      leech: row.leech,
      updatedAt: row.updatedAt.toISOString(),
    })),
  };
}

/** What a reply gains besides the rows: the concepts to read rows for, and any fields the turn's own reply leaves out. */
export interface Extras {
  concepts: string[];
  fields?: Record<string, unknown>;
}

type Gather = (db: CatalogDatabase, deps: TutorDeps, body: unknown, result: Record<string, unknown>) => Promise<Extras>;

/**
 * An observe's extras. The concepts are the one answered and, for a correct
 * answer, every prerequisite it could spread to, whether or not the catalog's
 * copy moved: `propagated` lists only the ones that rose, and a prerequisite
 * the catalog already holds near its ceiling is exactly the one whose local
 * estimate (the app propagated from an older prior) needs replacing. The
 * field is the SM-2 grade the answer was recorded with, which depends on the
 * catalog's posterior and which the turn's reply does not carry.
 */
export const observedExtras: Gather = async (db, deps, body, result) => {
  const concept = typeof result.concept === "string" ? result.concept : null;
  if (concept === null) return { concepts: [] };
  const concepts = [concept, ...namedConcepts(result.propagated)];
  if (result.correct === true) concepts.push(...prerequisitesOf(await readConceptGraph(db, deps.scope), concept));
  const requestId = (body as { requestId?: unknown } | null)?.requestId;
  const fields: Record<string, unknown> = {};
  if (typeof requestId === "string") {
    const recorded = (await readConceptObservations(db, deps.owner, [concept])).find((e) => e.requestId === requestId);
    if (typeof recorded?.grade === "number") fields.grade = recorded.grade;
  }
  return { concepts, fields };
};

/** A review grade's extras: the concept it moved (its reply already carries the grade). */
export const gradedExtras: Gather = async (_db, _deps, _body, result) => ({
  concepts: typeof result.concept === "string" ? [result.concept] : [],
});

function namedConcepts(list: unknown): string[] {
  return Array.isArray(list)
    ? list.flatMap((p) =>
        p !== null && typeof p === "object" && typeof (p as { concept?: unknown }).concept === "string"
          ? [(p as { concept: string }).concept]
          : [],
      )
    : [];
}

/** Every concept `slug` requires, transitively, along the graph's `requires` edges. */
export function prerequisitesOf(graph: { nodes: Map<string, unknown> }, slug: string): string[] {
  const seen = new Set([slug]);
  const queue = [slug];
  const out: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const requires = (graph.nodes.get(current) as { requires?: unknown } | undefined)?.requires;
    for (const next of Array.isArray(requires) ? requires : []) {
      if (typeof next !== "string" || seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
      out.push(next);
    }
  }
  return out;
}

type Turn = (deps: TutorDeps, body: unknown) => Promise<TurnReply>;

/**
 * `turn` with the rows it moved added to a successful reply's `result` as
 * `rows`, plus the extras' fields. A refusal, or a reply of another shape,
 * passes through untouched.
 */
export function withRecordedRows(turn: Turn, gather: Gather): Turn {
  return async (deps, body) => {
    const reply = await turn(deps, body);
    const envelope = reply.body as { ok?: unknown; result?: unknown } | null;
    if (reply.status !== 200 || envelope === null || envelope.ok !== true) return reply;
    const result = envelope.result;
    if (result === null || typeof result !== "object" || Array.isArray(result)) return reply;
    try {
      const db = await deps.db;
      const extras = await gather(db, deps, body, result as Record<string, unknown>);
      const rows = await recordedRows(db, deps.owner, extras.concepts);
      return { ...reply, body: { ...envelope, result: { ...extras.fields, ...result, rows } } };
    } catch (error) {
      console.error("sidecar: the answer was recorded but its rows could not be read back", error);
      return reply;
    }
  };
}
