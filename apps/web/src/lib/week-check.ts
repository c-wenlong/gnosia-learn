import type { ConceptCheck } from "@/lib/concept-note-core";
import {
  normaliseQuestion,
  type RecordedAnswer,
  type SessionQuestion,
  type SessionStep,
} from "@/lib/session-core";

/**
 * A module's week check (phase 4 of docs/proposals/module-learning-path.md,
 * "The week check"): the module's concepts, each asked until it is mastered,
 * answered wrong once, or asked three times, 24 questions at most.
 *
 * Pure and React-free. The page's loader builds the plan once, on the server
 * (`loadWeekCheck` in `@/lib/week-check-page`); the client session holds
 * it for the whole check and asks `nextWeekCheckQuestion` what comes next
 * after each answer, since which question follows depends on the answer just
 * given. Each answer is an ordinary probe through `/api/learner/observe` with
 * the module named, and the check keeps no score of its own: mastery moves
 * per concept (decision 3 of the proposal).
 */

/** The most questions one week check asks. */
export const WEEK_CHECK_LIMIT = 24;

/**
 * The most questions about one concept. Three correct probes take a new
 * concept from the 0.25 prior to 0.97 with the default parameters
 * (`scripts/learn/lib/bkt.mjs`), so three is the number that can finish one.
 */
export const WEEK_CHECK_PER_CONCEPT = 3;

/** p(L) at which a concept counts as mastered: `MASTERY_THRESHOLD` in `bkt.mjs`, which the web app does not import. */
export const MASTERED_AT = 0.95;

/** "Up to N questions": three a concept, never past the limit. */
export function weekCheckBound(concepts: number): number {
  return Math.min(WEEK_CHECK_LIMIT, WEEK_CHECK_PER_CONCEPT * Math.max(0, concepts));
}

/** One concept as the check asks it. */
export interface WeekCheckConcept {
  slug: string;
  title: string;
  /** p(L) when the check began. */
  pL: number;
  /** The note's checks as questions, the one asked least recently first. */
  questions: SessionQuestion[];
}

export interface WeekCheckPlan {
  /** In the order the check asks them (`weekCheckOrder`). */
  concepts: WeekCheckConcept[];
  /** A tutor model can be asked, so a concept whose note runs out still gets its questions. */
  modelAvailable: boolean;
}

/**
 * What one step came to: answered right or wrong (with whether the concept is
 * now mastered), or `none` when there was no question to ask it (the tutor
 * did not write one).
 */
export interface WeekCheckOutcome {
  concept: string;
  result: "right" | "wrong" | "none";
  mastered: boolean;
}

export interface WeekCheckQuestion {
  concept: WeekCheckConcept;
  /** 1-based, in the check's order. */
  position: number;
  /** 1-based: the how-manyth question about this concept. */
  question: number;
  /** The note's question, or null when the tutor writes this one. */
  note: SessionQuestion | null;
}

/**
 * The order the check asks the concepts in: the path's, when every concept
 * fits its three questions in the 24; otherwise the weakest by p(L) first,
 * so the questions there are go where they tell the learner most. Ties keep
 * the path's order.
 */
export function weekCheckOrder<T extends { pL: number }>(concepts: readonly T[]): T[] {
  if (concepts.length * WEEK_CHECK_PER_CONCEPT <= WEEK_CHECK_LIMIT) return [...concepts];
  return concepts
    .map((concept, i) => ({ concept, i }))
    .sort((a, b) => a.concept.pL - b.concept.pL || a.i - b.i)
    .map(({ concept }) => concept);
}

/**
 * A note's checks, the one this learner was asked least recently first:
 * never asked, then the oldest last asking. A check's last asking is the
 * latest observation whose question reads the same (`normaliseQuestion`, the
 * rule the workspace's check list uses). Ties keep the note's order.
 */
export function checksByLastAsked(
  checks: readonly ConceptCheck[],
  history: readonly { at: string; question: string | null }[],
): ConceptCheck[] {
  const last = new Map<string, string>();
  for (const o of history) {
    if (o.question === null) continue;
    const key = normaliseQuestion(o.question);
    const seen = last.get(key);
    if (seen === undefined || o.at > seen) last.set(key, o.at);
  }
  return checks
    .map((check, i) => ({ check, i, at: last.get(normaliseQuestion(check.question)) ?? "" }))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.i - b.i))
    .map(({ check }) => check);
}

