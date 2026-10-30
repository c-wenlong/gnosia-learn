import { describe, expect, it } from "vitest";

import { upsertReview } from "../src/state";
import { learnCli, stamp } from "./learn-cli-fixture";
import { probe } from "./scratch-database";

/**
 * The `learn` CLI, end to end, against a scratch database and a temporary
 * knowledge base.
 *
 * This replaces `scripts/learn/cli.test.mjs`, which copied the pipeline into a
 * temp directory to get a temp `learn/` for free — a trick that stops working
 * when the state is a database rather than files beside the code. The CLI takes
 * `LEARN_ROOT` for the files and `DATABASE_URL` for the rest, so a run here can
 * touch neither the real `learn/` nor the real `gnosia`.
 *
 * **The `--json` shapes are a contract.** The `/learn` and `/review` skills
 * live in a plugin outside this repo and parse them, and `learn/README.md`
 * documents them. The five pinned below are the five those skills actually
 * read. Everything that varies with the clock is replaced by a marker rather
 * than loosened to `expect.any`, so a field that stops being a timestamp is
 * still a failure.
 *
 * This file pins the shapes; learn-cli-fixture.ts lists the other suites.
 */

const reachable = await probe();

describe.skipIf(!reachable.ok)("learn CLI", () => {
  const cli = learnCli();
  const { json } = cli;

  describe("the pinned --json shapes", () => {
    it("status", async () => {
      expect(await json("status")).toEqual({
        stats: { total: 3, mastered: 0, learning: 0, untouched: 3 },
        due: 0,
        frontier: [{ id: "alpha", title: "Alpha", pL: 0.25, requires: [] }],
        sessions: 0,
      });
    });

    it("frontier", async () => {
      expect(await json("frontier")).toEqual([
        { id: "alpha", title: "Alpha", pL: 0.25, requires: [] },
      ]);
    });

    it("plan", async () => {
      expect(await json("plan", "--goal", "gamma")).toEqual({
        goal: "gamma",
        steps: [
          { id: "alpha", title: "Alpha", pL: 0.25, mastered: false, gap: true, requires: [] },
          { id: "beta", title: "Beta", pL: 0.25, mastered: false, gap: true, requires: ["alpha"] },
          { id: "gamma", title: "Gamma", pL: 0.25, mastered: false, gap: true, requires: ["beta"] },
        ],
        incomplete: false,
        skipped: 0,
      });
    });

    it("observe", async () => {
      const result = await json("observe", "--concept", "gamma", "--correct", "true");
      expect(stamp(result)).toEqual({
        concept: "gamma",
        correct: true,
        pLBefore: 0.25,
        pLAfter: 0.6,
        delta: 0.35,
        mastery: "shaky",
        mastered: false,
        due: "<instant>",
        logged: false,
        propagated: [
          { concept: "beta", hops: 1, pLBefore: 0.25, pLAfter: 0.39 },
          { concept: "alpha", hops: 2, pLBefore: 0.25, pLAfter: 0.306 },
        ],
      });
    });

    it("review due", async () => {
      // Seeded rather than observed: `observe` schedules the first sighting a
      // day out, so nothing the CLI can do in one run is due yet.
      await upsertReview(cli.scratch.db, {
        conceptId: "alpha",
        repetitions: 1,
        ease: 2.5,
        intervalDays: 1,
        lapses: 0,
        due: "2026-01-01T00:00:00.000Z",
        lastReviewed: "2025-12-31T00:00:00.000Z",
        leech: false,
        history: [],
      });
      expect(stamp(await json("review", "due"))).toEqual([
        {
          id: "alpha",
          title: "Alpha",
          due: "<instant>",
          intervalDays: 1,
          lapses: 0,
          leech: false,
          checks: [],
        },
      ]);
    });

    it("review grade", async () => {
      // Pinned because the grade moved into `state/review.ts` so the web app's
      // `POST /api/review/grade` runs the same code: the shape must not move
      // with it. A first review at grade 4 is SM-2's one-day step, the ease
      // untouched, and a correct answer at the 0.25 prior. `pL` is printed
      // unrounded, float noise and all, which is part of the shape too.
      expect(stamp(await json("review", "grade", "--concept", "alpha", "--grade", "4"))).toEqual({
        concept: "alpha",
        grade: 4,
        due: "<instant>",
        intervalDays: 1,
        ease: 2.5,
        lapses: 0,
        leech: false,
        pL: 0.6599999999999999,
      });
    });
  });
});
