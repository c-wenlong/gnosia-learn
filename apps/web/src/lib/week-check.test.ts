import { describe, expect, it } from "vitest";

import type { ConceptCheck } from "@/lib/concept-note-core";
import type { RecordedAnswer, SessionQuestion } from "@/lib/session-core";
import {
  checksByLastAsked,
  nextWeekCheckQuestion,
  outcomeOf,
  WEEK_CHECK_LIMIT,
  weekCheckBound,
  weekCheckLabel,
  weekCheckOrder,
  weekCheckPercent,
  weekCheckSteps,
  type WeekCheckConcept,
  type WeekCheckOutcome,
  type WeekCheckPlan,
} from "@/lib/week-check";

/**
 * The week check's plan (phase 4 of docs/proposals/module-learning-path.md,
 * "The week check"): each concept in path order, asked until it is mastered,
 * answered wrong once, or asked three times; the note's checks least recently
 * asked first, then the tutor; 24 questions in all, weakest first when the
 * module needs more than that.
 */

function question(prompt: string): SessionQuestion {
  return { id: prompt, prompt, choices: ["a", "b", "c"], correct: 0, reason: null, explanation: null, source: null, origin: "note" };
}

function concept(slug: string, notes = 3, pL = 0.25): WeekCheckConcept {
  return {
    slug,
    title: `Title of ${slug}`,
    pL,
    questions: Array.from({ length: notes }, (_, i) => question(`${slug} q${i + 1}`)),
  };
}

function plan(concepts: WeekCheckConcept[], modelAvailable = true): WeekCheckPlan {
  return { concepts, modelAvailable };
}

const right = (c: string, mastered = false): WeekCheckOutcome => ({ concept: c, result: "right", mastered });
const wrong = (c: string): WeekCheckOutcome => ({ concept: c, result: "wrong", mastered: false });

/** Where the next question is: the concept, which question of it, and the note's question or null for the tutor. */
function where(p: WeekCheckPlan, outcomes: WeekCheckOutcome[]) {
  const next = nextWeekCheckQuestion(p, outcomes);
  return next === null ? null : [next.concept.slug, next.question, next.note?.prompt ?? null];
}

describe("nextWeekCheckQuestion", () => {
  const two = plan([concept("big-o"), concept("theta")]);

  it("starts on the first concept with its first question", () => {
    expect(where(two, [])).toEqual(["big-o", 1, "big-o q1"]);
  });

  it("asks a concept again after a correct answer until it is mastered", () => {
    expect(where(two, [right("big-o")])).toEqual(["big-o", 2, "big-o q2"]);
    expect(where(two, [right("big-o"), right("big-o", true)])).toEqual(["theta", 1, "theta q1"]);
  });

  it("stops a concept on one wrong answer", () => {
    expect(where(two, [wrong("big-o")])).toEqual(["theta", 1, "theta q1"]);
    expect(where(two, [right("big-o"), wrong("big-o")])).toEqual(["theta", 1, "theta q1"]);
  });

  it("stops a concept at three questions, mastered or not", () => {
    expect(where(two, [right("big-o"), right("big-o"), right("big-o")])).toEqual(["theta", 1, "theta q1"]);
  });

  it("asks a concept already mastered once, and moves on when it holds", () => {
    const held = plan([concept("big-o", 3, 0.97), concept("theta")]);
    expect(where(held, [])).toEqual(["big-o", 1, "big-o q1"]);
    expect(where(held, [right("big-o", true)])).toEqual(["theta", 1, "theta q1"]);
  });

  it("ends after the last concept", () => {
    expect(where(two, [wrong("big-o"), wrong("theta")])).toBeNull();
  });

  it("falls back to the tutor when the note runs out", () => {
    const thin = plan([concept("big-o", 1), concept("theta")]);
    expect(where(thin, [right("big-o")])).toEqual(["big-o", 2, null]);
    expect(where(thin, [right("big-o"), right("big-o")])).toEqual(["big-o", 3, null]);
    // A note with no check at all is the tutor's from the first question.
    expect(where(plan([concept("big-o", 0)]), [])).toEqual(["big-o", 1, null]);
  });

  it("moves on when the note runs out and no tutor model is configured", () => {
    const thin = plan([concept("big-o", 1), concept("theta", 0), concept("compare")], false);
    expect(where(thin, [right("big-o")])).toEqual(["compare", 1, "compare q1"]);
  });

  it("moves on when a step had no question to ask", () => {
    const none: WeekCheckOutcome = { concept: "big-o", result: "none", mastered: false };
    expect(where(two, [right("big-o"), none])).toEqual(["theta", 1, "theta q1"]);
  });

  it("stops at 24 questions in all", () => {
    const ten = plan(Array.from({ length: 10 }, (_, i) => concept(`c${i}`)));
    const outcomes: WeekCheckOutcome[] = [];
    for (let guard = 0; guard < 100; guard += 1) {
      const next = nextWeekCheckQuestion(ten, outcomes);
      if (next === null) break;
      outcomes.push(right(next.concept.slug));
    }
    expect(outcomes).toHaveLength(WEEK_CHECK_LIMIT);
    expect(new Set(outcomes.map((o) => o.concept)).size).toBe(8);
  });
});

