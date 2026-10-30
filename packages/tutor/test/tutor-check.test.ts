import { describe, expect, it } from "vitest";

import {
  checkSource,
  dueRecall,
  matchCheck,
  newVerdict,
  pendingCheck,
  recallOpening,
  recordedCard,
  recordedLine,
  restoreCheck,
  restoreVerdict,
  topicCheck,
  settleInterrupted,
  splitCheck,
} from "../src/tutor-check";

describe("splitCheck", () => {
  it("takes a marker off the last line", () => {
    expect(splitCheck("Close.\n\nWhy is it zero?\nCHECK: Why is a perpendicular dot product zero?")).toEqual({
      content: "Close.\n\nWhy is it zero?",
      check: { question: "Why is a perpendicular dot product zero?" },
    });
  });

  it.each([
    ["**CHECK:** What is p(L)?", "What is p(L)?"],
    ["`CHECK: What is p(L)?`", "What is p(L)?"],
    ["check:   What   is p(L)?  ", "What is p(L)?"],
    ["> CHECK: What is p(L)?", "What is p(L)?"],
  ])("tolerates the wrapping a model adds: %j", (line, question) => {
    expect(splitCheck(`Text.\n${line}\n\n`).check).toEqual({ question });
  });

  it("leaves a marker that is not on the last line, or mid-sentence, as prose", () => {
    expect(splitCheck("CHECK: Q?\nMore text.")).toEqual({ content: "CHECK: Q?\nMore text.", check: null });
    expect(splitCheck("Let me check: is it zero?").check).toBeNull();
    expect(splitCheck("Text.\nCHECK:   ").check).toBeNull();
  });

  it("keeps the question as the prose when the reply is only the marker", () => {
    expect(splitCheck("CHECK: What is a dot product?")).toEqual({
      content: "What is a dot product?",
      check: { question: "What is a dot product?" },
    });
  });

  it("clips a long question", () => {
    expect(splitCheck(`x\nCHECK: ${"a".repeat(900)}`).check?.question).toHaveLength(400);
  });
});

describe("pendingCheck and checkSource (R4)", () => {
  const asked = { role: "assistant", check: { question: "Q?" } };
  const taught = { role: "assistant" };
  const user = { role: "user" };
  const studio = { role: "studio" };

  it("points at the last tutor turn only when it asked, past hand-off markers", () => {
    expect(pendingCheck([user, asked])).toBe(1);
    expect(pendingCheck([user, asked, studio])).toBe(1);
    expect(pendingCheck([user, asked, user])).toBeNull();
    expect(pendingCheck([user, taught])).toBeNull();
    expect(pendingCheck([])).toBeNull();
  });

  it("is a probe when every tutor turn before the check asked, teach once one explained", () => {
    expect(checkSource([user, asked], 1)).toBe("probe");
    expect(checkSource([asked, user, asked], 2)).toBe("probe");
    expect(checkSource([user, taught, user, asked], 3)).toBe("teach");
    // A teaching turn after the check does not count.
    expect(checkSource([user, asked, user, taught], 1)).toBe("probe");
  });
});

describe("verdict state", () => {
  it("keeps a save and a judge in flight on an ordinary read, so the buttons never reopen mid-save", () => {
    const v = { ...newVerdict("Q?", "chat-abc", "teach"), state: "saving" as const, tapped: true };
    expect(restoreVerdict(JSON.parse(JSON.stringify(v)))).toMatchObject({
      judged: "pending",
      state: "saving",
      tapped: true,
      requestId: "chat-abc",
      source: "teach",
    });
  });

  it("settles what a reload cut off, once, keeping the tapped verdict for its retry", () => {
    const v = { ...newVerdict("Q?", "chat-abc", "probe"), state: "saving" as const, tapped: false };
    expect(settleInterrupted(v)).toMatchObject({ judged: "unavailable", suggested: null, state: "failed", tapped: false });
    expect(settleInterrupted({ ...v, judged: "ready", suggested: true, state: "open" })).toBeNull();
  });

  it("keeps a recorded result and a ready suggestion", () => {
    const v = {
      ...newVerdict("Q?", "chat-abc", "probe"),
      judged: "ready",
      suggested: false,
      feedback: "Missing the cosine.",
      state: "recorded",
      recorded: { correct: false, pLBefore: 0.25, pLAfter: 0.1, intervalDays: 1 },
    };
    expect(restoreVerdict(v)).toMatchObject({ judged: "ready", suggested: false, state: "recorded", recorded: v.recorded });
  });

  it.each([
    null,
    "x",
    { ...newVerdict("Q?", "bad id!", "probe") },
    { ...newVerdict("Q?", "ok", "probe"), source: "review" },
    { ...newVerdict("", "ok", "probe") },
  ])("refuses %j", (value) => {
    expect(restoreVerdict(value)).toBeNull();
  });

  it("does not trust a recorded state with no result", () => {
    expect(restoreVerdict({ ...newVerdict("Q?", "ok", "probe"), state: "recorded" })?.state).toBe("open");
  });

  it("restores a check only with a question", () => {
    expect(restoreCheck({ question: "Q?" })).toEqual({ question: "Q?" });
    expect(restoreCheck({ question: " " })).toBeNull();
    expect(restoreCheck("Q?")).toBeNull();
  });

  it("words a recorded answer as the session page does", () => {
    const days = (d: number) => `${d} ${d === 1 ? "day" : "days"}`;
    expect(recordedLine({ correct: true, pLBefore: 0.25, pLAfter: 0.4123, intervalDays: 1 }, days)).toBe(
      "Recorded as correct · p(L) 0.25 → 0.41 · review in 1 day",
    );
    expect(recordedLine({ correct: false, pLBefore: 0.5, pLAfter: 0.3, intervalDays: null }, days)).toBe(
      "Recorded as incorrect · p(L) 0.50 → 0.30",
    );
  });

  it("words the recorded-answer card with the same facts (D89)", () => {
    const days = (d: number) => `${d} ${d === 1 ? "day" : "days"}`;
    expect(recordedCard({ correct: true, pLBefore: 0.25, pLAfter: 0.4123, intervalDays: 1 }, days)).toEqual({
      verdict: "Recorded as correct",
      mastery: "Mastery moved: p(L) 0.25 → 0.41",
      review: "review in 1 day",
    });
    expect(recordedCard({ correct: false, pLBefore: 0.5, pLAfter: 0.3, intervalDays: null }, days)).toEqual({
      verdict: "Recorded as incorrect",
      mastery: "Mastery moved: p(L) 0.50 → 0.30",
      review: null,
    });
  });
});

