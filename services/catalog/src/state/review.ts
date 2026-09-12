import { LOCAL_LEARNER_ID, review, SCHEDULE_LIMITS } from "@self-learn/schema";
import { and, asc, eq, inArray, lte, notInArray, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { StateError } from "./errors";
import { ensureLearner } from "./learner";

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
 */
export async function dueReviews(
  db: CatalogDatabase,
  options: { now?: Date; limit?: number; learnerId?: string } = {},
): Promise<ReviewCard[]> {
  const { now = new Date(), limit, learnerId = LOCAL_LEARNER_ID } = options;
  const query = db
    .select()
    .from(review)
    .where(and(eq(review.learnerId, learnerId), lte(review.due, now)))
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