describe("weekCheckOrder", () => {
  const weak = (slug: string, pL: number) => ({ slug, pL });

  it("keeps the path's order when every concept fits three questions", () => {
    const eight = [0.9, 0.1, 0.5, 0.3, 0.2, 0.8, 0.6, 0.4].map((pL, i) => weak(`c${i}`, pL));
    expect(weekCheckOrder(eight).map((c) => c.slug)).toEqual(eight.map((c) => c.slug));
  });

  it("starts from the weakest by mastery when the module needs more than fits, ties in path order", () => {
    const nine = [0.9, 0.1, 0.5, 0.25, 0.25, 0.8, 0.6, 0.4, 0.97].map((pL, i) => weak(`c${i}`, pL));
    expect(weekCheckOrder(nine).map((c) => c.slug)).toEqual(["c1", "c3", "c4", "c7", "c2", "c6", "c5", "c0", "c8"]);
  });
});

describe("weekCheckBound", () => {
  it("is three a concept, never past 24", () => {
    expect(weekCheckBound(0)).toBe(0);
    expect(weekCheckBound(1)).toBe(3);
    expect(weekCheckBound(6)).toBe(18);
    expect(weekCheckBound(8)).toBe(24);
    expect(weekCheckBound(12)).toBe(24);
  });
});

describe("checksByLastAsked", () => {
  const check = (id: string, q: string): ConceptCheck => ({ id, question: q, answer: `${id} answer`, why: "", source: "" });
  const checks = [check("c1", "What is Big O?"), check("c2", "What is Theta?"), check("c3", "What is little o?")];

  it("puts the check asked least recently first: never asked, then the oldest, ties in note order", () => {
    const ordered = checksByLastAsked(checks, [
      { at: "2026-10-01T09:00:00.000Z", question: "What is Big O?" },
      { at: "2026-09-20T09:00:00.000Z", question: "What is little o?" },
      { at: "2026-09-01T09:00:00.000Z", question: "What is Big O?" },
    ]);
    expect(ordered.map((c) => c.id)).toEqual(["c2", "c3", "c1"]);
  });

  it("matches a question however its case and spacing were stored", () => {
    const ordered = checksByLastAsked(checks, [{ at: "2026-10-01T09:00:00.000Z", question: "  what is  BIG o? " }]);
    expect(ordered.map((c) => c.id)).toEqual(["c2", "c3", "c1"]);
  });

  it("leaves the note's order when nothing was asked", () => {
    expect(checksByLastAsked(checks, [{ at: "2026-10-01T09:00:00.000Z", question: null }]).map((c) => c.id)).toEqual([
      "c1",
      "c2",
      "c3",
    ]);
  });
});

