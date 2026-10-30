import { describe, expect, it } from "vitest";

import { DEFAULT_PARAMS, update as bktUpdate } from "../../../scripts/learn/lib/bkt.mjs";
import { gradeFromOutcome } from "../../../scripts/learn/lib/schedule.mjs";
import { LOW_CONFIDENCE, readEvents } from "../src/state";
import { learnCli, stamp } from "./learn-cli-fixture";
import { probe } from "./scratch-database";

/**
 * `learn observe --confidence --thinking` (docs/proposals/structured-checks.md,
 * K5), end to end: what the flags write into the event, the grade a guess is
 * capped at, and the values refused. learn-cli-fixture.ts describes the
 * database and knowledge base.
 */

const reachable = await probe();

describe.skipIf(!reachable.ok)("learn CLI", () => {
  const cli = learnCli();
  const { learn, json } = cli;

  describe("confidence and reasoning (docs/proposals/structured-checks.md, K5)", () => {
    it("an observe without the flags writes the event it always did", async () => {
      await learn("observe", "--concept", "gamma", "--correct", "true");
      const [written] = await readEvents(cli.scratch.db);
      // Pinned whole: no `confidence`, `thinking` or `chosen` key, as before the flags.
      expect(stamp(written)).toEqual({
        at: "<instant>",
        type: "observation",
        concept: "gamma",
        correct: true,
        propagated: [
          { concept: "beta", hops: 1 },
          { concept: "alpha", hops: 2 },
        ],
        source: "probe",
        opportunity: false,
        grade: 3,
        scheduled: true,
        pLBefore: 0.25,
        pLAfter: 0.6,
        question: null,
        answer: null,
      });
    });

    it("writes both into the event, caps a correct answer at low confidence, and keeps --json as it was", async () => {
      // Two correct answers first, so the uncapped grade is above 3 and the cap shows.
      await learn("observe", "--concept", "alpha", "--correct", "true", "--source", "teach");
      await learn("observe", "--concept", "alpha", "--correct", "true", "--source", "teach");
      const result = await json<Record<string, unknown>>(
        "observe", "--concept", "alpha", "--correct", "true", "--source", "teach",
        "--chosen", "B", "--confidence", String(LOW_CONFIDENCE), "--thinking", "A guess, honestly.",
      );
      expect(Object.keys(result)).toEqual(Object.keys(await json("observe", "--concept", "beta", "--correct", "true")));

      const observed = (await readEvents(cli.scratch.db)).filter((e) => e.concept === "alpha");
      const last = observed.at(-1)!;
      expect(gradeFromOutcome(true, last.pLAfter as number)).toBeGreaterThan(3);
      expect(last).toMatchObject({ confidence: LOW_CONFIDENCE, thinking: "A guess, honestly.", grade: 3 });
      // The confidence never reaches p(L): BKT reads `correct` only.
      expect(result.pLAfter).toBe(bktUpdate(last.pLBefore, true, { params: DEFAULT_PARAMS, opportunity: true }));
      expect(observed[1]).not.toHaveProperty("confidence");
    });

    it("refuses a bad confidence, or one with no pick, before writing anything", async () => {
      for (const flags of [
        ["--chosen", "B", "--confidence", "101"],
        ["--chosen", "B", "--confidence", "50.5"],
        ["--chosen", "B", "--confidence=-1"],
        ["--chosen", "B", "--confidence", ""],
        ["--chosen", "B", "--confidence", "lots"],
        ["--confidence", "80"],
        ["--chosen", " ", "--confidence", "80"],
      ]) {
        await expect(learn("observe", "--concept", "alpha", "--correct", "false", ...flags)).rejects.toThrow(
          /--confidence (must be a whole number|needs --chosen)/,
        );
      }
      expect(await readEvents(cli.scratch.db)).toEqual([]);
    });
  });
});
