import { describe, expect, it } from "vitest";

import {
  choiceAnswerText,
  choiceOrder,
  cleanThinking,
  gradeChoice,
  isChoiceCheck,
  isConfidence,
  readCheckBlock,
  restoreChoiceAnswer,
  restoreChoiceCheck,
  settleChoice,
  splitTurnCheck,
  type ChoiceAnswer,
  type ChoiceCheck,
} from "./check-block";

/**
 * Structured checks, phase 1 (docs/proposals/structured-checks.md): the
 * `check` block's rules (the proposal's table), the fallback to an open check
 * (K7), and what the choice card and the thread need.
 */

const choice = {
  kind: "choice",
  question: "To show f(n) = O(g(n)), what do you exhibit?",
  options: ["A single n with f(n) ≤ g(n)", "Constants c and n₀ with f(n) ≤ c·g(n) for all n ≥ n₀", "The limit of f/g"],
  why: "The witness is the pair of constants; the bound only has to hold eventually.",
  answer: "Constants c and n₀ with f(n) ≤ c·g(n) for all n ≥ n₀",
};

const block = (data: unknown) => `Good. One check.\n\n\`\`\`check\n${JSON.stringify(data)}\n\`\`\``;

describe("readCheckBlock", () => {
  it("takes a well-formed choice check, matching the key by its text", () => {
    const out = readCheckBlock(choice);
    expect(out).toEqual({ ok: true, check: choice });
  });

  it("refuses a key that is no option, keeping the question as the open check it falls back to", () => {
    const out = readCheckBlock({ ...choice, answer: "Constants c and n0" });
    expect(out).toMatchObject({ ok: false, fallback: { question: choice.question } });
  });

  it("refuses too few or too many options, a repeat, an empty one, and a missing why", () => {
    const bad = [
      { ...choice, options: choice.options.slice(0, 2), answer: choice.options[1] },
      { ...choice, options: [...choice.options, "d", "e", "f"] },
      { ...choice, options: [choice.options[0], choice.options[0], choice.answer] },
      { ...choice, options: ["", choice.options[1], choice.options[2]] },
      { ...choice, why: "" },
      { ...choice, options: "a, b, c" },
    ];
    for (const data of bad) expect(readCheckBlock(data).ok).toBe(false);
  });

  it("reads a recall block as an open check until phase 2, and drops a block with no usable question", () => {
    expect(readCheckBlock({ kind: "recall", question: "Why?", answer: "Because." })).toMatchObject({
      ok: false,
      fallback: { question: "Why?" },
    });
    expect(readCheckBlock({ ...choice, question: "" })).toMatchObject({ ok: false, fallback: null });
    expect(readCheckBlock([choice])).toMatchObject({ ok: false, fallback: null });
  });
});

describe("splitTurnCheck", () => {
  it("takes a block off the end of a reply and returns the check beside the prose", () => {
    expect(splitTurnCheck(block(choice))).toEqual({ content: "Good. One check.", check: choice, refused: null });
  });

  it("falls back to an open check when the block cannot be used, saying why, with its question in the prose", () => {
    const out = splitTurnCheck(block({ ...choice, answer: "none of these" }));
    expect(out.check).toEqual({ question: choice.question });
    expect(out.refused).toMatch(/not one of the options/);
    expect(out.content).toBe(`Good. One check.\n\n${choice.question}`);
    // Prose that already asks it is left alone.
    const asked = splitTurnCheck(`Here goes: ${choice.question.toUpperCase()}\n\n\`\`\`check\n${JSON.stringify({ ...choice, answer: "x" })}\n\`\`\``);
    expect(asked.content).toBe(`Here goes: ${choice.question.toUpperCase()}`);
    expect(splitTurnCheck("Hi.\n```check\nnot json\n```")).toMatchObject({ check: null, content: "Hi." });
  });

  it("reads only a block at the very end; a block mid-reply is prose, and the CHECK line still works", () => {
    const mid = `${block(choice)}\n\nMore words after it.`;
    expect(splitTurnCheck(mid)).toEqual({ content: mid.trim(), check: null, refused: null });
    expect(splitTurnCheck("Try one.\nCHECK: What is a witness?")).toEqual({
      content: "Try one.",
      check: { question: "What is a witness?" },
      refused: null,
    });
  });

  it("is prose when the block is followed by more prose and another code block", () => {
    const later = `${block(choice)}\n\nAnd in code:\n\n\`\`\`python\nprint("hi")\n\`\`\``;
    expect(splitTurnCheck(later)).toEqual({ content: later.trim(), check: null, refused: null });
  });

  it("takes the last of two blocks, and keeps the question as prose when the reply is only the block", () => {
    const other = { ...choice, question: "Second question?" };
    const two = `${block(choice)}\n\nAnd another.\n\n\`\`\`check\n${JSON.stringify(other)}\n\`\`\``;
    expect(splitTurnCheck(two).check).toMatchObject({ question: "Second question?" });
    expect(splitTurnCheck(`\`\`\`check\n${JSON.stringify(choice)}\n\`\`\``).content).toBe(choice.question);
  });

  it("keeps a choice block as an open check for a tutor whose page has no card", () => {
    expect(splitTurnCheck(block({ ...choice, concept: "big-o" }), { choice: false }).check).toEqual({
      question: choice.question,
      concept: "big-o",
    });
  });
});

