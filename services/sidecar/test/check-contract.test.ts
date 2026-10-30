import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { checkBlockText, choiceAnswerText, readCheckBlock, recallAnswerText } from "@gnosia/tutor/check-block";

/**
 * The concept tutor's chat checks, one fixture for two languages (S9-01).
 * The macOS chat draws the `check` the chat route returns and writes the
 * answer and the asking turn's block back itself (apps/macos's
 * TutorCheck.swift); apps/macos/Tests/GnosiaTests/TutorCheckTests.swift
 * asserts its port against this same file. This half holds the fixture to
 * check-block.ts, so a change to the web's text fails here until the fixture,
 * and so the Swift port, follows.
 */

interface Case {
  check: unknown;
  block: string;
  answers: Array<{
    picked?: number | null;
    words?: string;
    confidence: number | null;
    thinking: string | null;
    text: string;
  }>;
}

const FIXTURE = resolve(__dirname, "../../../apps/macos/Tests/GnosiaTests/Fixtures/check-blocks.json");
const cases = JSON.parse(readFileSync(FIXTURE, "utf8")) as Case[];

describe("the chat check contract with the macOS app", () => {
  it("covers both card kinds", () => {
    const kinds = cases.map((c) => (c.check as { kind: string }).kind);
    expect(new Set(kinds)).toEqual(new Set(["choice", "recall"]));
  });

  it.each(cases.map((c, i) => [i, c] as const))("case %i reads, writes back and answers as the fixture says", (_, c) => {
    const read = readCheckBlock(c.check);
    if (!read.ok) throw new Error(read.reason);
    expect(checkBlockText(read.check)).toBe(c.block);
    for (const a of c.answers) {
      const text =
        read.check.kind === "choice"
          ? choiceAnswerText(read.check, { picked: a.picked ?? null, confidence: a.confidence, thinking: a.thinking })
          : recallAnswerText({ answer: a.words ?? "", confidence: a.confidence ?? 0, thinking: a.thinking });
      expect(text).toBe(a.text);
    }
  });
});
