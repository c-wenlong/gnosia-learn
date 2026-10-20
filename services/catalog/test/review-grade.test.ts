import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { newCard, review as sm2 } from "../../../scripts/learn/lib/schedule.mjs";
import {
  gradeForRating,
  gradeReview,
  previewIntervals,
  ratingForGrade,
  readEvents,
  readModel,
  readReviews,
  REVIEW_RATINGS,
  reviewQueue,
  scheduleCard,
  StateError,
  upsertReview,
  type ReviewCard,
} from "../src/state";
import { replayReviews } from "../src/learn/replay";
import { clearTables, migratedScratchDatabase, probe, type Scratch } from "./scratch-database";
import { seedContent } from "./state-fixture";

/**
 * The review grade, moved out of the `learn` CLI into `state/review.ts` so the
 * web app's rating buttons record a grade with the same code the terminal does.
 *
 * The CLI's own `--json` shape is pinned in `learn-cli.test.ts`; this file pins
 * the pieces the web app adds on top: the rating-to-grade mapping, the interval
 * each button previews (which must be the interval pressing it writes), and the
 * queue a review session works through.
 */

const NOW = new Date("2026-09-26T08:00:00.000Z");

const card = (overrides: Partial<ReviewCard> & { conceptId: string }): ReviewCard => ({
  repetitions: 2,
  ease: 2.5,
  intervalDays: 6,
  lapses: 0,
  due: "2026-09-25T00:00:00.000Z",
  lastReviewed: "2026-09-19T00:00:00.000Z",
  leech: false,
  history: [],
  ...overrides,
});

describe("the rating mapping", () => {
  it("maps Again, Hard, Good and Easy onto SM-2's 1, 3, 4 and 5", () => {
    expect(REVIEW_RATINGS.map((r) => [r.name, r.grade])).toEqual([
      ["again", 1],
      ["hard", 3],
      ["good", 4],
      ["easy", 5],
    ]);
    expect([0, 1, 2, 3].map(gradeForRating)).toEqual([1, 3, 4, 5]);
  });

  it("fails Again and passes the other three, which is what BKT and SM-2 key on", () => {
    // PASS_GRADE is 3: Hard is the lowest passing grade, not a failure.
    expect(REVIEW_RATINGS.map((r) => r.grade >= 3)).toEqual([false, true, true, true]);
  });

  it("reads any recorded grade back as a rating, the CLI's 0 and 2 included", () => {
    expect([0, 1, 2, 3, 4, 5].map(ratingForGrade)).toEqual([0, 0, 0, 1, 2, 3]);
  });

  it.each([-1, 4, 1.5, Number.NaN])("refuses rating %s as a StateError", (rating) => {
    expect(() => gradeForRating(rating)).toThrow(StateError);
  });
});

describe("scheduleCard", () => {
  it("is schedule.mjs's review, unchanged", () => {
    const existing = card({ conceptId: "alpha" });
    for (const grade of [0, 1, 2, 3, 4, 5]) {
      expect(scheduleCard(existing, "alpha", grade, NOW)).toEqual(sm2(existing, grade, { now: NOW }));
    }
  });

  it("grades a concept with no card as a fresh one made at now, as review grade always did", () => {
    expect(scheduleCard(null, "alpha", 4, NOW)).toEqual(sm2(newCard("alpha", NOW), 4, { now: NOW }));
    expect(scheduleCard(undefined, "alpha", 4, NOW).intervalDays).toBe(1);
  });
});

describe("previewIntervals", () => {
  it("is the interval each rating would write, fuzz included", () => {
    const existing = card({ conceptId: "alpha", repetitions: 4, intervalDays: 20, ease: 2.36 });
    const preview = previewIntervals(existing, "alpha", NOW);
    REVIEW_RATINGS.forEach(({ rating, grade }) => {
      expect(preview[rating]).toBe(scheduleCard(existing, "alpha", grade, NOW).intervalDays);
    });
    // Again restarts the sequence. The passing three are not asserted to be
    // in order: schedule.mjs fuzzes an interval of a week or more by up to 5%
    // either way, keyed on the interval itself, so Hard can land a day past
    // Good. The preview shows what a grade writes, fuzz and all.
    expect(preview[0]).toBe(1);
  });

  it("gives a new card SM-2's first step on every passing grade", () => {
    expect(previewIntervals(null, "alpha", NOW)).toEqual([1, 1, 1, 1]);
  });
});

const reachable = await probe();

