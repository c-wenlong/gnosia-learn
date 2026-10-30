import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { readReviews } from "../src/state";
import { learnCli } from "./learn-cli-fixture";
import { probe } from "./scratch-database";

/**
 * The `learn` CLI's loop, end to end: an observation written as an event, a
 * mastery row and a card, voided and rebuilt, and logged into the session
 * log. learn-cli-fixture.ts describes the database and knowledge base.
 */

const reachable = await probe();

describe.skipIf(!reachable.ok)("learn CLI", () => {
  const cli = learnCli();
  const { learn, json } = cli;

  describe("the loop", () => {
    it("records an observation as an event, a mastery row and a card", async () => {
      await learn("observe", "--concept", "alpha", "--correct", "true", "--source", "teach");

      const model = await json<{ concepts: { id: string; observations?: number }[] }>("model");
      expect(model.concepts.find((c) => c.id === "alpha")?.observations).toBe(1);

      const { rows } = await cli.scratch.db.execute<{ type: string; concept_slug: string }>(
        "select type, concept_slug from event",
      );
      expect(rows).toEqual([{ type: "observation", concept_slug: "alpha" }]);
      // Scheduled a day out, which is why this reads the table rather than
      // asking `review due`.
      expect(Object.keys((await readReviews(cli.scratch.db)).cards)).toEqual(["alpha"]);
    });

    it("void plus model --rebuild drops the evidence and keeps the log", async () => {
      for (let i = 0; i < 3; i += 1) {
        await learn(
          "observe", "--concept", "alpha", "--correct", "true",
          "--source", "probe", "--session", "s1",
        );
      }
      const before = await json<{ concepts: { id: string; pL: number }[] }>("model");
      expect(before.concepts.find((c) => c.id === "alpha")?.pL).toBeGreaterThan(0.9);

      await learn("void", "--session", "s1", "--reason", "answer was always first");
      await learn("model", "--rebuild");

      const after = await json<{ concepts: { id: string; observations?: number }[] }>("model");
      expect(after.concepts.find((c) => c.id === "alpha")?.observations).toBeUndefined();

      // The observations are retained for audit, alongside the void marker.
      const { rows } = await cli.scratch.db.execute<{ type: string; n: number }>(
        "select type, count(*) as n from event group by type order by type",
      );
      expect(rows).toEqual([
        { type: "observation", n: 3 },
        { type: "void", n: 1 },
      ]);
    });

    it("review rebuild reproduces the schedule the writes produced", async () => {
      await learn("observe", "--concept", "alpha", "--correct", "true");
      await learn("observe", "--concept", "beta", "--correct", "false");
      await learn("review", "grade", "--concept", "alpha", "--grade", "5");

      const before = (await readReviews(cli.scratch.db)).cards;
      await learn("review", "rebuild");
      const after = (await readReviews(cli.scratch.db)).cards;

      // Exact, not approximate: one clock per write is what makes the replay
      // land on the same due dates rather than a few milliseconds off.
      expect(after).toEqual(before);
    });

    it("--schedule false is remembered, so a rebuild does not invent a card", async () => {
      await learn("observe", "--concept", "alpha", "--correct", "true", "--schedule", "false");
      expect((await readReviews(cli.scratch.db)).cards).toEqual({});
      await learn("review", "rebuild");
      expect((await readReviews(cli.scratch.db)).cards).toEqual({});
    });

    it("writes the exchange into the session log as Obsidian callouts", async () => {
      await learn("session", "start", "--id", "s1", "--topic", "vector calculus");
      await learn(
        "observe", "--concept", "alpha", "--correct", "true",
        "--source", "probe", "--session", "s1",
        "--question", "What does $\\nabla \\cdot \\mathbf{F}$ measure?",
        "--options", "Circulation per unit area|Net outward flux per unit volume",
        "--chosen", "2. Net outward flux per unit volume",
        "--answer", "2",
        "--note", "it is a density, so per unit volume",
      );

      const log = await readFile(path.join(cli.root, "learn", "sessions", "s1.md"), "utf8");
      expect(log).toContain("> [!question] Quiz");
      expect(log).toContain("> [!success] Correct");
      expect(log).toContain("**In your words:** it is a density");
      // LaTeX must survive untouched for Obsidian to render it.
      expect(log).toContain("$\\nabla \\cdot \\mathbf{F}$");
    });

    it("session close links every concept back and reports the frontier", async () => {
      await learn("session", "start", "--id", "s2", "--topic", "alpha");
      await learn("observe", "--concept", "alpha", "--correct", "true", "--session", "s2");

      const result = await json<{ concepts: string[]; linked: string[]; unchecked: string[] }>(
        "session", "close", "--id", "s2",
      );
      expect(result.concepts).toEqual(["alpha"]);
      expect(result.linked).toEqual(["alpha"]);
      // Scheduled with no stored check: the warning /review depends on.
      expect(result.unchecked).toEqual(["alpha"]);

      const note = await readFile(
        path.join(cli.root, "learn", "concepts", "fixtures", "alpha.md"),
        "utf8",
      );
      expect(note).toContain("s2");
    });
  });
});
