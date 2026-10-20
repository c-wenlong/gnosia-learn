import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { backfill } from "../src/commands/backfill";
import { readEvents, readReviews } from "../src/state";
import { LEARN_ROOT_ENV } from "../src/learn/paths";
import { clearTables, migratedScratchDatabase, probe, type Scratch } from "./scratch-database";
import { seedContent } from "./state-fixture";

/**
 * The backfill, against a fixture `state/` directory.
 *
 * The real move is verified by running the command against the real files and
 * reading its own assertion — that is the check that matters, and it is in the
 * pull request. What is left for a test is the behaviour that only shows up on
 * inputs the real files do not have: a mismatch, a second run, and a `history`
 * entry with no event behind it.
 *
 * The expected mastery is written down rather than computed, so this is a
 * check on the replay and not a restatement of it. Two correct probe answers
 * on `alpha`: 0.25 → 0.6 → 0.8709677419354838, with no transit step because a
 * probe measures rather than teaches.
 */

const reachable = await probe();

const AT_1 = "2026-08-01T10:00:00.000Z";
const AT_2 = "2026-08-01T10:05:00.000Z";
const P_L = 0.8709677419354838;

const EVENTS = [
  { at: AT_1, type: "observation", concept: "alpha", correct: true, source: "probe", opportunity: false, grade: 3 },
  { at: AT_2, type: "observation", concept: "alpha", correct: true, source: "probe", opportunity: false, grade: 4 },
];

const MODEL = {
  version: 1,
  params: { pL0: 0.25, pT: 0.15, pG: 0.2, pS: 0.1 },
  concepts: {
    alpha: { pL: P_L, observations: 2, correct: 2, lastSeen: AT_2 },
  },
  updatedAt: AT_2,
};

const REVIEWS = {
  version: 1,
  cards: {
    alpha: {
      conceptId: "alpha",
      repetitions: 2,
      ease: 2.6,
      intervalDays: 6,
      lapses: 0,
      due: "2026-08-07T10:05:00.000Z",
      lastReviewed: AT_2,
      leech: false,
      history: [
        { at: AT_1, grade: 3, intervalDays: 1 },
        { at: AT_2, grade: 4, intervalDays: 6 },
      ],
    },
  },
  updatedAt: AT_2,
};

