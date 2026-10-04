import {
  concept,
  event,
  LOCAL_LEARNER_ID,
  type OwnerScope,
  readableOwners,
  review,
  SCHEDULE_LIMITS,
} from "@self-learn/schema";
import { and, asc, eq, gt, inArray, lte, notInArray, sql } from "drizzle-orm";

import { ownedBy, readableFor, scopedRead } from "../content/scope";
import type { CatalogDatabase } from "../db";
import { DEFAULT_PARAMS, update as bktUpdate } from "../../../../scripts/learn/lib/bkt.mjs";
import { newCard, PASS_GRADE, review as sm2 } from "../../../../scripts/learn/lib/schedule.mjs";
import { StateError } from "./errors";
import { appendEvent } from "./events";
import { domainOf } from "./knowledge-base";
import { ensureLearner, withLearnerLock } from "./learner";
import { assertReadableConcepts, ensureEntry, readModel, writeModel } from "./mastery";
import { bytewise } from "../sql-order";

/**
 * `learn/state/reviews.json` as the `review` table.
 *
 * One difference, and it is deliberate: the file's cards carried a `history`
 * array of the last twenty grades, and the table has no column for it. Every
 * grade is already an `event`, so a second copy would be a second version of
 * the truth, and the two would drift the first time one of them was written
 * without the other.
 *
 * Nothing ever read `history` for behaviour. `schedule.mjs` appends to it and
 * `dueCards`/`forecast` ignore it; no `--json` output contains it. So cards
 * come back with an empty `history`, `schedule.review` appends its entry, and
 * the write drops it again. What that array recorded — that a grade happened,
 * when, and what it was — is what `learn review grade` now writes as an event,
 * which is the change that finally makes the schedule rebuildable.
 */

export interface ReviewCard {
  conceptId: string;
  repetitions: number;
  ease: number;
  intervalDays: number;
  lapses: number;
  /** ISO instant. */
  due: string;
  lastReviewed: string | null;
  leech: boolean;
  /** Always empty on the way out; see the note above. */
  history: { at: string; grade: number; intervalDays: number }[];
}

/** The document `schedule.mjs` takes: cards keyed by concept id. */
export interface Reviews {
  cards: Record<string, ReviewCard>;
}

export const emptyReviews = (): Reviews => ({ cards: {} });

function toCard(row: typeof review.$inferSelect): ReviewCard {
  return {
    conceptId: row.conceptSlug,
    repetitions: row.repetitions,
    ease: row.ease,
    intervalDays: row.intervalDays,
    lapses: row.lapses,
    due: row.due.toISOString(),
    lastReviewed: row.lastReviewed === null ? null : row.lastReviewed.toISOString(),
    leech: row.leech,
    history: [],
  };
}

