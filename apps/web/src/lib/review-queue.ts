import "server-only";

import { connection } from "next/server";
import {
  conceptSummaries,
  reviewQueue,
  type ConceptSummary,
  type ReviewQueueItem,
} from "@self-learn/catalog/state";

import type { ConceptCheck } from "@/lib/concept-note-core";
import { readConceptNote } from "@/lib/concept-note";
import { catalogDatabase } from "@/lib/learner-store";
import { currentOwner, ownerScope } from "@/lib/owner";
import { buildChoices, type ReviewItem, type ReviewSessionData } from "@/lib/review-core";

/**
 * The review queue as cards a page can render: the due list from the catalog,
 * each concept's note read for its check blocks, and every card turned into
 * either a multiple-choice check or a recall prompt.
 *
 * Shared by the `/review` page (through `loadReviewSession`, which marks the
 * request as dynamic) and `GET /api/review/due` (through `readReviewSession`,
 * since `connection()` throws outside a render). A database that cannot be
 * reached reads as an empty, unreachable session rather than a thrown render:
 * layering rule 14, reads degrade.
 */

/** The first check, or null. A card asks one question; the note may hold several. */
function firstCheck(checks: readonly ConceptCheck[]): ConceptCheck | null {
  return checks.find((c) => c.question.trim() !== "") ?? null;
}

/**
 * Wrong options for one card, best first: other due notes' check answers in the
 * same domain, then in any domain, then same-domain summaries, then the rest.
 * Check answers lead because they are shaped like answers; summaries only fill.
 */
function distractorPool(
  self: ReviewQueueItem,
  answers: readonly { conceptId: string; domain: string | null; answer: string }[],
  summaries: readonly ConceptSummary[],
): string[] {
  const same = (d: string | null) => d !== null && d === self.domain;
  const others = answers.filter((a) => a.conceptId !== self.conceptId && a.answer !== "");
  const notes = summaries.filter((s) => s.conceptId !== self.conceptId && s.summary !== "");
  return [
    ...others.filter((a) => same(a.domain)).map((a) => a.answer),
    ...others.filter((a) => !same(a.domain)).map((a) => a.answer),
    ...notes.filter((s) => same(s.domain)).map((s) => s.summary),
    ...notes.filter((s) => !same(s.domain)).map((s) => s.summary),
  ];
}

export function toReviewItem(
  item: ReviewQueueItem,
  checks: readonly ConceptCheck[],
  pool: readonly string[],
): ReviewItem {
  const check = firstCheck(checks);
  const base = {
    conceptId: item.conceptId,
    title: item.title,
    summary: item.summary,
    domain: item.domain,
    checks: checks.length,
    intervals: item.intervals,
    ease: item.card?.ease ?? null,
    repetitions: item.card?.repetitions ?? 0,
    lapses: item.card?.lapses ?? 0,
    leech: item.card?.leech ?? false,
    lastReviewed: item.card?.lastReviewed ?? null,
    due: item.card?.due ?? null,
  };

  if (check === null) {
    return {
      ...base,
      kind: "recall",
      prompt: `Recall: ${item.title}`,
      answer: item.summary,
      why: null,
      source: null,
      choices: null,
      correct: null,
    };
  }

  const answer = check.answer.trim() !== "" ? check.answer : item.summary;
  const mc = check.answer.trim() !== "" ? buildChoices(item.conceptId, check.answer, pool) : null;
  return {
    ...base,
    kind: mc === null ? "recall" : "check",
    prompt: check.question,
    answer,
    why: check.why.trim() === "" ? null : check.why,
    source: check.source.trim() === "" ? null : check.source,
    choices: mc?.choices ?? null,
    correct: mc?.correct ?? null,
  };
}

/** The session, without the request marker. For route handlers and tests. */
export async function readReviewSession(
  focus: string | null = null,
  now: Date = new Date(),
): Promise<ReviewSessionData> {
  let queue: Awaited<ReturnType<typeof reviewQueue>>;
  let summaries: ConceptSummary[];
  const owner = await currentOwner();
  try {
    const db = await catalogDatabase();
    [queue, summaries] = await Promise.all([
      reviewQueue(db, { now, focus, learnerId: owner }),
      conceptSummaries(db, ownerScope(owner)),
    ]);
  } catch (error) {
    console.warn(`review queue unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return { reachable: false, items: [], nextDue: null };
  }

  // A note that cannot be read costs its checks, not the card: it is asked as
  // recall from the summary the catalog already has.
  const notes = await Promise.all(queue.items.map((item) => readConceptNote(item.conceptId)));
  const checks = notes.map((note) => (note.ok ? note.checks : []));
  const answers = queue.items.map((item, i) => ({
    conceptId: item.conceptId,
    domain: item.domain,
    answer: firstCheck(checks[i] ?? [])?.answer.trim() ?? "",
  }));

  return {
    reachable: true,
    items: queue.items.map((item, i) =>
      toReviewItem(item, checks[i] ?? [], distractorPool(item, answers, summaries)),
    ),
    nextDue: queue.nextDue,
  };
}

/** The session for a render: marks the request dynamic, then reads. */
export async function loadReviewSession(focus: string | null): Promise<ReviewSessionData> {
  await connection();
  return readReviewSession(focus);
}
