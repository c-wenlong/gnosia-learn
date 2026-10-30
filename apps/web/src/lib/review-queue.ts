import "server-only";

import { connection } from "next/server";
import {
  conceptSummaries,
  reviewQueue,
  type ConceptSummary,
  type ReviewQueueItem,
} from "@gnosia/catalog/state";

import type { ConceptCheck } from "@gnosia/tutor/concept-note-core";
import { readConceptNote } from "@/lib/concept-note";
import { readWrittenOptions } from "@gnosia/tutor/server/check-options";
import { canWriteOptionsFor } from "@gnosia/tutor/check-options";
import { tutorModelConfigured } from "@/lib/session-page";
import { catalogDatabase } from "@/lib/learner-store";
import { currentOwner, ownerScope } from "@/lib/owner";
import { buildChoices, recallPrompt, type ReviewItem, type ReviewSessionData } from "@gnosia/tutor/review-core";

/**
 * The review queue as cards a page can render: the due list from the catalog,
 * each concept's note read for its check blocks, and every card turned into
 * either a multiple-choice check or a recall prompt. A check's wrong options
 * are the ones the tutor wrote for it when a session stored them
 * (docs/LEARN.md, "Wrong options"), else other notes' answers and summaries.
 * The review reads that store and never calls a model while it renders: a
 * card with the notes' options carries `rewrite` when a tutor model can be
 * asked, and the page asks for the tutor's options from the browser.
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
 * Not the session's `distractorPool` (`@gnosia/tutor/session-core`), which
 * ranks summaries by how near each concept sits to the one being asked about.
 */
function reviewDistractorPool(
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
  /** The tutor's wrong options per check id, stored and still matching their checks. */
  written: Readonly<Record<string, readonly string[]>> = {},
  /** A tutor model can be asked, so a check with no options written carries `rewrite`. */
  canWrite = false,
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
      prompt: recallPrompt(item.title),
      answer: item.summary,
      why: null,
      source: null,
      choices: null,
      correct: null,
    };
  }

  const answer = check.answer.trim() !== "" ? check.answer : item.summary;
  const tutored = written[check.id];
  const fromTutor = check.answer.trim() !== "" && tutored !== undefined ? buildChoices(item.conceptId, check.answer, tutored) : null;
  const mc = fromTutor ?? (check.answer.trim() !== "" ? buildChoices(item.conceptId, check.answer, pool) : null);
  return {
    ...base,
    kind: mc === null ? "recall" : "check",
    prompt: check.question,
    answer,
    why: check.why.trim() === "" ? null : check.why,
    source: check.source.trim() === "" ? null : check.source,
    choices: mc?.choices ?? null,
    correct: mc?.correct ?? null,
    ...(mc === null ? {} : { wrong: fromTutor !== null ? ("tutor" as const) : ("notes" as const) }),
    ...(mc !== null && fromTutor === null && canWrite && canWriteOptionsFor(check.answer) ? { rewrite: { check: check.id } } : {}),
  };
}

/** A card without its `rewrite`, for a session with no tutor model to ask. */
function withoutRewrite(item: ReviewItem): ReviewItem {
  if (item.rewrite === undefined) return item;
  const rest = { ...item };
  delete rest.rewrite;
  return rest;
}

/**
 * The most cards one session asks. A long backlog renders, and reads a note
 * for, only this many; the close screen says more are due.
 */
export const REVIEW_SESSION_LIMIT = 50;

/** The session, without the request marker. For route handlers and tests. */
export async function readReviewSession(
  focus: string | null = null,
  now: Date = new Date(),
  only: readonly string[] | null = null,
  limit: number = REVIEW_SESSION_LIMIT,
): Promise<ReviewSessionData> {
  let queue: Awaited<ReturnType<typeof reviewQueue>>;
  let summaries: ConceptSummary[];
  const owner = await currentOwner();
  try {
    const db = await catalogDatabase();
    [queue, summaries] = await Promise.all([
      // `only` asks due cards and nothing else, so a focus beside it, which
      // can bring in a card that is not due, is not applied.
      // One past the limit, so a cut queue is told from one that fits exactly.
      // `only` names at most `MAX_ONLY` cards and is read whole.
      reviewQueue(db, { now, focus: only === null ? focus : null, learnerId: owner, ...(only === null ? { limit: limit + 1 } : {}) }),
      conceptSummaries(db, ownerScope(owner)),
    ]);
  } catch (error) {
    console.warn(`review queue unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return { reachable: false, items: [], nextDue: null };
  }

  // `only` is a chosen set (once Home's recall button): just those due cards, in that order. A
  // name that is not due (graded in another tab since the page drew) is
  // dropped rather than asked early.
  if (only !== null) {
    const due = new Map(queue.items.map((item) => [item.conceptId, item]));
    queue = { ...queue, items: only.map((id) => due.get(id)).filter((item) => item !== undefined) };
  }

  const more = queue.items.length > limit;
  if (more) queue = { ...queue, items: queue.items.slice(0, limit) };

  // A note that cannot be read costs its checks, not the card: it is asked as
  // recall from the summary the catalog already has.
  const notes = await Promise.all(queue.items.map((item) => readConceptNote(item.conceptId)));
  const checks = notes.map((note) => (note.ok ? note.checks : []));
  const written = await readWrittenOptions(
    catalogDatabase(),
    owner,
    queue.items.map((item, i) => ({ slug: item.conceptId, checks: checks[i] ?? [] })),
  );
  const answers = queue.items.map((item, i) => ({
    conceptId: item.conceptId,
    domain: item.domain,
    answer: firstCheck(checks[i] ?? [])?.answer.trim() ?? "",
  }));

  const items = queue.items.map((item, i) =>
    toReviewItem(item, checks[i] ?? [], reviewDistractorPool(item, answers, summaries), written.get(item.conceptId), true),
  );
  // Whether a model can be asked is read only when some card would ask one.
  const canWrite = items.some((item) => item.rewrite !== undefined) && (await tutorModelConfigured().catch(() => false));

  return {
    reachable: true,
    items: canWrite ? items : items.map(withoutRewrite),
    nextDue: queue.nextDue,
    ...(more ? { more } : {}),
  };
}

/** The session for a render: marks the request dynamic, then reads. */
export async function loadReviewSession(
  focus: string | null,
  only: readonly string[] | null = null,
): Promise<ReviewSessionData> {
  await connection();
  return readReviewSession(focus, new Date(), only);
}

/** Cards `?only=` may name: Home offers three, and a hand-typed URL is held to a few more. */
export const MAX_ONLY = 10;

/**
 * `?only=a,b,c` read into a list of concept slugs, or null when it is absent.
 * Present but naming nothing usable is an empty list, which asks no card,
 * never the whole queue. Each entry is held to the length `?concept=` is.
 */
export function parseOnly(raw: string | string[] | undefined): string[] | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const ids = [...new Set(value.split(",").map((s) => s.trim()))].filter((s) => s !== "" && s.length <= 128);
  return ids.slice(0, MAX_ONLY);
}
