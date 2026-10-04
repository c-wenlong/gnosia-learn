import { describe, expect, it } from "vitest";

import {
  checkSource,
  matchCheck,
  newVerdict,
  pendingCheck,
  recordedLine,
  restoreCheck,
  restoreVerdict,
  splitCheck,
} from "./tutor-check";

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
  it("restores a stored verdict, cutting off what a reload interrupted", () => {
    const v = { ...newVerdict("Q?", "chat-abc", "teach"), state: "saving" as const };
    expect(restoreVerdict(JSON.parse(JSON.stringify(v)))).toMatchObject({
      judged: "unavailable",
      suggested: null,
      state: "open",
      requestId: "chat-abc",
      source: "teach",
    });
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
});

describe("matchCheck", () => {
  const checks = [
    { question: "What does a dot product of zero tell you about two vectors?" },
    { question: "How is the dot product computed from components?" },
  ];

  it("finds the note's check the tutor paraphrased", () => {
    expect(matchCheck("What does a zero dot product tell you about the two vectors?", checks)).toBe(checks[0]);
  });

  it("finds nothing for a question the note does not ask", () => {
    expect(matchCheck("Why is softmax used in attention?", checks)).toBeNull();
    expect(matchCheck("?", checks)).toBeNull();
    expect(matchCheck("What is it?", [])).toBeNull();
  });
});
