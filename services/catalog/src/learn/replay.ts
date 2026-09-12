import {
  newCard,
  review as reviewCard,
} from "../../../../scripts/learn/lib/schedule.mjs";
import { voidedSessions, type EventRecord } from "../state/events";
import { emptyReviews, type ReviewCard, type Reviews } from "../state/review";

/**
 * Rebuilding the spaced-repetition schedule from the event log.
 *
 * This did not exist before bundle 5, and `learn/README.md` said so:
 * "`reviews.json` is the exception and is not backed up by anything. Review
 * events are appended to the log, but no command replays them, so deleting the
 * file loses every scheduled review permanently."
 *
 * Two changes make the replay exact rather than approximate.
 *
 * **One clock per write.** `observe` and `review grade` now take `new Date()`
 * once and use it for the card's `now`, the model's `lastSeen` and the event's
 * `at`. Before, each was its own call and the three drifted by a few
 * milliseconds, so a replay reproduced due dates that were nearly but not quite
 * the stored ones.
 *
 * **Every scheduling answer says so.** An observation carries `grade` and
 * `scheduled` in its payload, so a replay knows both what the card was graded
 * and whether `--schedule false` skipped it. An event written before that flag
 * existed has no `scheduled` key and is read as scheduled, which is what the
 * CLI did unconditionally at the time.
 */

/** An event that moved a card, in the order it moved it. */
export interface ScheduledGrade {
  concept: string;
  grade: number;
  at: string;
}

/** The grades in the log, oldest first, with voided sessions dropped. */
export function scheduledGrades(events: readonly EventRecord[]): ScheduledGrade[] {
  const voided = voidedSessions(events);
  const out: ScheduledGrade[] = [];

  for (const record of events) {
    if (record.type !== "observation" && record.type !== "review") continue;
    if (typeof record.session === "string" && voided.has(record.session)) continue;
    if (record.type === "observation" && record.scheduled === false) continue;

    const concept = record.concept;
    const grade = Number(record.grade);
    if (typeof concept !== "string" || concept === "") continue;
    if (!Number.isFinite(grade)) continue;

    out.push({ concept, grade, at: record.at });
  }
  return out;
}

/**
 * Replay the log into a schedule. Each grade is applied with the event's own
 * instant as `now`, which is what makes the rebuilt due dates identical to the
 * ones the original writes produced rather than a day out from today.
 */
export function replayReviews(events: readonly EventRecord[]): {
  reviews: Reviews;
  applied: number;
} {
  const reviews = emptyReviews();
  const grades = scheduledGrades(events);

  for (const { concept, grade, at } of grades) {
    const now = new Date(at);
    const existing: ReviewCard = reviews.cards[concept] ?? newCard(concept, now);
    reviews.cards[concept] = reviewCard(existing, grade, { now }) as ReviewCard;
  }

  return { reviews, applied: grades.length };
}