describe("weekCheckSteps", () => {
  const two = plan([concept("big-o", 1), concept("theta")]);

  it("is the steps decided so far, then the next question, each a check naming its concept", () => {
    const steps = weekCheckSteps(two, [right("big-o")]);
    expect(steps.map((s) => [s.kind, s.place?.slug, s.place?.question, s.question?.prompt ?? null])).toEqual([
      ["check", "big-o", 1, "big-o q1"],
      ["check", "big-o", 2, null],
    ]);
    expect(steps[1]?.place).toMatchObject({ title: "Title of big-o", position: 1, of: 2 });
    expect(steps[1]?.fallback).toBeNull();
  });

  it("ends with the close once nothing is left to ask", () => {
    const steps = weekCheckSteps(two, [right("big-o"), wrong("big-o"), wrong("theta")]);
    expect(steps.map((s) => s.kind)).toEqual(["check", "check", "check", "close"]);
  });

  it("is the close alone when no concept can be asked", () => {
    expect(weekCheckSteps(plan([concept("big-o", 0)], false), []).map((s) => s.kind)).toEqual(["close"]);
    expect(weekCheckSteps(plan([]), []).map((s) => s.kind)).toEqual(["close"]);
  });
});

describe("weekCheckLabel and weekCheckPercent", () => {
  it("count concepts on a check every concept fits", () => {
    const two = plan([concept("big-o"), concept("theta")]);
    const steps = weekCheckSteps(two, [right("big-o"), wrong("big-o")]);
    expect(weekCheckLabel(steps[2])).toBe("Concept 2 of 2 · Question 1");
    expect(weekCheckPercent(steps[2])).toBe(62.5);
    expect(weekCheckPercent(steps[0])).toBe(12.5);
  });

  it("count questions against the 24 on a check that stops before its last concepts", () => {
    // Twelve concepts, each answered right three times without mastering: the
    // check stops after eight of them, so "of 12" would never be reached.
    const twelve = plan(Array.from({ length: 12 }, (_, i) => concept(`c${i + 1}`)));
    const outcomes = twelve.concepts.slice(0, 8).flatMap((c) => [right(c.slug), right(c.slug), right(c.slug)]);
    const steps = weekCheckSteps(twelve, outcomes.slice(0, 23));
    const last = steps[23];
    expect(last?.place).toMatchObject({ position: 8, of: 12, question: 3, answered: 23 });
    expect(weekCheckLabel(last)).toBe("Question 24 of up to 24");
    expect(weekCheckPercent(last)).toBeCloseTo((23 / 24) * 100);
    expect(weekCheckLabel(steps[0])).toBe("Question 1 of up to 24");
    expect(weekCheckPercent(steps[0])).toBe(0);
    expect(weekCheckSteps(twelve, outcomes).at(-1)?.kind).toBe("close");
  });

  it("does not count a step with no question to ask as answered", () => {
    const twelve = plan(Array.from({ length: 12 }, (_, i) => concept(`c${i + 1}`)));
    const steps = weekCheckSteps(twelve, [{ concept: "c1", result: "none", mastered: false }, right("c2")]);
    expect(weekCheckLabel(steps[2])).toBe("Question 2 of up to 24");
  });

  it("read the close and a step with no place", () => {
    expect(weekCheckPercent({ kind: "close", question: null, fallback: null })).toBe(100);
    expect(weekCheckLabel(undefined)).toBe("Module check");
  });
});

describe("outcomeOf", () => {
  const answer = (correct: boolean, pLAfter: number, mastered?: boolean): RecordedAnswer => ({
    concept: "big-o",
    correct,
    pLBefore: 0.25,
    pLAfter,
    propagated: [],
    card: null,
    replayed: false,
    ...(mastered === undefined ? {} : { mastered }),
  });

  it("reads the verdict and whether the concept is now mastered", () => {
    expect(outcomeOf(answer(true, 0.6, false))).toEqual({ concept: "big-o", result: "right", mastered: false });
    expect(outcomeOf(answer(true, 0.97, true))).toEqual({ concept: "big-o", result: "right", mastered: true });
    expect(outcomeOf(answer(false, 0.05, false))).toEqual({ concept: "big-o", result: "wrong", mastered: false });
    // A reply without the flag is read from p(L), at the pipeline's threshold.
    expect(outcomeOf(answer(true, 0.968))).toMatchObject({ mastered: true });
    expect(outcomeOf(answer(true, 0.94))).toMatchObject({ mastered: false });
  });
});
