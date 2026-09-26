import { describe, expect, it } from "vitest";

import type { ConceptCheck } from "@/lib/concept-note-core";
import {
  buildSessionPlan,
  distractorPool,
  nextConcept,
  wrongOptionsFor,
  feedbackNote,
  formatMove,
  formatSigned,
  isSessionToken,
  newSessionId,
  noteQuestion,
  parseMode,
  scheduledCards,
  sessionTotals,
  stepLabel,
  stepsWalked,
  teachProse,
  tutorPrefill,
  whatMoved,
  type RecordedAnswer,
  type SessionQuestion,
} from "@/lib/session-core";

const check = (id: string, question: string, answer: string, why = ""): ConceptCheck => ({
  id,
  question,
  answer,
  why,
  source: "",
});

const POOL = { near: ["A vector is a list of numbers.", "Softmax turns scores into weights."], far: ["Attention mixes values."] };
const ALL = [...POOL.near, ...POOL.far];

describe("noteQuestion", () => {
  it("asks a check with its answer among real wrong options, fixed by the variant", () => {
    const q = noteQuestion("dot-product", check("c1", "Why zero?", "Perpendicular.", "Catches X."), ALL, "probe", "Alignment.");
    expect(q).not.toBeNull();
    expect(q?.choices).toContain("Perpendicular.");
    expect(q?.choices[q.correct]).toBe("Perpendicular.");
    expect(q?.choices.length).toBe(4);
    expect(q).toMatchObject({
      id: "c1",
      prompt: "Why zero?",
      reason: "Catches X.",
      explanation: "From your note: Alignment.",
      origin: "note",
    });
    expect(noteQuestion("dot-product", check("c1", "Why zero?", "Perpendicular."), ALL, "probe")?.explanation).toBeNull();
    // Deterministic: the server's render and the client's agree.
    expect(noteQuestion("dot-product", check("c1", "Why zero?", "Perpendicular."), ALL, "probe")?.choices).toEqual(
      q?.choices,
    );
  });

  it("is null without an answer, or without two wrong options to offer", () => {
    expect(noteQuestion("x", check("c1", "Q?", ""), ALL, "probe")).toBeNull();
    expect(noteQuestion("x", check("c1", "Q?", "A."), ["Only one."], "probe")).toBeNull();
  });
});

describe("distractorPool", () => {
  it("puts the concept's neighbours first, then its folder, then the rest, and never itself", () => {
    const ref = (slug: string) => ({ slug, title: slug, bucket: "untouched" as const, pL: 0.25 });
    const summary = (conceptId: string, domain: string | null) => ({
      conceptId,
      title: conceptId,
      summary: `About ${conceptId}.`,
      domain,
    });
    const pool = distractorPool(
      { slug: "dot", domain: "foundations", requires: [ref("vector")], assumes: [], dependants: [ref("attention")], backlinks: [] },
      [
        summary("amortised", "algorithms"),
        summary("attention", "transformers"),
        summary("dot", "foundations"),
        summary("norm", "foundations"),
        summary("vector", "foundations"),
        { ...summary("blank", "foundations"), summary: " " },
      ],
    );
    expect(pool).toEqual({ near: ["About attention.", "About vector.", "About norm."], far: ["About amortised."] });
  });

  it("uses every near option, and fills from far only up to three, closest in length first", () => {
    const c = check("c1", "Q?", "Twelve chars");
    expect(wrongOptionsFor(c, ["Other answer."], { near: ["n1", "n2"], far: ["f"] })).toEqual(["Other answer.", "n1", "n2"]);
    expect(
      wrongOptionsFor(c, [], { near: ["near one"], far: ["a much much longer far option", "short", "twelve chars"] }),
    ).toEqual(["near one", "twelve chars", "short"]);
    expect(wrongOptionsFor(c, [], { near: [], far: ["$x$ twelve ch", "plain words here", "tiny"] })).toEqual([
      "plain words here",
      "tiny",
      "$x$ twelve ch",
    ]);
  });
});

describe("nextConcept", () => {
  const frontier = [
    { id: "big-o", title: "Big-O", domain: "algorithms" },
    { id: "dot", title: "Dot", domain: "foundations" },
    { id: "norm", title: "Norm", domain: "foundations" },
    { id: "attention", title: "Attention", domain: "transformers" },
  ];
  it("prefers what this concept leads to, then its folder, then the frontier's order", () => {
    expect(nextConcept(frontier, { slug: "dot", domain: "foundations", dependants: [{ slug: "attention" }] })).toEqual({
      slug: "attention",
      title: "Attention",
    });
    expect(nextConcept(frontier, { slug: "dot", domain: "foundations", dependants: [] })?.slug).toBe("norm");
    expect(nextConcept(frontier, { slug: "x", domain: null, dependants: [] })?.slug).toBe("big-o");
    expect(nextConcept([frontier[1] as (typeof frontier)[number]], { slug: "dot", domain: null, dependants: [] })).toBeNull();
  });
});

