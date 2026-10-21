import { gradeForRating, gradeReview, ratingForGrade } from "@gnosia/catalog/state";

import { BadRequest, handler, MAX_ID_CHARS, requireId } from "@/lib/learner-api";
import { isRating, type Rating } from "@/lib/review-core";

/**
 * `POST /api/review/grade` with `{ conceptId, grade, requestId? }`, where
 * `grade` is the button pressed: 0 Again, 1 Hard, 2 Good, 3 Easy.
 *
 * The catalog maps it onto SM-2's scale (1, 3, 4, 5; see `REVIEW_RATINGS`) and
 * records it with `gradeReview`, the function `learn review grade` runs: a
 * `review` event first, then the card rescheduled and the mastery entry moved,
 * under the learner lock in one transaction. So a grade from this page and a
 * grade from the terminal are the same write, and `review rebuild` replays
 * both.
 *
 * `requestId` names this one answer. The page makes one per card and sends it
 * again on a retry, so a grade that was saved but whose response never
 * arrived is found and answered rather than recorded a second time
 * (`replayed: true`). A review event cannot be deleted, so a double count
 * would be permanent.
 *
 * The answer mirrors `learn review grade --json` (concept, grade on the SM-2
 * scale, due, intervalDays, ease, lapses, leech, pL) plus the `rating`
 * on record and `replayed`. On a replay `rating` and `grade` are the first
 * write's, whatever the retry asked for, and the card is the schedule as it
 * stands now. Guarded like every `/api/learner/*` route: same origin, 60 a
 * minute, and a concept the catalog does not know is a 400, not a 503.
 */
export const POST = handler(
  "review-grade",
  (body) => {
    const conceptId = requireId(body, "conceptId");
    const rating = body.grade;
    if (!isRating(rating)) {
      throw new BadRequest(`"grade" must be 0, 1, 2 or 3 (Again, Hard, Good, Easy).`);
    }
    const requestId = body.requestId;
    if (
      requestId !== undefined &&
      (typeof requestId !== "string" || !/^[A-Za-z0-9_-]+$/.test(requestId) || requestId.length > MAX_ID_CHARS)
    ) {
      throw new BadRequest(`"requestId" must be a short token of letters, digits, "-" and "_".`);
    }
    return { conceptId, rating, requestId };
  },
  async (db, { conceptId, rating, requestId }: { conceptId: string; rating: Rating; requestId?: string }, owner) => {
    const recorded = await gradeReview(db, {
      learnerId: owner,
      conceptId,
      grade: gradeForRating(rating),
      now: new Date(),
      requestId,
    });
    const { card, pL, replayed, grade } = recorded;
    return {
      concept: conceptId,
      // On a replay, the rating that was recorded, not the one this retry
      // asked for: the first write stands, and the page counts what stood.
      rating: ratingForGrade(grade),
      grade,
      due: card.due,
      intervalDays: card.intervalDays,
      ease: Number(card.ease.toFixed(2)),
      lapses: card.lapses,
      leech: card.leech,
      pL,
      replayed,
    };
  },
);