describe.skipIf(!reachable.ok)("gradeReview and reviewQueue", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await seedContent(scratch.db);
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  beforeEach(async () => {
    await clearTables(scratch.db, ["event", "mastery", "review"]);
  });

  it("appends the review event, upserts the card and moves p(L), on one clock", async () => {
    await upsertReview(scratch.db, card({ conceptId: "alpha" }));
    const result = await gradeReview(scratch.db, { conceptId: "alpha", grade: 4, now: NOW });

    const expected = scheduleCard(card({ conceptId: "alpha" }), "alpha", 4, NOW);
    expect(result.card).toEqual(expected);
    expect(result.pLBefore).toBe(0.25);
    expect(result.pL).toBeGreaterThan(0.25);

    const events = await readEvents(scratch.db);
    expect(events).toEqual([
      {
        at: NOW.toISOString(),
        type: "review",
        concept: "alpha",
        grade: 4,
        pLBefore: 0.25,
        pLAfter: result.pL,
      },
    ]);

    const stored = (await readReviews(scratch.db)).cards.alpha;
    expect(stored).toEqual({ ...expected, history: [] });
    const entry = (await readModel(scratch.db)).concepts.alpha;
    expect(entry?.pL).toBe(result.pL);
    expect(entry?.observations).toBe(1);
    expect(entry?.correct).toBe(1);
    expect(entry?.lastSeen).toBe(NOW.toISOString());
  });

  it("counts Again as a lapse and a wrong answer", async () => {
    await upsertReview(scratch.db, card({ conceptId: "alpha" }));
    const { card: next, pL, pLBefore } = await gradeReview(scratch.db, {
      conceptId: "alpha",
      grade: gradeForRating(0),
      now: NOW,
    });
    expect(next.repetitions).toBe(0);
    expect(next.lapses).toBe(1);
    expect(next.intervalDays).toBe(1);
    expect(pL).toBeLessThan(pLBefore);
    expect((await readModel(scratch.db)).concepts.alpha?.correct).toBe(0);
  });

  it("writes a grade review rebuild reproduces exactly", async () => {
    await gradeReview(scratch.db, { conceptId: "beta", grade: 5, now: NOW });
    await gradeReview(scratch.db, {
      conceptId: "beta",
      grade: 3,
      now: new Date(NOW.getTime() + 86_400_000),
    });
    const { reviews } = replayReviews(await readEvents(scratch.db));
    expect(reviews.cards.beta).toEqual({
      ...(await readReviews(scratch.db)).cards.beta,
      history: reviews.cards.beta?.history,
    });
  });

  it("records a request id once: a retry answers with the first write", async () => {
    const first = await gradeReview(scratch.db, { conceptId: "alpha", grade: 4, now: NOW, requestId: "r-1" });
    expect(first.replayed).toBe(false);
    // The retry even names a different grade: what was saved stands.
    const again = await gradeReview(scratch.db, {
      conceptId: "alpha",
      grade: 5,
      now: new Date(NOW.getTime() + 5_000),
      requestId: "r-1",
    });
    expect(again).toEqual({ ...first, card: { ...first.card, history: [] }, replayed: true });

    const events = await readEvents(scratch.db);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ grade: 4, requestId: "r-1" });
    expect((await readModel(scratch.db)).concepts.alpha?.observations).toBe(1);

    // A new id is a new answer.
    expect((await gradeReview(scratch.db, { conceptId: "alpha", grade: 4, requestId: "r-2" })).replayed).toBe(false);
    expect(await readEvents(scratch.db)).toHaveLength(2);
  });

  it("refuses an unknown concept and an out-of-range grade before writing anything", async () => {
    await expect(gradeReview(scratch.db, { conceptId: "nope", grade: 4 })).rejects.toThrow(StateError);
    await expect(gradeReview(scratch.db, { conceptId: "alpha", grade: 6 })).rejects.toThrow(StateError);
    expect(await readEvents(scratch.db)).toEqual([]);
  });

  describe("reviewQueue", () => {
    beforeEach(async () => {
      await upsertReview(scratch.db, card({ conceptId: "beta", due: "2026-09-20T00:00:00.000Z" }));
      await upsertReview(scratch.db, card({ conceptId: "alpha", due: "2026-09-24T00:00:00.000Z" }));
      await upsertReview(scratch.db, card({ conceptId: "gamma", due: "2026-10-03T00:00:00.000Z" }));
    });

    it("lists what is due, most overdue first, with titles and the four intervals", async () => {
      const queue = await reviewQueue(scratch.db, { now: NOW });
      expect(queue.items.map((i) => i.conceptId)).toEqual(["beta", "alpha"]);
      expect(queue.items[0]).toMatchObject({ title: "Beta", domain: "fixtures", summary: "" });
      expect(queue.items[0]?.intervals).toEqual(previewIntervals(queue.items[0]?.card, "beta", NOW));
      expect(queue.nextDue).toBe("2026-10-03T00:00:00.000Z");
    });

    it("puts a focused concept first, due or not", async () => {
      expect((await reviewQueue(scratch.db, { now: NOW, focus: "alpha" })).items.map((i) => i.conceptId)).toEqual([
        "alpha",
        "beta",
      ]);
      const early = await reviewQueue(scratch.db, { now: NOW, focus: "gamma" });
      expect(early.items.map((i) => i.conceptId)).toEqual(["gamma", "beta", "alpha"]);
      expect(early.items[0]?.card?.due).toBe("2026-10-03T00:00:00.000Z");
    });

    it("gives a never-scheduled focus a null card, and drops a focus the catalog lacks", async () => {
      await scratch.db.execute("delete from review");
      const fresh = await reviewQueue(scratch.db, { now: NOW, focus: "gamma" });
      expect(fresh.items).toHaveLength(1);
      expect(fresh.items[0]).toMatchObject({ conceptId: "gamma", card: null, intervals: [1, 1, 1, 1] });
      expect(fresh.nextDue).toBeNull();

      expect((await reviewQueue(scratch.db, { now: NOW, focus: "nope" })).items).toEqual([]);
    });
  });
});