describe("buildSessionPlan", () => {
  it("is probe, teach, check, close, with the note's two checks as the two questions", () => {
    const plan = buildSessionPlan({
      slug: "react-loop",
      mode: "learn",
      checks: [check("c1", "First?", "One."), check("c2", "Second?", "Two.")],
      pool: POOL,
    });
    expect(plan.map((s) => s.kind)).toEqual(["probe", "teach", "check", "close"]);
    expect(plan[0]?.question?.prompt).toBe("First?");
    expect(plan[2]?.question?.prompt).toBe("Second?");
    // Wrong options are real statements: the other check's answer or a summary.
    for (const choice of plan[0]?.question?.choices ?? []) {
      expect(["One.", "Two.", ...ALL]).toContain(choice);
    }
    expect(plan[2]?.fallback).toBeNull();
  });

  it("with one check, leaves the second question to the tutor and falls back to the first, reshuffled", () => {
    const plan = buildSessionPlan({ slug: "dot-product", mode: "learn", checks: [check("c1", "Why?", "Because.")], pool: POOL });
    expect(plan[0]?.question?.prompt).toBe("Why?");
    expect(plan[2]?.question).toBeNull();
    expect(plan[2]?.fallback?.prompt).toBe("Why?");
  });

  it("with no checks, leaves both questions to the tutor with nothing to fall back to", () => {
    const plan = buildSessionPlan({ slug: "softmax", mode: "learn", checks: [], pool: POOL });
    expect(plan.map((s) => [s.kind, s.question, s.fallback])).toEqual([
      ["probe", null, null],
      ["teach", null, null],
      ["check", null, null],
      ["close", null, null],
    ]);
  });

  it("Quiz me asks every check, then closes; with none, one tutor question", () => {
    const three = buildSessionPlan({
      slug: "x",
      mode: "check",
      checks: [check("c1", "A?", "a."), check("c2", "B?", "b."), check("c3", "C?", "c.")],
      pool: POOL,
    });
    expect(three.map((s) => s.kind)).toEqual(["check", "check", "check", "close"]);
    expect(buildSessionPlan({ slug: "x", mode: "check", checks: [], pool: POOL }).map((s) => s.kind)).toEqual([
      "check",
      "close",
    ]);
  });

  it("reads ?mode= as check only when it says so", () => {
    expect(parseMode("check")).toBe("check");
    expect(parseMode("learn")).toBe("learn");
    expect(parseMode(undefined)).toBe("learn");
    expect(parseMode(["check"])).toBe("learn");
  });
});

describe("labels", () => {
  const plan = buildSessionPlan({ slug: "x", mode: "learn", checks: [], pool: { near: [], far: [] } });
  it("numbers the steps and names the concept on a desktop", () => {
    expect(stepLabel(plan, 1, "Dot product")).toBe("Step 2 of 4 · Teach · Dot product");
    expect(stepLabel(plan, 1, "Dot product", true)).toBe("Step 2 of 4 · Teach");
    expect(stepLabel(plan, 3, "Dot product")).toBe("Step 4 of 4 · Close");
    expect(stepsWalked(plan)).toBe("Probe, Teach, Check");
  });
});

describe("teachProse", () => {
  const note = [
    "---",
    "id: dot-product",
    "title: Dot product",
    "---",
    "",
    "# Dot product",
    "",
    "The dot product measures alignment.",
    "",
    "## Why it matters",
    "",
    "## The idea",
    "",
    "Multiply and add.",
    "",
    "```python",
    "# not a heading",
    "sum(a * b)",
    "```",
    "",
    "```check",
    "q: Why?",
    "a: The secret answer.",
    "```",
    "",
    "## Prerequisites",
    "",
    "- [[vector]]",
    "",
    "## Checks",
    "",
    "```check",
    "q: Another?",
    "a: Another secret.",
    "```",
    "",
    "## Sessions",
    "",
    "- [[2026-08-20-x]]",
  ].join("\n");

  it("keeps the teaching and drops the title, the answers, the empty headings and the bookkeeping", () => {
    const prose = teachProse(note);
    expect(prose).toContain("The dot product measures alignment.");
    expect(prose).toContain("## The idea");
    expect(prose).toContain("# not a heading");
    expect(prose).not.toContain("# Dot product");
    expect(prose).not.toContain("Why it matters");
    expect(prose).not.toContain("secret");
    expect(prose).not.toContain("Prerequisites");
    expect(prose).not.toContain("[[vector]]");
    expect(prose).not.toContain("Sessions");
    expect(prose).not.toContain("id: dot-product");
  });

  it("drops a hidden section's subsections with it, and keeps a note with no frontmatter", () => {
    expect(teachProse("Intro.\n\n## Checks\n\n### One\n\nhidden\n\n## After\n\nshown")).toBe("Intro.\n\n## After\n\nshown");
  });
});