describe.skipIf(!reachable.ok)("backfill", () => {
  let scratch: Scratch;
  let root: string;
  let stateDir: string;
  const previousRoot = process.env[LEARN_ROOT_ENV];

  async function writeState(model: unknown = MODEL, reviews: unknown = REVIEWS): Promise<void> {
    await writeFile(
      path.join(stateDir, "events.jsonl"),
      `${EVENTS.map((e) => JSON.stringify(e)).join("\n")}\n`,
      "utf8",
    );
    await writeFile(path.join(stateDir, "model.json"), JSON.stringify(model, null, 2), "utf8");
    await writeFile(path.join(stateDir, "reviews.json"), JSON.stringify(reviews, null, 2), "utf8");
  }

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await seedContent(scratch.db);

    root = await mkdtemp(path.join(tmpdir(), "backfill-"));
    stateDir = path.join(root, "learn", "state");
    await mkdir(stateDir, { recursive: true });
    await mkdir(path.join(root, "learn", "concepts", "fixtures"), { recursive: true });
    // The propagation graph comes from the notes, so the fixture needs them.
    // `alpha` has no prerequisites, which keeps the expected model to one row.
    await writeFile(
      path.join(root, "learn", "concepts", "fixtures", "alpha.md"),
      "---\nid: alpha\ntitle: Alpha\n---\n\n# Alpha\n",
      "utf8",
    );
    process.env[LEARN_ROOT_ENV] = root;
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
    if (root !== undefined) await rm(root, { recursive: true, force: true });
    if (previousRoot === undefined) delete process.env[LEARN_ROOT_ENV];
    else process.env[LEARN_ROOT_ENV] = previousRoot;
  });

  beforeEach(async () => {
    await clearTables(scratch.db, ["event", "mastery", "review", "progress", "recap", "preference"]);
  });

  afterEach(async () => {
    await writeState();
  });

  it("moves the log, the model and the schedule, and verifies them", async () => {
    await writeState();
    const result = await backfill(scratch.db, stateDir);

    expect(result.ok).toBe(true);
    expect(result.diffs).toEqual([]);
    expect(result.events).toMatchObject({ inFile: 2, inserted: 2, alreadyPresent: 0 });
    // Both history entries are already observations in the log, so nothing is
    // synthesised. Writing one per entry regardless would double the evidence
    // and the mastery assertion below would be the thing that caught it.
    expect(result.events.synthesised).toBe(0);
    expect(result.mastery).toMatchObject({ rebuilt: 1, inFile: 1 });
    expect(result.reviews).toEqual({ loaded: 1, inFile: 1 });

    const cards = (await readReviews(scratch.db)).cards;
    expect(cards.alpha).toMatchObject({ repetitions: 2, ease: 2.6, intervalDays: 6 });
    // `history` is not a column: every entry is an event, and a second copy
    // would be a second version of the truth.
    expect(cards.alpha?.history).toEqual([]);
  });

  it("is idempotent, and cannot double the evidence", async () => {
    await writeState();
    await backfill(scratch.db, stateDir);
    const second = await backfill(scratch.db, stateDir);

    expect(second.ok).toBe(true);
    expect(second.events).toMatchObject({ inserted: 0, alreadyPresent: 2 });
    expect(await readEvents(scratch.db)).toHaveLength(2);
  });

  it("fails, names the concept, and says what differs", async () => {
    await writeState({
      ...MODEL,
      concepts: { alpha: { pL: 0.5, observations: 9, correct: 2, lastSeen: AT_2 } },
    });
    const result = await backfill(scratch.db, stateDir);

    expect(result.ok).toBe(false);
    expect(result.diffs).toEqual([
      { concept: "alpha", field: "pL", rebuilt: String(P_L), file: "0.5" },
      { concept: "alpha", field: "observations", rebuilt: "2", file: "9" },
    ]);
  });

  it("synthesises a review event for a history entry no event explains", async () => {
    await writeState(MODEL, {
      ...REVIEWS,
      cards: {
        alpha: {
          ...REVIEWS.cards.alpha,
          history: [
            ...REVIEWS.cards.alpha.history,
            { at: "2026-08-02T10:00:00.000Z", grade: 5, intervalDays: 15 },
          ],
        },
      },
    });
    const result = await backfill(scratch.db, stateDir);

    expect(result.events.synthesised).toBe(1);
    const synthesised = (await readEvents(scratch.db)).filter((e) => e.type === "review");
    expect(synthesised).toHaveLength(1);
    expect(synthesised[0]).toMatchObject({
      concept: "alpha",
      grade: 5,
      backfilled: "reviews.json history",
    });
    // And the model no longer matches the file, correctly: the synthesised
    // grade is real evidence that model.json was written without.
    expect(result.ok).toBe(false);
    expect(result.diffs.map((d) => d.field)).toContain("observations");
  });

  it("counts the tolerated clock drift rather than failing on it", async () => {
    await writeState({
      ...MODEL,
      concepts: {
        alpha: { pL: P_L, observations: 2, correct: 2, lastSeen: "2026-08-01T10:04:59.997Z" },
      },
    });
    const result = await backfill(scratch.db, stateDir);

    expect(result.ok).toBe(true);
    expect(result.clockDrift).toEqual([{ concept: "alpha", ms: 3 }]);
  });

  it("fails on a lastSeen that is genuinely a different day", async () => {
    await writeState({
      ...MODEL,
      concepts: {
        alpha: { pL: P_L, observations: 2, correct: 2, lastSeen: "2026-07-01T10:00:00.000Z" },
      },
    });
    const result = await backfill(scratch.db, stateDir);

    expect(result.ok).toBe(false);
    expect(result.diffs.map((d) => d.field)).toEqual(["lastSeen"]);
  });
});
