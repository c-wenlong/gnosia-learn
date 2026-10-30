import { describe, expect, it } from "vitest";

import type { ConceptPromptInput } from "../src/prompt";
import { buildSessionQuestionPrompt, firstSentence, parseSessionQuestion } from "../src/session-question";

const input: ConceptPromptInput = {
  slug: "dot-product",
  title: "Dot product",
  summary: "Measures alignment.",
  body: "The dot product of two vectors measures alignment.",
  place: null,
  requires: [],
  assumes: [],
  dependants: [],
  mastery: { pL: 0.25, label: "Not started", observations: 0, correct: 0, lastSeen: null, due: null },
  recent: [],
  sources: [],
};

const good = {
  question: "What is the dot product of two perpendicular vectors?",
  options: ["Zero", "One", "The product of their lengths", "Undefined"],
  correct: 0,
  explanation: "Perpendicular directions share no component. One is the cosine of zero, not of a right angle.",
};

describe("buildSessionQuestionPrompt", () => {
  it("grounds the question in the note and asks for JSON only", () => {
    const prompt = buildSessionQuestionPrompt(input, "probe");
    expect(prompt).toContain("Dot product");
    expect(prompt).toContain("measures alignment");
    expect(prompt).toContain("PROBE");
    expect(prompt).toContain('"correct"');
    expect(prompt).toMatch(/single JSON object and nothing else/);
  });

  it("says what a check is for, and lists the questions not to repeat", () => {
    const prompt = buildSessionQuestionPrompt(input, "check", ["Why zero?"]);
    expect(prompt).toContain("CHECK");
    expect(prompt).toContain("- Why zero?");
  });
});

describe("parseSessionQuestion", () => {
  it("reads a clean reply, keeping track of the right answer through the shuffle", () => {
    const parsed = parseSessionQuestion(JSON.stringify(good));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const q = parsed.question;
    expect(q.prompt).toBe(good.question);
    expect([...q.choices].sort()).toEqual([...good.options].sort());
    expect(q.choices[q.correct]).toBe("Zero");
    expect(q.reason).toBe("Perpendicular directions share no component.");
    expect(q.explanation).toBe(good.explanation);
    expect(q.origin).toBe("model");
  });

  it("shuffles the same reply the same way every time", () => {
    const a = parseSessionQuestion(JSON.stringify(good));
    const b = parseSessionQuestion(JSON.stringify(good));
    expect(a).toEqual(b);
  });

  it("does not leave the right answer in slot one across questions", () => {
    // Models favour slot one; the parser must not pass that bias on.
    const slots = new Set<number>();
    for (let i = 0; i < 12; i += 1) {
      const parsed = parseSessionQuestion(JSON.stringify({ ...good, question: `${good.question} (${i})` }));
      if (parsed.ok) slots.add(parsed.question.correct);
    }
    expect(slots.size).toBeGreaterThan(1);
  });

  it("tolerates a fence or a sentence around the object", () => {
    expect(parseSessionQuestion("```json\n" + JSON.stringify(good) + "\n```").ok).toBe(true);
    expect(parseSessionQuestion(`Here is your question:\n${JSON.stringify(good)}\nGood luck!`).ok).toBe(true);
    expect(parseSessionQuestion(JSON.stringify({ ...good, correct: undefined, correctIndex: 2 })).ok).toBe(true);
  });

  it("keeps braces inside strings from ending the object early", () => {
    const withBraces = { ...good, question: "What is {a} · {b} when a ⟂ b?" };
    const parsed = parseSessionQuestion(`${JSON.stringify(withBraces)} trailing }`);
    expect(parsed.ok && parsed.question.prompt).toBe("What is {a} · {b} when a ⟂ b?");
  });

  it("falls back, with a reason, when the model answers in prose", () => {
    const parsed = parseSessionQuestion("Sure! What do you think the dot product of perpendicular vectors is?");
    expect(parsed).toEqual({ ok: false, reason: "The reply held no JSON object." });
  });

  it.each([
    ["broken JSON", '{"question": "Q?", "options": [}'],
    ["an array", "[1, 2, 3]"],
    ["no question", JSON.stringify({ ...good, question: "" })],
    ["two options", JSON.stringify({ ...good, options: ["Zero", "One"] })],
    ["five options", JSON.stringify({ ...good, options: ["a", "b", "c", "d", "e"] })],
    ["a duplicate option", JSON.stringify({ ...good, options: ["Zero", "zero", "One", "Two"] })],
    ["a non-string option", JSON.stringify({ ...good, options: ["Zero", 1, "Two", "Three"] })],
    ["an index out of range", JSON.stringify({ ...good, correct: 4 })],
    ["a fractional index", JSON.stringify({ ...good, correct: 1.5 })],
    ["the answer as text", JSON.stringify({ ...good, correct: "Zero" })],
  ])("refuses %s rather than guess an answer key", (_label, reply) => {
    expect(parseSessionQuestion(reply).ok).toBe(false);
  });

  it("takes a question with no explanation, with nothing behind Why?", () => {
    const parsed = parseSessionQuestion(JSON.stringify({ ...good, explanation: undefined }));
    expect(parsed.ok && parsed.question.explanation).toBeNull();
    expect(parsed.ok && parsed.question.reason).toBeNull();
  });
});

describe("firstSentence", () => {
  it("stops at the first full stop followed by a space", () => {
    expect(firstSentence("One is 1.5 units. Two.")).toBe("One is 1.5 units.");
    expect(firstSentence("No stop at all")).toBe("No stop at all");
  });
});