describe("matchCheck", () => {
  const checks = [
    { question: "What does a dot product of zero tell you about two vectors?" },
    { question: "How is the dot product computed from components?" },
  ];

  it("finds the note's check the tutor paraphrased", () => {
    expect(matchCheck("What does a dot product of zero tell you about the two vectors?", checks)).toBe(checks[0]);
  });

  it("does not take a question that differs in the word it turns on", () => {
    expect(matchCheck("What happens before the action?", [{ question: "What happens after the action?" }])).toBeNull();
  });

  it("finds nothing for a question the note does not ask", () => {
    expect(matchCheck("Why is softmax used in attention?", checks)).toBeNull();
    expect(matchCheck("?", checks)).toBeNull();
    expect(matchCheck("What is it?", [])).toBeNull();
  });
});

describe("recallOpening (R3)", () => {
  it("opens on the note's check, marked so the answer gets a row, and is a probe", () => {
    const turn = recallOpening("Dot product", "  Why is it   zero? ");
    expect(turn.check).toEqual({ question: "Why is it zero?" });
    expect(turn.content).toContain("Dot product");
    expect(turn.content.endsWith("Why is it zero?")).toBe(true);
    expect(pendingCheck([turn])).toBe(0);
    expect(checkSource([turn], 0)).toBe("probe");
  });
});

describe("dueRecall (R3)", () => {
  const now = new Date("2026-10-04T12:00:00Z");
  const checks = [{ question: " " }, { question: "Why is it zero?" }];

  it("opens on the first real check once the card is due", () => {
    expect(dueRecall({ due: "2026-10-04T12:00:00Z" }, checks, now)).toEqual({ question: "Why is it zero?" });
    expect(dueRecall({ due: "2026-08-21T00:00:00Z" }, [], now)).toEqual({ question: null });
  });

  it("says nothing with no card, a card not yet due, or a date it cannot read", () => {
    expect(dueRecall(null, checks, now)).toBeNull();
    expect(dueRecall({ due: "2026-10-05T00:00:00Z" }, checks, now)).toBeNull();
    expect(dueRecall({ due: "soon" }, checks, now)).toBeNull();
  });
});

describe("a check that names its concept (phase 3)", () => {
  it("reads CHECK(<concept>): from the topic tutor, and leaves it off a plain marker", () => {
    expect(splitCheck("Text.\nCHECK(dot-product): What is zero?").check).toEqual({
      question: "What is zero?",
      concept: "dot-product",
    });
    expect(splitCheck("Text.\n**CHECK( softmax ):** Why exp?").check).toEqual({ question: "Why exp?", concept: "softmax" });
    expect(splitCheck("Text.\nCHECK: Q?").check).toEqual({ question: "Q?" });
  });

  it("keeps a check only for a concept the topic declares", () => {
    const concepts = ["dot-product", "softmax"];
    expect(topicCheck({ question: "Q?", concept: "softmax" }, concepts)).toEqual({ question: "Q?", concept: "softmax" });
    expect(topicCheck({ question: "Q?", concept: "attention" }, concepts)).toBeNull();
    expect(topicCheck({ question: "Q?" }, concepts)).toBeNull();
    expect(topicCheck({ question: "Q?" }, ["softmax"])).toEqual({ question: "Q?", concept: "softmax" });
    expect(topicCheck({ question: "Q?", concept: "softmax" }, [])).toBeNull();
    expect(topicCheck(null, concepts)).toBeNull();
  });

  it("restores a stored concept only when it is shaped like one", () => {
    expect(restoreCheck({ question: "Q?", concept: "softmax" })).toEqual({ question: "Q?", concept: "softmax" });
    expect(restoreCheck({ question: "Q?", concept: "../x" })).toEqual({ question: "Q?" });
  });
});