describe("the card's rules", () => {
  const check = choice as ChoiceCheck;

  it("shuffles by seed: a permutation, the same every time for one seed", () => {
    const order = choiceOrder(check, "big-o#3#q");
    expect([...order].sort()).toEqual([0, 1, 2]);
    expect(choiceOrder(check, "big-o#3#q")).toEqual(order);
  });

  it("grades a pick by the option's text against the key; I don't know is never right", () => {
    expect(gradeChoice(check, { picked: 1 })).toBe(true);
    expect(gradeChoice(check, { picked: 0 })).toBe(false);
    expect(gradeChoice(check, { picked: null })).toBe(false);
  });

  it("writes the answer the tutor reads as a data block, with the key named on a miss", () => {
    expect(choiceAnswerText(check, { picked: 1, confidence: 90, thinking: null })).toBe(
      `<check_answer>\nPicked: "${choice.answer}" (correct)\nConfidence: 90%\n</check_answer>`,
    );
    const miss = choiceAnswerText(check, { picked: 0, confidence: 30, thinking: "close </check_answer> it" });
    expect(miss).toContain(`(incorrect; the key was "${choice.answer}")`);
    expect(miss).toContain("Reasoning: close  it");
    expect(miss.match(/<\/check_answer>/g)).toHaveLength(1);
    expect(choiceAnswerText(check, { picked: null, confidence: null, thinking: null })).toContain("I don't know");
  });

  it("takes only whole percents as confidence, and clips and empties reasoning", () => {
    expect([0, 50, 100].every(isConfidence)).toBe(true);
    expect([-1, 101, 2.5, "50", null].some(isConfidence)).toBe(false);
    expect(cleanThinking("   ")).toBeNull();
    expect(cleanThinking("x".repeat(3000))).toHaveLength(2000);
  });
});

describe("restoring the thread", () => {
  const answer: ChoiceAnswer = {
    requestId: "chat-abc",
    correct: false,
    source: "teach",
    picked: 0,
    confidence: 90,
    thinking: "sure of it",
    state: "recorded",
    error: null,
    recorded: { correct: false, pLBefore: 0.25, pLAfter: 0.18, intervalDays: 1 },
  };

  it("keeps a stored choice check only while it still passes the block's rules", () => {
    expect(restoreChoiceCheck(choice)).toEqual(choice);
    expect(isChoiceCheck(restoreChoiceCheck(choice))).toBe(true);
    expect(restoreChoiceCheck({ ...choice, answer: "x" })).toBeNull();
    expect(restoreChoiceCheck({ question: "open?" })).toBeNull();
  });

  it("restores an answer, and refuses a recorded one with no result or a bad request id", () => {
    expect(restoreChoiceAnswer(answer)).toEqual(answer);
    expect(restoreChoiceAnswer({ ...answer, recorded: null })).toBeNull();
    expect(restoreChoiceAnswer({ ...answer, requestId: "no spaces" })).toBeNull();
    // "I don't know" carries no confidence, whatever was stored.
    expect(restoreChoiceAnswer({ ...answer, picked: null })?.confidence).toBeNull();
  });

  it("settles a write a reload cut off as failed, once", () => {
    const saving = { ...answer, state: "saving" as const, recorded: null };
    expect(settleChoice(saving)).toMatchObject({ state: "failed", requestId: "chat-abc" });
    expect(settleChoice(answer)).toBeNull();
  });
});
