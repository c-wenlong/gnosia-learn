import { describe, expect, it } from "vitest";

import type { ConceptCheck } from "../src/concept-note-core";
import {
  asksNothing,
  canAskAgain,
  buildSessionPlan,
  checkQuestion,
  isEmptyStep,
  sessionCanAsk,
  withoutEmptySteps,
  withConsequence,
  NOTHING_TO_ASK,
  distractorPool,
  nextConcept,
  wrongOptionsFor,
  feedbackNote,
  formatMove,
  formatSigned,
  formatTotalsMove,
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
  withWrittenOptions,
  WRONG_SOURCE_NOTE,
  type RecordedAnswer,
  type SessionQuestion,
} from "../src/session-core";

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

/**
 * Wrong options (docs/LEARN.md, "Wrong options"): the tutor's for the check
 * when they are stored, else the notes', marked, and with a model to ask, a
 * request for the tutor's first. The dot-product check is the one a real
 * catalog asked with "Self-attention is permutation-equivariant..." among its
 * options: two near options, so the third came from another course.
 */
describe("checkQuestion", () => {
  const dot = check("c1", "What does the dot product of two unit vectors measure?", "The cosine of the angle between them.");
  const near = ["A vector is a list of numbers.", "The norm is a vector's length."];
  const far = ["Self-attention is permutation-equivariant without positional encodings."];
  const written = [
    "The sine of the angle between them.",
    "The length of their sum.",
    "The area of the parallelogram they span.",
  ];
  const base = { slug: "dot-product", check: dot, variant: "probe", otherAnswers: [], pool: { near, far } };

  it("pads a check with two near options from another course, says so, and asks the tutor first when it can", () => {
    const offline = checkQuestion(base);
    expect(offline?.choices).toContain(far[0]);
    expect(offline?.wrong).toBe("padded");
    expect(offline?.rewrite).toBeUndefined();

    const online = checkQuestion({ ...base, canWrite: true });
    expect(online?.choices).toEqual(offline?.choices);
    expect(online?.rewrite).toEqual({ concept: "dot-product", check: "c1", variant: "probe" });
  });

  it("asks with the tutor's options once they are stored, and nothing from the notes", () => {
    const q = checkQuestion({ ...base, written, canWrite: true });
    expect(q?.wrong).toBe("tutor");
    expect(q?.rewrite).toBeUndefined();
    expect([...(q?.choices ?? [])].sort()).toEqual([...written, dot.answer].sort());
    expect(q?.choices[q.correct]).toBe(dot.answer);
  });

  it("marks a check with three near options as from the notes, with no padding", () => {
    const q = checkQuestion({ ...base, otherAnswers: ["Zero for perpendicular vectors."], pool: { near, far } });
    expect(q?.wrong).toBe("notes");
    expect(q?.choices).not.toContain(far[0]);
  });

  it("lays the tutor's options out the same whether they arrive on the page or from the store", () => {
    const fallback = checkQuestion({ ...base, canWrite: true });
    const arrived = withWrittenOptions(fallback as SessionQuestion, written);
    const stored = checkQuestion({ ...base, written, canWrite: true });
    expect(arrived).toEqual(stored);
    // No rewrite asked, or options that cannot make a question: the page keeps what it has.
    expect(withWrittenOptions(stored as SessionQuestion, written)).toBeNull();
    expect(withWrittenOptions(fallback as SessionQuestion, [dot.answer])).toBeNull();
  });

  it("falls back to the notes when the stored options cannot make a question", () => {
    expect(checkQuestion({ ...base, written: [dot.answer, dot.answer, dot.answer] })?.wrong).toBe("padded");
  });

  it("names both kinds of options made without the tutor", () => {
    expect(WRONG_SOURCE_NOTE.notes).toMatch(/without the tutor/);
    expect(WRONG_SOURCE_NOTE.padded).toMatch(/unrelated notes/);
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

describe("buildSessionPlan with the tutor's options", () => {
  it("asks a check with stored options as written, and asks the tutor for the rest when it can", () => {
    const checks = [check("c1", "First?", "One."), check("c2", "Second?", "Two.")];
    const written = { c1: ["Uno.", "Eins.", "Un."] };
    const plan = buildSessionPlan({ slug: "x", mode: "check", checks, pool: POOL, written, canWrite: true });
    expect(plan[0]?.question).toMatchObject({ id: "c1", wrong: "tutor" });
    expect(plan[0]?.question?.rewrite).toBeUndefined();
    expect(plan[1]?.question).toMatchObject({ id: "c2", rewrite: { concept: "x", check: "c2", variant: "check" } });

    const offline = buildSessionPlan({ slug: "x", mode: "check", checks, pool: POOL, written });
    expect(offline[1]?.question?.rewrite).toBeUndefined();
    expect(offline[1]?.question?.wrong).toBe("notes");
  });

  it("lets a check the notes cannot fill be asked once the tutor's options are stored", () => {
    const lonely = [check("c1", "Only?", "Alone.")];
    const empty = { near: [], far: [] };
    expect(sessionCanAsk({ slug: "x", checks: lonely, pool: empty }, false)).toBe(false);
    expect(sessionCanAsk({ slug: "x", checks: lonely, pool: empty, written: { c1: ["A.", "B.", "C."] } }, false)).toBe(true);
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

  it("with no check and no model, drops the question steps: Teach me teaches and closes, Quiz me closes", () => {
    const learn = buildSessionPlan({ slug: "softmax", mode: "learn", checks: [], pool: POOL });
    const walked = withoutEmptySteps(learn, false);
    expect(walked.map((s) => s.kind)).toEqual(["teach", "close"]);
    expect(asksNothing(walked)).toBe(true);

    const quiz = withoutEmptySteps(buildSessionPlan({ slug: "softmax", mode: "check", checks: [], pool: POOL }), false);
    expect(quiz.map((s) => s.kind)).toEqual(["close"]);
    expect(asksNothing(quiz)).toBe(true);
  });

  it("keeps every step when a model is configured, since the tutor is asked", () => {
    const learn = buildSessionPlan({ slug: "softmax", mode: "learn", checks: [], pool: POOL });
    expect(withoutEmptySteps(learn, true)).toEqual(learn);
    expect(asksNothing(withoutEmptySteps(learn, true))).toBe(false);
    expect(learn.some((s) => isEmptyStep(s, true))).toBe(false);
  });

  it("keeps every step when the note has a check, with or without a model", () => {
    const one = buildSessionPlan({ slug: "dot-product", mode: "learn", checks: [check("c1", "Why?", "Because.")], pool: POOL });
    // The check after teaching has no question of its own, but falls back to the first.
    expect(withoutEmptySteps(one, false)).toEqual(one);
    expect(asksNothing(withoutEmptySteps(one, false))).toBe(false);
    const quiz = buildSessionPlan({ slug: "x", mode: "check", checks: [check("c1", "A?", "a.")], pool: POOL });
    expect(withoutEmptySteps(quiz, false)).toEqual(quiz);
  });

  it("drops a check nothing can offer wrong options for, when no model can stand in", () => {
    const starved = buildSessionPlan({
      slug: "x",
      mode: "learn",
      checks: [check("c1", "A?", "a.")],
      pool: { near: [], far: [] },
    });
    expect(withoutEmptySteps(starved, false).map((s) => s.kind)).toEqual(["teach", "close"]);
  });

  it("tells the workspace before a session whether it can ask anything, as the session would", () => {
    const input = (checks: ConceptCheck[], pool = POOL) => ({ slug: "x", checks, pool });
    expect(sessionCanAsk(input([]), false)).toBe(false);
    expect(sessionCanAsk(input([]), true)).toBe(true);
    expect(sessionCanAsk(input([check("c1", "A?", "a.")]), false)).toBe(true);
    // A check block with no answer cannot be graded, so it is no question.
    expect(sessionCanAsk(input([check("c1", "A?", "  ")]), false)).toBe(false);
    expect(sessionCanAsk(input([check("c1", "A?", "  ")]), true)).toBe(true);
    // A check with no two wrong options to offer is dropped by the session, so the workspace warns too.
    expect(sessionCanAsk(input([check("c1", "A?", "a.")], { near: [], far: [] }), false)).toBe(false);
    expect(sessionCanAsk(input([check("c1", "A?", "a.")], { near: [], far: [] }), true)).toBe(true);
    // Two checks lend each other one wrong option each; one summary makes the second.
    expect(sessionCanAsk(input([check("c1", "A?", "a."), check("c2", "B?", "b.")], { near: ["S."], far: [] }), false)).toBe(
      true,
    );
  });

  it("reads ?mode= as check only when it says so", () => {
    expect(parseMode("check")).toBe("check");
    expect(parseMode("learn")).toBe("learn");
    expect(parseMode(undefined)).toBe("learn");
    expect(parseMode(["check"])).toBe("learn");
  });
});

describe("withConsequence", () => {
  const then = "Nothing is recorded; carry on.";

  it("adds the full stop an error string leaves off", () => {
    expect(withConsequence("All free providers failed", then)).toBe(
      "All free providers failed. Nothing is recorded; carry on.",
    );
  });

  it.each([
    ["The tutor could not be reached."],
    ["Is the tutor configured?"],
    ["The tutor is resting!"],
    ["The tutor is thinking…"],
    ["The tutor did not answer (HTTP 502)."],
    ["The tutor did not answer (HTTP 502.)"],
  ])("leaves a reason that already ends a sentence alone: %s", (reason) => {
    expect(withConsequence(reason, then)).toBe(`${reason} ${then}`);
  });

  it("collapses a doubled full stop, and leaves a three-dot ellipsis", () => {
    expect(withConsequence("The tutor failed..", then)).toBe(`The tutor failed. ${then}`);
    expect(withConsequence("The tutor failed...", then)).toBe(`The tutor failed... ${then}`);
  });

  it("lets the consequence stand alone when there is no reason", () => {
    expect(withConsequence("", then)).toBe(then);
    expect(withConsequence("   ", then)).toBe(then);
  });

  it("ignores trailing whitespace on the reason", () => {
    expect(withConsequence("All free providers failed  \n", then)).toBe(
      "All free providers failed. Nothing is recorded; carry on.",
    );
    expect(withConsequence("The tutor could not be reached. ", then)).toBe(
      "The tutor could not be reached. Nothing is recorded; carry on.",
    );
  });

  it("still ends the reason when there is no consequence", () => {
    expect(withConsequence("Concept not found", "")).toBe("Concept not found.");
  });

  it("prints the fixed reason unchanged", () => {
    expect(withConsequence(NOTHING_TO_ASK, then)).toBe(`${NOTHING_TO_ASK} ${then}`);
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

  it("signs a movement, zero included, so it never reads as a p(L)", () => {
    expect(formatSigned(0.13)).toBe("+0.13");
    expect(formatSigned(-0.064)).toBe("-0.06");
    expect(formatSigned(0.001)).toBe("+0.00");
    // Rounds to zero from below: no "-0.00".
    expect(formatSigned(-0.001)).toBe("+0.00");
    expect(formatSigned(0)).toBe("+0.00");
    // Printed beside 0.36 and 0.36, the movement is none, not -0.01.
    expect(formatMove(0.3614, 0.3555)).toBe("+0.00");
    expect(formatMove(0.42, 0.55)).toBe("+0.13");
    expect(formatMove(0.3, 0.18)).toBe("-0.12");
  });

  it("prints the close screen's move, or a dash when nothing was answered", () => {
    expect(formatTotalsMove({ before: 0.42, after: 0.5 })).toBe("+0.08");
    expect(formatTotalsMove({ before: 0.15, after: 0.15 })).toBe("+0.00");
    expect(formatTotalsMove(sessionTotals("dot-product", []))).toBe("–");
    // An answer about another concept moves nothing this tile reports.
    expect(formatTotalsMove(sessionTotals("dot-product", [answer({ concept: "vector" })]))).toBe("–");
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

  it("totals a week check over its concepts: the mean of each one's first prior and last posterior", () => {
    const answers = [
      answer({ concept: "big-o", pLBefore: 0.25, pLAfter: 0.6 }),
      answer({ concept: "big-o", pLBefore: 0.6, pLAfter: 0.87 }),
      answer({ concept: "theta", correct: false, pLBefore: 0.45, pLAfter: 0.1 }),
    ];
    const totals = sessionTotals(["big-o", "theta", "never-asked"], answers);
    expect(totals.answered).toBe(3);
    expect(totals.before).toBeCloseTo((0.25 + 0.45) / 2, 12);
    expect(totals.after).toBeCloseTo((0.87 + 0.1) / 2, 12);
    expect(formatTotalsMove(totals)).toBe("+0.13");
  });

  it("titles each concept a week check asked, and counts one first reached as a prerequisite as asked", () => {
    const answers = [
      answer({
        concept: "theta",
        pLBefore: 0.25,
        pLAfter: 0.6,
        propagated: [{ concept: "big-o", title: "Big O", hops: 1, pLBefore: 0.3, pLAfter: 0.4 }],
      }),
      answer({ concept: "big-o", pLBefore: 0.4, pLAfter: 0.75 }),
    ];
    const titles = { theta: "Theta", "big-o": "Big O notation" };
    expect(whatMoved("cs3230-m1", "Week 1", answers, titles)).toEqual([
      { slug: "theta", title: "Theta", before: 0.25, after: 0.6, prerequisite: false },
      { slug: "big-o", title: "Big O notation", before: 0.3, after: 0.75, prerequisite: false },
    ]);
    expect(scheduledCards("cs3230-m1", "Week 1", answers, titles).map((r) => r.title)).toEqual(["Theta", "Big O notation"]);
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
    // The concept tutor's thread says which surface opened it (recall-in-chat R6).
    expect(newSessionId("dot-product", new Date("2026-09-26T10:00:00Z"), "ab12cd", "chat")).toBe(
      "chat-2026-09-26-dot-product-ab12cd",
    );
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

describe("canAskAgain: a step the tutor failed to fill", () => {
  const base = { modelAvailable: true, hasOwnQuestion: false, hasFallback: false, resolved: { question: null } };
  it("offers to ask again when the tutor's request came back with no question", () => {
    expect(canAskAgain(base)).toBe(true);
  });
  it("does not while the request is still out", () => {
    expect(canAskAgain({ ...base, resolved: undefined })).toBe(false);
  });
  it("does not when the tutor answered, or the note or a fallback had a question", () => {
    expect(canAskAgain({ ...base, resolved: { question: {} } })).toBe(false);
    expect(canAskAgain({ ...base, hasOwnQuestion: true })).toBe(false);
    expect(canAskAgain({ ...base, hasFallback: true })).toBe(false);
  });
  it("does not with no tutor model, where asking again would ask nobody", () => {
    expect(canAskAgain({ ...base, modelAvailable: false })).toBe(false);
  });
});