const answer = (overrides: Partial<RecordedAnswer> = {}): RecordedAnswer => ({
  concept: "dot-product",
  correct: true,
  pLBefore: 0.42,
  pLAfter: 0.55,
  propagated: [],
  card: { due: "2026-09-27T08:00:00.000Z", intervalDays: 1, created: true },
  replayed: false,
  ...overrides,
});

describe("the feedback and close arithmetic", () => {
  const NOW = new Date(2026, 8, 26, 12);

  it("signs a movement and prints zero plainly", () => {
    expect(formatSigned(0.13)).toBe("+0.13");
    expect(formatSigned(-0.064)).toBe("-0.06");
    expect(formatSigned(0.001)).toBe("0.00");
    // Printed beside 0.36 and 0.36, the movement is none, not -0.01.
    expect(formatMove(0.3614, 0.3555)).toBe("0.00");
    expect(formatMove(0.42, 0.55)).toBe("+0.13");
  });

  it("says a new card is new, and an existing one when it is next due", () => {
    expect(feedbackNote(answer(), NOW)).toBe("p(L) 0.42 to 0.55 · this becomes a review card");
    const due = new Date(2026, 8, 29, 9).toISOString();
    expect(feedbackNote(answer({ card: { due, intervalDays: 3, created: false } }), NOW)).toBe(
      "p(L) 0.42 to 0.55 · next review in 3 days",
    );
    expect(feedbackNote(answer({ card: null }), NOW)).toBe("p(L) 0.42 to 0.55");
  });

  it("totals the answers, moves the concept from its first prior to its last posterior", () => {
    const answers = [
      answer({ correct: false, pLBefore: 0.42, pLAfter: 0.3 }),
      answer({
        pLBefore: 0.3,
        pLAfter: 0.55,
        propagated: [{ concept: "vector", title: "Vector", hops: 1, pLBefore: 0.31, pLAfter: 0.35 }],
        card: { due: "2026-09-28T08:00:00.000Z", intervalDays: 1, created: false },
      }),
    ];
    const totals = sessionTotals("dot-product", answers);
    expect(totals.answered).toBe(2);
    expect(totals.right).toBe(1);
    expect([totals.before, totals.after]).toEqual([0.42, 0.55]);
    expect(totals.cards).toBe(1);

    expect(whatMoved("dot-product", "Dot product", answers)).toEqual([
      { slug: "dot-product", title: "Dot product", before: 0.42, after: 0.55, prerequisite: false },
      { slug: "vector", title: "Vector", before: 0.31, after: 0.35, prerequisite: true },
    ]);
    // The last answer's card, remembered as new since the first one made it.
    expect(scheduledCards("dot-product", "Dot product", answers)).toEqual([
      { slug: "dot-product", title: "Dot product", due: "2026-09-28T08:00:00.000Z", created: true },
    ]);
  });

  it("has no movement with no answers, and leaves out a replay's unknown propagation", () => {
    expect(sessionTotals("x", [])).toEqual({ answered: 0, right: 0, before: null, after: null, cards: 0 });
    const replayed = answer({ replayed: true, propagated: [{ concept: "vector", title: "Vector", hops: 1 }] });
    expect(whatMoved("dot-product", "Dot product", [replayed]).map((r) => r.slug)).toEqual(["dot-product"]);
  });
});

describe("ids and the tutor prefill", () => {
  it("makes session ids the observe route accepts", () => {
    const id = newSessionId("dot-product", new Date("2026-09-26T10:00:00Z"), "ab-12/cd");
    expect(id).toBe("web-2026-09-26-dot-product-ab12cd");
    expect(isSessionToken(id)).toBe(true);
    expect(isSessionToken(newSessionId("a".repeat(100), new Date(), "x".repeat(40)))).toBe(true);
    expect(isSessionToken("has space")).toBe(false);
    expect(isSessionToken("")).toBe(false);
  });

  it("prefills the question, the pick and the answer", () => {
    const q: SessionQuestion = {
      id: "c1",
      prompt: "Why zero?",
      choices: ["Perpendicular.", "Parallel."],
      correct: 0,
      reason: null,
      explanation: null,
      source: null,
      origin: "note",
    };
    expect(tutorPrefill(q, 1)).toBe("I was asked: Why zero? I answered: Parallel. The answer was: Perpendicular. Why?");
    expect(tutorPrefill(q, null)).toContain("I didn't know.");
    expect(tutorPrefill(q, 0)).toContain("Why is that right");
  });
});
