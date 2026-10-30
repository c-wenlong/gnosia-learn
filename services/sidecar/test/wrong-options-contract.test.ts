import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { checkQuestion, withWrittenOptions, type DistractorPool } from "@gnosia/tutor/session-core";
import type { ConceptCheck } from "@gnosia/tutor/concept-note-core";

/**
 * A note check's wrong options, one fixture for two languages
 * (docs/LEARN.md, "Wrong options"). The macOS app builds its questions
 * itself and asks the sidecar's `POST /api/agent/check-options` for the
 * tutor's options, so its port of `checkQuestion` and `withWrittenOptions`
 * (SessionModel.swift) has to lay a check out as the web does:
 * apps/macos/Tests/GnosiaTests/WrongOptionsTests.swift asserts the port
 * against this same file, and this half holds the file to session-core.ts.
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

const FIXTURE = resolve(__dirname, "../../../apps/macos/Tests/GnosiaTests/Fixtures/wrong-options.json");
const cases = JSON.parse(readFileSync(FIXTURE, "utf8")) as Case[];

describe("the wrong-options contract with the macOS app", () => {
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