export async function readReviews(
  db: CatalogDatabase,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<Reviews> {
  const rows = await db.select().from(review).where(eq(review.learnerId, learnerId));
  const reviews = emptyReviews();
  for (const row of rows) reviews.cards[row.conceptSlug] = toCard(row);
  return reviews;
}

/**
 * The rows a card becomes, with the two bounds the table enforces checked here
 * first so the error names the card rather than a CHECK constraint.
 *
 * `intervalDays` is the one worth explaining: `newCard()` starts at 0 and the
 * column's floor is 1. No path persists a fresh card — `observe` and `review
 * grade` both run it through `schedule.review` first, which sets at least 1 —
 * so a 0 arriving here means a caller invented a card and skipped the
 * scheduler, which is a bug in that caller and not something to round away.
 */
function toRow(learnerId: string, card: ReviewCard) {
  const due = new Date(card.due);
  if (Number.isNaN(due.getTime())) {
    throw new StateError(`review card "${card.conceptId}" has an unparseable due date`);
  }
  if (!Number.isInteger(card.intervalDays) || card.intervalDays < 1) {
    throw new StateError(
      `review card "${card.conceptId}" has intervalDays ${card.intervalDays}; ` +
        `a stored card must have been through the scheduler at least once.`,
    );
  }
  if (card.ease < SCHEDULE_LIMITS.minEase) {
    throw new StateError(
      `review card "${card.conceptId}" has ease ${card.ease}, below the SM-2 floor of ` +
        `${SCHEDULE_LIMITS.minEase}.`,
    );
  }
  return {
    learnerId,
    conceptSlug: card.conceptId,
    repetitions: card.repetitions,
    ease: card.ease,
    intervalDays: Math.min(card.intervalDays, SCHEDULE_LIMITS.maxIntervalDays),
    lapses: card.lapses,
    due,
    lastReviewed: card.lastReviewed === null ? null : new Date(card.lastReviewed),
    leech: card.leech,
  };
}

const CARD_SET = {
  repetitions: sql`excluded.repetitions`,
  ease: sql`excluded.ease`,
  intervalDays: sql`excluded.interval_days`,
  lapses: sql`excluded.lapses`,
  due: sql`excluded.due`,
  lastReviewed: sql`excluded.last_reviewed`,
  leech: sql`excluded.leech`,
  updatedAt: sql`now()`,
};

/** Write one card. What `observe` and `review grade` actually need. */
export async function upsertReview(
  db: CatalogDatabase,
  card: ReviewCard,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<ReviewCard> {
  await ensureLearner(db, learnerId);
  await db
    .insert(review)
    .values(toRow(learnerId, card))
    .onConflictDoUpdate({ target: [review.learnerId, review.conceptSlug], set: CARD_SET });
  return card;
}

/**
 * Replace the whole schedule: upsert every card, drop every row not in the
 * document. Used by the backfill and by anything that rebuilds.
 */
export async function writeReviews(
  db: CatalogDatabase,
  reviews: Reviews,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<Reviews> {
  const cards = Object.values(reviews.cards);
  await ensureLearner(db, learnerId);
  await db.transaction(async (tx) => {
    if (cards.length > 0) {
      await tx
        .insert(review)
        .values(cards.map((card) => toRow(learnerId, card)))
        .onConflictDoUpdate({ target: [review.learnerId, review.conceptSlug], set: CARD_SET });
    }
    const slugs = cards.map((card) => card.conceptId);
    const scope = eq(review.learnerId, learnerId);
    await tx
      .delete(review)
      .where(
        slugs.length === 0 ? scope : and(scope, notInArray(review.conceptSlug, slugs)),
      );
  });
  return reviews;
}

/**
 * Cards due at or before `now`, most overdue first, straight from SQL.
 *
 * `schedule.mjs` has a `dueCards` that does the same filter in memory, and the
 * CLI still uses it because it already holds the whole document. This exists
 * for the callers that do not — the web app asks "what is due" and has no
 * reason to pull every card across the wire to find out.
 *
 * Only cards on concepts the learner may read (phase 4): a card on another
 * owner's concept cannot be graded (`assertReadableConcepts`), and listing it
 * would put that concept's slug on the dashboard and in the streak's count.
 */
export async function dueReviews(
  db: CatalogDatabase,
  options: { now?: Date; limit?: number; learnerId?: string } = {},
): Promise<ReviewCard[]> {
  const { now = new Date(), limit, learnerId = LOCAL_LEARNER_ID } = options;
  const owners = await readableFor(db, learnerId);
  const readable =
    owners === undefined
      ? undefined
      : inArray(review.conceptSlug, db.select({ slug: concept.slug }).from(concept).where(ownedBy(concept.ownerId, owners)));
  const query = db
    .select()
    .from(review)
    .where(and(eq(review.learnerId, learnerId), lte(review.due, now), readable))
    .orderBy(asc(review.due));
  const rows = await (limit === undefined ? query : query.limit(limit));
  return rows.map(toCard);
}

/** The cards for a named set of concepts. Used by the backfill's assertion. */
export async function readCards(
  db: CatalogDatabase,
  slugs: string[],
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<ReviewCard[]> {
  if (slugs.length === 0) return [];
  const rows = await db
    .select()
    .from(review)
    .where(and(eq(review.learnerId, learnerId), inArray(review.conceptSlug, slugs)));
  return rows.map(toCard);
}

/* -------------------------------------------------------------------------- */
/* Grading                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One review, applied: the next card for `grade` on the SM-2 scale (0 to 5).
 *
 * Pure. The maths is `schedule.mjs`'s `review`, unchanged; what lives here is
 * the one decision every caller used to make for itself, which is that a
 * concept with no card yet is graded as a fresh one created at `now`. The CLI's
 * `review grade`, the web app's rating buttons and the interval each button
 * previews all go through this, so the number under "Good" is the interval
 * pressing it will actually write.
 */
export function scheduleCard(
  card: ReviewCard | null | undefined,
  conceptId: string,
  grade: number,
  now: Date,
): ReviewCard {
  const current = card ?? (newCard(conceptId, now) as ReviewCard);
  return sm2(current, grade, { now }) as ReviewCard;
}

/**
 * The four ratings a person can press, as SM-2 grades, in button order.
 *
 * Anki's names over the six-point SM-2 scale the `/review` skill asks for:
 * Easy is 5 (instant), Good 4 (slight hesitation), Hard 3 (correct but hard
 * work, the lowest passing grade). Again is 1, "wrong, though it felt
 * familiar": the skill separates 0, 1 and 2 only "when it matters", and to the
 * scheduler and to BKT they are the same failure, so one button is honest.
 * `gradeFromOutcome` in `schedule.mjs` picks 1 for a wrong answer at an
 * ordinary p(L) for the same reason.
 */
export const REVIEW_RATINGS = [
  { rating: 0, name: "again", grade: 1 },
  { rating: 1, name: "hard", grade: 3 },
  { rating: 2, name: "good", grade: 4 },
  { rating: 3, name: "easy", grade: 5 },
] as const;

export type ReviewRating = (typeof REVIEW_RATINGS)[number]["rating"];

/** A rating (0 to 3) to its SM-2 grade. Throws a `StateError` on anything else. */
export function gradeForRating(rating: number): number {
  const found = REVIEW_RATINGS.find((r) => r.rating === rating);
  if (found === undefined) {
    throw new StateError(`rating must be 0, 1, 2 or 3 (again, hard, good, easy); got ${rating}.`);
  }
  return found.grade;
}

/**
 * The rating a recorded SM-2 grade reads as: the button with that grade, or
 * for a grade no button sends (the CLI's 0, 2), the failed or passed button
 * nearest it. Used to report a replayed grade in the page's own terms.
 */
export function ratingForGrade(grade: number): ReviewRating {
  const exact = REVIEW_RATINGS.find((r) => r.grade === grade);
  if (exact !== undefined) return exact.rating;
  return grade < PASS_GRADE ? 0 : grade >= 5 ? 3 : grade >= 4 ? 2 : 1;
}

/**
 * The interval, in days, each of the four ratings would give this card now.
 * Index `i` is rating `i`. Exact rather than estimated: it runs the same
 * `scheduleCard` a grade does, fuzz included, since the fuzz is deterministic.
 */
export function previewIntervals(
  card: ReviewCard | null | undefined,
  conceptId: string,
  now: Date,
): [number, number, number, number] {
  const days = REVIEW_RATINGS.map((r) => scheduleCard(card, conceptId, r.grade, now).intervalDays);
  return days as [number, number, number, number];
}

export interface GradeReviewInput {
  conceptId: string;
  /** SM-2 grade, 0 to 5. */
  grade: number;
  /** One clock for the card, the model and the event (see `learn/replay.ts`). */
  now?: Date;
  learnerId?: string;
  /**
   * The caller's name for this one answer, kept on the event. A second call
   * with the same id records nothing and answers with what the first one
   * wrote. The web app sends one per card, so a retry after a response that
   * was lost in transit cannot count one answer twice. The CLI sends none.
   */
  requestId?: string;
}

export interface GradeReviewResult {
  /**
   * The card as it stands after this call. On a replay that is the stored
   * card now, which is the schedule the caller should believe; it is the one
   * the first write produced unless another grade has moved it since.
   */
  card: ReviewCard;
  /** The grade on record: the one asked for, or on a replay the first one. */
  grade: number;
  pLBefore: number;
  pL: number;
  /** True when `requestId` had already been recorded and nothing was written. */
  replayed: boolean;
}

/**
 * Record one review grade: a `review` event, the card rescheduled, the mastery
 * entry updated, all under the learner lock and in one transaction.
 *
 * This is `learn review grade`, moved out of the CLI so the web app's
 * `POST /api/review/grade` records a grade by running the same function rather
 * than a copy of it. The event comes first and carries everything a replay
 * needs (`grade`, and the instant as `at`), so `review rebuild` reproduces a
 * card graded from a page exactly as it does one graded from the terminal.
 *
 * The lock matters for the same reason it does in `observe`: this reads the
 * card and the model, computes from both, and writes them back, and two tabs
 * grading at once would otherwise both read the same card.
 */
export async function gradeReview(
  db: CatalogDatabase,
  input: GradeReviewInput,
): Promise<GradeReviewResult> {
  const { conceptId, grade, now = new Date(), learnerId = LOCAL_LEARNER_ID, requestId } = input;
  if (!Number.isFinite(grade) || grade < 0 || grade > 5) {
    throw new StateError(`grade must be between 0 and 5; got ${grade}.`);
  }
  await assertReadableConcepts(db, [conceptId], learnerId);
  const at = now.toISOString();
  const passed = grade >= PASS_GRADE;

  return withLearnerLock(db, learnerId, async (tx) => {
    const current = await readCards(tx, [conceptId], learnerId);

    // Inside the lock, so two copies of one request cannot both miss the
    // other: the second waits for the first to commit and then finds it.
    if (requestId !== undefined) {
      const [seen] = await tx
        .select({ payload: event.payload })
        .from(event)
        .where(
          and(
            eq(event.learnerId, learnerId),
            eq(event.type, "review"),
            eq(event.conceptSlug, conceptId),
            sql`${event.payload}->>'requestId' = ${requestId}`,
          ),
        )
        .limit(1);
      const stored = current[0];
      if (seen !== undefined && stored !== undefined) {
        const payload = seen.payload as { grade?: number; pLBefore?: number; pLAfter?: number };
        return {
          card: stored,
          grade: Number(payload.grade),
          pLBefore: Number(payload.pLBefore),
          pL: Number(payload.pLAfter),
          replayed: true,
        };
      }
    }

    const card = scheduleCard(current[0], conceptId, grade, now);

    const model = await readModel(tx, learnerId);
    const entry = ensureEntry(model, conceptId);
    const pLBefore = entry.pL;
    entry.pL = bktUpdate(pLBefore, passed, {
      params: model.params as unknown as typeof DEFAULT_PARAMS,
    }) as number;
    entry.observations += 1;
    if (passed) entry.correct += 1;
    entry.lastSeen = at;

    await appendEvent(
      tx,
      { at, type: "review", concept: conceptId, grade, pLBefore, pLAfter: entry.pL, requestId },
      learnerId,
    );
    await upsertReview(tx, card, learnerId);
    await writeModel(tx, model, learnerId);

    return { card, grade, pLBefore, pL: entry.pL, replayed: false };
  });
}

/* -------------------------------------------------------------------------- */
/* The queue a review session works through                                  */
/* -------------------------------------------------------------------------- */

export interface ReviewQueueItem {
  conceptId: string;
  title: string;
  summary: string;
  /** Folder the note lives in, e.g. `algorithms`. Presentation only. */
  domain: string | null;
  /** Null when the concept was asked for by name and has never been scheduled. */
  card: ReviewCard | null;
  /** The interval each rating would give, in days, index = rating. */
  intervals: [number, number, number, number];
}

export interface ReviewQueue {
  items: ReviewQueueItem[];
  /** The soonest due instant after `now` across every card, or null. */
  nextDue: string | null;
}

/**
 * The cards due at `now`, most overdue first, each with its concept's title and
 * summary and the four intervals its buttons would give.
 *
 * `focus` names one concept to put first whether or not it is due, which is
 * what a `/review?concept=` link asks for: reviewing early is allowed (SM-2
 * simply schedules from today), and a concept that has never been scheduled
 * gets the fresh card `review grade` would make for it. A focus the catalog has
 * no concept for is dropped rather than refused, since it came from a URL.
 */
export async function reviewQueue(
  db: CatalogDatabase,
  options: { now?: Date; focus?: string | null; limit?: number; learnerId?: string } = {},
): Promise<ReviewQueue> {
  const { now = new Date(), focus = null, limit, learnerId = LOCAL_LEARNER_ID } = options;
  const due = await dueReviews(db, { now, limit, learnerId });

  const cards: (ReviewCard | { conceptId: string; card: null })[] = [...due];
  if (focus !== null && focus !== "") {
    const at = due.findIndex((c) => c.conceptId === focus);
    if (at > 0) cards.unshift(...cards.splice(at, 1));
    if (at === -1) {
      const [stored] = await readCards(db, [focus], learnerId);
      cards.unshift(stored ?? { conceptId: focus, card: null });
    }
  }

  const slugs = cards.map((c) => c.conceptId);
  const rows =
    slugs.length === 0
      ? []
      : // Only concepts the learner may read (phase 4): a focus naming
        // another owner's concept is dropped like one the catalog lacks.
        await scopedRead(db, readableOwners(learnerId), (owners) =>
          db
            .select({ slug: concept.slug, title: concept.title, summary: concept.summary, path: concept.path })
            .from(concept)
            .where(and(inArray(concept.slug, slugs), ownedBy(concept.ownerId, owners))),
        );
  const bySlug = new Map(rows.map((row) => [row.slug, row]));

  const items: ReviewQueueItem[] = [];
  for (const entry of cards) {
    const row = bySlug.get(entry.conceptId);
    // A due card whose concept left the catalog cannot be graded either
    // (`assertReadableConcepts`), so showing it would be a button that 400s.
    if (row === undefined) continue;
    const card = "card" in entry ? null : entry;
    items.push({
      conceptId: row.slug,
      title: row.title,
      summary: row.summary ?? "",
      domain: domainOf(row.path),
      card,
      intervals: previewIntervals(card, row.slug, now),
    });
  }

  const [next] = await db
    .select({ due: review.due })
    .from(review)
    .where(and(eq(review.learnerId, learnerId), gt(review.due, now)))
    .orderBy(asc(review.due))
    .limit(1);

  return { items, nextDue: next === undefined ? null : next.due.toISOString() };
}

export interface ConceptSummary {
  conceptId: string;
  title: string;
  summary: string;
  domain: string | null;
}

/**
 * Every concept's one-line summary. A review session draws the wrong options
 * of a multiple-choice card from these when the queue itself is too short to
 * supply them, so it is one narrow query rather than the whole knowledge base.
 * Scoped (phase 4), so a distractor is never another owner's concept.
 */
export async function conceptSummaries(db: CatalogDatabase, scope: OwnerScope): Promise<ConceptSummary[]> {
  const rows = await scopedRead(db, scope.readable, (owners) =>
    db
      .select({ slug: concept.slug, title: concept.title, summary: concept.summary, path: concept.path })
      .from(concept)
      .where(ownedBy(concept.ownerId, owners))
      .orderBy(asc(bytewise(concept.slug))),
  );
  return rows.map((row) => ({
    conceptId: row.slug,
    title: row.title,
    summary: row.summary ?? "",
    domain: domainOf(row.path),
  }));
}
