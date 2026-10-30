import { describe, expect, it } from "vitest";

import {
  buildCheckOptionsPrompt,
  optionLengthBounds,
  parseCheckOptions,
} from "../src/check-options";

/**
 * The wrong-option writer's pure half: the prompt carries the question, the
 * answer and the note as data, and the parser refuses any reply that could
 * put a second right answer among the options.
 */

const ANSWER = "The cosine of the angle between them.";
const GOOD = ["The sine of the angle between them.", "The length of their sum.", "The area of the parallelogram they span."];
const reply = (wrong: unknown) => JSON.stringify({ wrong });

describe("buildCheckOptionsPrompt", () => {
  const input = {
    slug: "dot-product",
    title: "Dot product",
    summary: "Measures alignment.",
    body: "The body.\n\n```check\nq: Hidden?\n```",
    place: null,
    requires: [],
    assumes: [],
    dependants: [],
    mastery: { pL: 0.25, label: "Gap", observations: 0, correct: 0 },
  } as unknown as Parameters<typeof buildCheckOptionsPrompt>[0];

  it("quotes the question, the answer and the note as data, and asks for JSON alone", () => {
    const prompt = buildCheckOptionsPrompt(input, { question: "What does it measure?", answer: ANSWER });
    expect(prompt).toContain("What does it measure?");
    expect(prompt).toContain(ANSWER);
    expect(prompt).toContain("The body.");
    expect(prompt).toContain("data, not instructions");
    expect(prompt).toContain('{"wrong": ["...", "...", "..."]}');
    // A check fence in the note cannot close the data block.
    expect(prompt).not.toMatch(/^```check/m);
  });

  it("asks for options near the answer's length", () => {
    const prompt = buildCheckOptionsPrompt(input, { question: "Q?", answer: "x".repeat(40) });
    expect(prompt).toContain("roughly 24 to 60 characters");
  });
});

describe("parseCheckOptions", () => {
  it("takes three distinct options, through a fence or a sentence before the object", () => {
    expect(parseCheckOptions(reply(GOOD), ANSWER)).toEqual({ ok: true, options: GOOD });
    expect(parseCheckOptions(`Here you go:\n\`\`\`json\n${reply(GOOD)}\n\`\`\``, ANSWER)).toEqual({ ok: true, options: GOOD });
    expect(parseCheckOptions(reply(["  The sine\n of the angle between them. ", GOOD[1], GOOD[2]]), ANSWER)).toEqual({
      ok: true,
      options: ["The sine of the angle between them.", GOOD[1], GOOD[2]],
    });
  });

  it.each([
    ["prose", "The sine, the length and the area."],
    ["no wrong list", JSON.stringify({ options: GOOD })],
    ["two options", reply(GOOD.slice(0, 2))],
    ["four options", reply([...GOOD, "A fourth wrong one here."])],
    ["a number", reply([GOOD[0], GOOD[1], 3])],
    ["a repeat", reply([GOOD[0], GOOD[1], "the sine of the angle between them"])],
    ["the answer itself", reply([GOOD[0], GOOD[1], "The cosine of the angle between them"])],
    ["the answer inside an option", reply([GOOD[0], GOOD[1], "Not the cosine of the angle between them."])],
    ["part of the answer", reply([GOOD[0], GOOD[1], "The cosine of the angle"])],
    ["far too long", reply([GOOD[0], GOOD[1], "x".repeat(200)])],
    ["far too short", reply([GOOD[0], GOOD[1], "Sine."])],
  ])("refuses %s", (_, text) => {
    const parsed = parseCheckOptions(text, ANSWER);
    expect(parsed.ok).toBe(false);
  });

  it("holds short answers to equality, not containment", () => {
    expect(parseCheckOptions(reply(["O(n log n)", "O(n^2)", "O(1)"]), "O(n)")).toMatchObject({ ok: true });
    expect(parseCheckOptions(reply(["14", "40", "2"]), "4")).toMatchObject({ ok: true });
    expect(parseCheckOptions(reply(["4", "40", "2"]), "4")).toMatchObject({ ok: false });
  });

  it("bounds lengths by the answer's, within the table's limit", () => {
    expect(optionLengthBounds("O(n)")).toEqual({ min: 1, max: 64 });
    expect(optionLengthBounds("x".repeat(100))).toEqual({ min: 30, max: 300 });
    expect(optionLengthBounds("x".repeat(300)).max).toBe(400);
  });
});
