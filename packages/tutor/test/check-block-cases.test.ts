import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { checkBlockText, choiceAnswerText, readCheckBlock, recallAnswerText } from "@hermes/tutor/check-block";

/**
 * The concept tutor's chat checks, as worked cases (S9-01): each `check`
 * the chat route returns, the block the asking turn writes back, and the
 * text each answer sends. A change to check-block.ts's text fails here
 * until the fixture follows.
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

const FIXTURE = resolve(__dirname, "fixtures/check-blocks.json");
const cases = JSON.parse(readFileSync(FIXTURE, "utf8")) as Case[];

describe("the chat check cases", () => {
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
