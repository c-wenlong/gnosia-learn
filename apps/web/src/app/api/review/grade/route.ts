import { gradeForRating, gradeReview } from "@self-learn/catalog/state";

import { BadRequest, handler, requireId } from "@/lib/learner-api";
import { isRating, type Rating } from "@/lib/review-core";

/**
 * `POST /api/review/grade` with `{ conceptId, grade }`, where `grade` is the
 * button pressed: 0 Again, 1 Hard, 2 Good, 3 Easy.
 *
 * The catalog maps it onto SM-2's scale (1, 3, 4, 5; see `REVIEW_RATINGS`) and
 * records it with `gradeReview`, the function `learn review grade` runs: a
 * `review` event first, then the card rescheduled and the mastery entry moved,
 * under the learner lock in one transaction. So a grade from this page and a
 * grade from the terminal are the same write, and `review rebuild` replays
 * both.
 *
 * The answer mirrors `learn review grade --json` (concept, grade on the SM-2
 * scale, due, intervalDays, ease, lapses, leech, pL) plus the `rating` that
 * was pressed. Guarded like every `/api/learner/*` route: same origin, 60 a
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
    return { conceptId, rating };
  },
  async (db, { conceptId, rating }: { conceptId: string; rating: Rating }) => {
    const grade = gradeForRating(rating);
    const { card, pL } = await gradeReview(db, { conceptId, grade, now: new Date() });
    return {
      concept: conceptId,
      rating,
      grade,
      due: card.due,
      intervalDays: card.intervalDays,
      ease: Number(card.ease.toFixed(2)),
      lapses: card.lapses,
      leech: card.leech,
      pL,
    };
  },
);
