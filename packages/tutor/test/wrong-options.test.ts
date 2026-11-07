import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { checkQuestion, withWrittenOptions, type DistractorPool } from "@gnosia/tutor/session-core";
import type { ConceptCheck } from "@gnosia/tutor/concept-note-core";

/**
 * A note check's wrong options, as worked cases (docs/LEARN.md, "Wrong
 * options"): how `checkQuestion` lays a check out from the tutor's written
 * options, the notes' or the padded pool, and how `withWrittenOptions`
 * relays it once the tutor's options arrive.
 */

interface Case {
  name: string;
  slug: string;
  check: ConceptCheck;
  variant: string;
  otherAnswers: string[];
  pool: DistractorPool;
  written?: string[];
  canWrite: boolean;
  tutor?: string[];
  expected: { choices: string[]; correct: number; wrong: string; rewrite: unknown };
  rewritten?: { choices: string[]; correct: number; wrong: string };
}

const FIXTURE = resolve(__dirname, "fixtures/wrong-options.json");
const cases = JSON.parse(readFileSync(FIXTURE, "utf8")) as Case[];

describe("a check's wrong options", () => {
  it("covers the tutor's, the notes' and the padded kinds", () => {
    expect(new Set(cases.map((c) => c.expected.wrong))).toEqual(new Set(["tutor", "notes", "padded"]));
  });

  it.each(cases.map((c) => [c.name, c] as const))("%s", (_, c) => {
    const q = checkQuestion(c);
    expect(q).not.toBeNull();
    expect({ choices: q?.choices, correct: q?.correct, wrong: q?.wrong, rewrite: q?.rewrite ?? null }).toEqual(c.expected);
    if (c.tutor !== undefined && c.rewritten !== undefined && q !== null) {
      const laid = withWrittenOptions(q, c.tutor);
      expect({ choices: laid?.choices, correct: laid?.correct, wrong: laid?.wrong }).toEqual(c.rewritten);
    }
  });
});