/** The questions answered: a step with no question to ask is not one. */
function answeredIn(outcomes: readonly WeekCheckOutcome[]): number {
  return outcomes.filter((o) => o.result !== "none").length;
}

/**
 * A check with more concepts than its 24 questions can cover: it ends at the
 * limit, usually before it reaches the last concepts, so its progress is
 * counted in questions, not in concepts.
 */
function capped(place: { of: number }): boolean {
  return place.of * WEEK_CHECK_PER_CONCEPT > WEEK_CHECK_LIMIT;
}

/**
 * The question after `outcomes`, or null when the check is over.
 *
 * Every concept is asked at least once, a mastered one included: the check
 * looks for what slipped. A concept stops on a wrong answer, a step with no
 * question, a correct answer that leaves it mastered, or its third question.
 * Its questions are its note's, then the tutor's; with no tutor model a
 * concept whose note has run out stops there. The check stops at 24 answers.
 */
export function nextWeekCheckQuestion(
  plan: WeekCheckPlan,
  outcomes: readonly WeekCheckOutcome[],
): WeekCheckQuestion | null {
  if (answeredIn(outcomes) >= WEEK_CHECK_LIMIT) return null;
  for (const [i, concept] of plan.concepts.entries()) {
    const own = outcomes.filter((o) => o.concept === concept.slug);
    const last = own[own.length - 1];
    const finished =
      own.length >= WEEK_CHECK_PER_CONCEPT ||
      (last !== undefined && (last.result !== "right" || last.mastered));
    if (finished) continue;
    const note = concept.questions[own.length] ?? null;
    if (note === null && !plan.modelAvailable) continue;
    return { concept, position: i + 1, question: own.length + 1, note };
  }
  return null;
}

/**
 * The steps the session walks: one per outcome so far, as each was decided,
 * then the next question, or the close when there is none. A step is decided
 * by the outcomes before it alone, so the list only ever grows at its end.
 * A step the tutor is to fill has no question and no fallback.
 */
export function weekCheckSteps(plan: WeekCheckPlan, outcomes: readonly WeekCheckOutcome[]): SessionStep[] {
  const steps: SessionStep[] = [];
  for (let i = 0; i <= outcomes.length; i += 1) {
    const next = nextWeekCheckQuestion(plan, outcomes.slice(0, i));
    if (next === null) {
      steps.push({ kind: "close", question: null, fallback: null });
      break;
    }
    steps.push({
      kind: "check",
      question: next.note,
      fallback: null,
      place: {
        slug: next.concept.slug,
        title: next.concept.title,
        position: next.position,
        of: plan.concepts.length,
        question: next.question,
        answered: answeredIn(outcomes.slice(0, i)),
      },
    });
  }
  return steps;
}

/** One recorded answer as the plan reads it. */
export function outcomeOf(answer: RecordedAnswer): WeekCheckOutcome {
  return {
    concept: answer.concept,
    result: answer.correct ? "right" : "wrong",
    mastered: answer.mastered ?? answer.pLAfter >= MASTERED_AT,
  };
}

/**
 * The progress bar's share, 0 to 100: the concepts behind this step, and this
 * step's place in its concept. A check its 24 questions cannot cover counts
 * the questions answered against the 24 instead, since it stops at the limit
 * with concepts still unasked.
 */
export function weekCheckPercent(step: SessionStep | undefined): number {
  if (step === undefined || step.kind === "close") return 100;
  const place = step.place;
  if (place === undefined || place.of === 0) return 0;
  if (capped(place)) return ((place.answered ?? 0) / WEEK_CHECK_LIMIT) * 100;
  return ((place.position - 1 + place.question / (WEEK_CHECK_PER_CONCEPT + 1)) / place.of) * 100;
}

/**
 * "Concept 2 of 6 · Question 1", the frame's label on a week check step, or
 * "Question 9 of up to 24" on a check that stops at the limit before its last
 * concepts, where "of 12" would promise concepts it never reaches.
 */
export function weekCheckLabel(step: SessionStep | undefined): string {
  const place = step?.place;
  if (place === undefined) return "Module check";
  if (capped(place)) return `Question ${(place.answered ?? 0) + 1} of up to ${WEEK_CHECK_LIMIT}`;
  return `Concept ${place.position} of ${place.of} · Question ${place.question}`;
}
