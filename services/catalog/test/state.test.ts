import { KNOWLEDGE_LIMITS, PREFERENCE_KEYS } from "@self-learn/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../src/migrations";
import {
  appendEvent,
  clearRecap,
  dueReviews,
  emptyReviews,
  importLegacyState,
  readEvents,
  readLearnerSnapshot,
  readModel,
  readPreference,
  readProgress,
  readReviews,
  replayMastery,
  resetProgress,
  setNote,
  setProgress,
  StateError,
  upsertRecap,
  upsertReview,
  writeModel,
  writePreference,
  writeReviews,
  type ReviewCard,
} from "../src/state";
import { conceptsIndexer } from "../src/index/concepts";
import { writeSource } from "../src/index/writer";
import { readKnowledgeBase } from "../src/state/knowledge-base";
import { createScratchDatabase, probe, SQLSTATE, sqlstate, type Scratch } from "./scratch-database";
import { CONCEPTS, fixtureGraph, ITEMS, seedContent } from "./state-fixture";

const reachable = await probe();

const card = (overrides: Partial<ReviewCard> & { conceptId: string }): ReviewCard => ({
  repetitions: 1,
  ease: 2.5,
  intervalDays: 1,
  lapses: 0,
  due: "2026-09-01T00:00:00.000Z",
  lastReviewed: "2026-08-31T00:00:00.000Z",
  leech: false,
  history: [],
  ...overrides,
});

describe.skipIf(!reachable.ok)("learner state store", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    await seedContent(scratch.db);
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  /** Every test starts from an empty state half, and the content half stays. */
  beforeEach(async () => {
    await scratch.db.execute(
      // `event` cannot be deleted through SQL the trigger can see, so the
      // trigger comes off for the length of the truncate and goes straight
      // back on. This is the one place in the codebase that does that, and it
      // is a test fixture rather than anything the application can reach.
      "alter table event disable trigger event_no_update; " +
        "alter table event disable trigger event_no_delete; " +
        "truncate event, mastery, review, progress, recap, preference; " +
        "alter table event enable trigger event_no_update; " +
        "alter table event enable trigger event_no_delete;",
    );
  });

  describe("progress", () => {
    it("ticks, unticks, and leaves no empty row behind", async () => {
      await setProgress(scratch.db, ITEMS[0], true);
      expect(await readProgress(scratch.db)).toHaveLength(1);

      await setProgress(scratch.db, ITEMS[0], false);
      expect(await readProgress(scratch.db)).toHaveLength(0);
    });

    it("keeps a note when the tick comes off", async () => {
      await setProgress(scratch.db, ITEMS[0], true);
      await setNote(scratch.db, ITEMS[0], "still thinking");
      await setProgress(scratch.db, ITEMS[0], false);

      const rows = await readProgress(scratch.db);
      expect(rows).toEqual([
        { curriculumItemId: ITEMS[0], completedAt: null, note: "still thinking" },
      ]);
    });

    it("clears a note with an empty string", async () => {
      await setNote(scratch.db, ITEMS[0], "temporary");
      await setNote(scratch.db, ITEMS[0], "   ");
      expect(await readProgress(scratch.db)).toHaveLength(0);
    });

    it("names the id rather than the constraint", async () => {
      await expect(setProgress(scratch.db, "no-such-item", true)).rejects.toBeInstanceOf(
        StateError,
      );
      await expect(setProgress(scratch.db, "no-such-item", true)).rejects.toThrow(
        /no curriculum item in the catalog for "no-such-item"/,
      );
    });

    it("resets only what it is asked to, and never a recap", async () => {
      await setProgress(scratch.db, ITEMS[0], true);
      await setProgress(scratch.db, ITEMS[1], true);
      await upsertRecap(scratch.db, ITEMS[0], {
        summary: "kept",
        keyPoints: [],
        misconceptions: [],
        openQuestions: [],
        source: "manual",
      });

      expect(await resetProgress(scratch.db, [ITEMS[0]])).toBe(1);

      const snapshot = await readLearnerSnapshot(scratch.db);
      expect(snapshot.completed).toEqual({ [ITEMS[1]]: true });
      expect(snapshot.knowledge[ITEMS[0]]?.summary).toBe("kept");
    });
  });

  describe("recap", () => {
    const long = {
      summary: "x".repeat(5_000),
      keyPoints: Array.from({ length: 30 }, (_, i) => `point ${i}`),
      misconceptions: ["y".repeat(1_000)],
      openQuestions: [],
      source: "agent" as const,
    };

    it("clamps to KNOWLEDGE_LIMITS on the way in", async () => {
      const saved = await upsertRecap(scratch.db, ITEMS[0], long);
      expect(saved?.summary).toHaveLength(KNOWLEDGE_LIMITS.summaryChars);
      expect(saved?.keyPoints).toHaveLength(KNOWLEDGE_LIMITS.listItems);
      expect(saved?.misconceptions[0]).toHaveLength(KNOWLEDGE_LIMITS.itemChars);
    });

    it("counts sessions, and does not when told not to", async () => {
      const base = { ...long, summary: "short" };
      expect((await upsertRecap(scratch.db, ITEMS[0], base))?.sessions).toBe(1);
      expect((await upsertRecap(scratch.db, ITEMS[0], base))?.sessions).toBe(2);
      expect(
        (await upsertRecap(scratch.db, ITEMS[0], base, { countSession: false }))?.sessions,
      ).toBe(2);
    });

    it("treats an entirely empty input as a delete", async () => {
      await upsertRecap(scratch.db, ITEMS[0], { ...long, summary: "there" });
      const cleared = await upsertRecap(scratch.db, ITEMS[0], {
        summary: "   ",
        keyPoints: [],
        misconceptions: [],
        openQuestions: [],
        source: "manual",
      });
      expect(cleared).toBeNull();
      expect((await readLearnerSnapshot(scratch.db)).knowledge).toEqual({});
    });

    it("clears on request", async () => {
      await upsertRecap(scratch.db, ITEMS[0], { ...long, summary: "there" });
      await clearRecap(scratch.db, ITEMS[0]);
      expect((await readLearnerSnapshot(scratch.db)).knowledge).toEqual({});
    });
  });

  describe("preference", () => {
    it("round-trips a value, and refuses null rather than storing SQL NULL", async () => {
      expect(await readPreference(scratch.db, "something")).toBeUndefined();
      await writePreference(scratch.db, "something", { a: 1 });
      expect(await readPreference(scratch.db, "something")).toEqual({ a: 1 });
      await expect(writePreference(scratch.db, "nothing", null)).rejects.toBeInstanceOf(
        StateError,
      );
    });

    it("feeds the snapshot", async () => {
      await writePreference(scratch.db, PREFERENCE_KEYS.theme, "dark");
      await writePreference(scratch.db, PREFERENCE_KEYS.epoch, 4);
      await writePreference(scratch.db, PREFERENCE_KEYS.userResources, {
        "fx-m1": [{ id: "r1", title: "A paper", url: "https://example.com" }],
      });

      const snapshot = await readLearnerSnapshot(scratch.db);
      expect(snapshot.theme).toBe("dark");
      expect(snapshot.epoch).toBe(4);
      expect(snapshot.userResources["fx-m1"]).toHaveLength(1);
    });

    it("drops a malformed resource rather than rendering it", async () => {
      await writePreference(scratch.db, PREFERENCE_KEYS.userResources, {
        "fx-m1": [{ id: "r1", title: "no url" }, "junk"],
      });
      expect((await readLearnerSnapshot(scratch.db)).userResources).toEqual({});
    });
  });

  describe("event", () => {
    it("round-trips the flat record through the promoted columns", async () => {
      await appendEvent(scratch.db, {
        at: "2026-08-20T06:38:51.863Z",
        type: "observation",
        concept: "alpha",
        session: "s1",
        correct: true,
        grade: 3,
        propagated: [{ concept: "beta", hops: 1 }],
      });

      const [record] = await readEvents(scratch.db);
      expect(record).toMatchObject({
        at: "2026-08-20T06:38:51.863Z",
        type: "observation",
        concept: "alpha",
        session: "s1",
        correct: true,
        grade: 3,
        propagated: [{ concept: "beta", hops: 1 }],
      });
    });

    it("orders by instant then by insertion", async () => {
      const at = "2026-08-20T06:38:51.863Z";
      for (const slug of CONCEPTS) {
        await appendEvent(scratch.db, { at, type: "observation", concept: slug, correct: true });
      }
      expect((await readEvents(scratch.db)).map((e) => e.concept)).toEqual([...CONCEPTS]);
    });

    it("cannot be updated or deleted", async () => {
      await appendEvent(scratch.db, { type: "observation", concept: "alpha", correct: true });
      const update = await scratch.db
        .execute("update event set type = 'review'")
        .catch((error: unknown) => error);
      expect(sqlstate(update)).toBe(SQLSTATE.restrictViolation);
      const remove = await scratch.db.execute("delete from event").catch((e: unknown) => e);
      expect(sqlstate(remove)).toBe(SQLSTATE.restrictViolation);
    });

    it("refuses evidence about a concept the catalog does not have", async () => {
      await expect(
        appendEvent(scratch.db, { type: "observation", concept: "ghost", correct: true }),
      ).rejects.toThrow();
    });
  });

  describe("mastery", () => {
    it("replays the log, skipping voided sessions", async () => {
      const graph = fixtureGraph();
      const events = [
        { at: "2026-08-01T00:00:00.000Z", type: "observation" as const, concept: "alpha", correct: true, session: "good", opportunity: false },
        { at: "2026-08-01T00:01:00.000Z", type: "observation" as const, concept: "beta", correct: true, session: "bad", opportunity: false },
        { at: "2026-08-01T00:02:00.000Z", type: "void" as const, session: "bad", reason: "leading questions" },
      ];
      for (const record of events) await appendEvent(scratch.db, record);

      const { model, skipped } = replayMastery(
        await readEvents(scratch.db),
        graph,
        (await readModel(scratch.db)).params,
      );
      expect(skipped).toBe(1);
      expect(model.concepts.alpha?.observations).toBe(1);
      expect(model.concepts.beta).toBeUndefined();
    });

    it("writeModel deletes the rows a rebuild no longer produces", async () => {
      const graph = fixtureGraph();
      await appendEvent(scratch.db, {
        type: "observation",
        concept: "beta",
        correct: true,
        session: "bad",
        opportunity: false,
      });
      const params = (await readModel(scratch.db)).params;
      const first = replayMastery(await readEvents(scratch.db), graph, params);
      await writeModel(scratch.db, first.model);
      expect(Object.keys((await readModel(scratch.db)).concepts)).toContain("beta");

      await appendEvent(scratch.db, { type: "void", session: "bad", reason: "unreliable" });
      const second = replayMastery(await readEvents(scratch.db), graph, params);
      await writeModel(scratch.db, second.model);
      expect(await readModel(scratch.db)).toMatchObject({ concepts: {} });
    });

    it("propagates a correct answer to prerequisites once per concept", async () => {
      const graph = fixtureGraph();
      const { model } = replayMastery(
        [
          {
            at: "2026-08-01T00:00:00.000Z",
            type: "observation",
            concept: "gamma",
            correct: true,
            opportunity: false,
          },
        ],
        graph,
        (await readModel(scratch.db)).params,
      );
      // One hop and two hops, and neither counts as a question asked.
      expect(model.concepts.beta?.pL).toBeGreaterThan(model.concepts.alpha?.pL ?? 1);
      expect(model.concepts.beta?.observations).toBe(0);
    });

    it("names the slug rather than the constraint", async () => {
      await expect(
        writeModel(scratch.db, {
          params: { pL0: 0.25, pT: 0.15, pG: 0.2, pS: 0.1 },
          concepts: { ghost: { pL: 0.5, observations: 1, correct: 1, lastSeen: null } },
        }),
      ).rejects.toThrow(/no concept in the catalog for "ghost"/);
    });
  });

  describe("review", () => {
    it("upserts a card and finds it due", async () => {
      await upsertReview(scratch.db, card({ conceptId: "alpha" }));
      const due = await dueReviews(scratch.db, { now: new Date("2026-09-02T00:00:00.000Z") });
      expect(due.map((c) => c.conceptId)).toEqual(["alpha"]);
      expect(await dueReviews(scratch.db, { now: new Date("2026-08-01T00:00:00.000Z") })).toEqual(
        [],
      );
    });

    it("writeReviews drops the cards the document no longer has", async () => {
      await writeReviews(scratch.db, {
        cards: { alpha: card({ conceptId: "alpha" }), beta: card({ conceptId: "beta" }) },
      });
      expect(Object.keys((await readReviews(scratch.db)).cards)).toHaveLength(2);
      await writeReviews(scratch.db, emptyReviews());
      expect((await readReviews(scratch.db)).cards).toEqual({});
    });

    it("refuses a card that never went through the scheduler", async () => {
      await expect(
        upsertReview(scratch.db, card({ conceptId: "alpha", intervalDays: 0 })),
      ).rejects.toThrow(/must have been through the scheduler/);
    });
  });

  describe("pruning a studied concept", () => {
    it("refuses, and names the slug rather than the constraint", async () => {
      await appendEvent(scratch.db, { type: "observation", concept: "gamma", correct: true });
      await expect(
        writeSource(
          scratch.db,
          conceptsIndexer,
          // The indexer produced two of the three notes: `gamma` is gone from
          // the tree, which is exactly the case the append-only log refuses.
          {
            concept: CONCEPTS.filter((slug) => slug !== "gamma").map((slug) => ({
              slug,
              title: slug,
              path: `learn/concepts/fixtures/${slug}.md`,
            })),
          },
          [],
          "learn/concepts",
        ),
      ).rejects.toThrow(/the event log records answers about them: gamma/);

      // And nothing was half-applied: the transaction rolled back.
      const { rows } = await scratch.db.execute<{ n: number }>(
        "select count(*)::int as n from concept",
      );
      expect(rows[0]?.n).toBe(CONCEPTS.length);
    });
  });

  describe("knowledge base", () => {
    it("reads the graph, the mastery and the schedule as one view", async () => {
      await upsertReview(scratch.db, card({ conceptId: "alpha", lapses: 2, leech: true }));
      const kb = await readKnowledgeBase(scratch.db);

      expect(kb.concepts.map((c) => c.id).sort()).toEqual([...CONCEPTS].sort());
      expect(kb.concepts.find((c) => c.id === "alpha")?.leech).toBe(true);
      // Domain is read off the path, the way `store.mjs` always did it.
      expect(kb.concepts.find((c) => c.id === "alpha")?.domain).toBe("fixtures");
      expect(kb.stats.total).toBe(CONCEPTS.length);
      // Nothing is mastered, and only `alpha` has no unmet prerequisite.
      expect(kb.frontier).toEqual(["alpha"]);
    });
  });

  describe("importing a legacy localStorage document", () => {
    const payload = {
      theme: "dark",
      epoch: 7,
      completed: { [ITEMS[0]]: true, "gone-m9-t9": true },
      notes: { [ITEMS[0]]: "from the browser" },
      knowledge: {
        [ITEMS[1]]: {
          summary: "carried over",
          keyPoints: ["a"],
          misconceptions: [],
          openQuestions: [],
          source: "manual",
          sessions: 5,
        },
      },
      userResources: { "fx-m1": [{ id: "r1", title: "A paper", url: "https://example.com" }] },
      lastVisited: { courseSlug: "fx", moduleSlug: "m1", at: "2026-08-01T00:00:00.000Z" },
    };

    it("carries everything the catalog knows about", async () => {
      const result = await importLegacyState(scratch.db, payload);

      expect(result.progress).toBe(1);
      expect(result.notes).toBe(1);
      expect(result.recaps).toBe(1);
      expect(result.unknownItems).toEqual(["gone-m9-t9"]);

      const snapshot = await readLearnerSnapshot(scratch.db);
      expect(snapshot.completed).toEqual({ [ITEMS[0]]: true });
      expect(snapshot.notes[ITEMS[0]]).toBe("from the browser");
      expect(snapshot.theme).toBe("dark");
      expect(snapshot.epoch).toBe(7);
      expect(snapshot.lastVisited?.courseSlug).toBe("fx");
      // The browser's own session count survives, rather than restarting at 1.
      expect(snapshot.knowledge[ITEMS[1]]?.sessions).toBe(5);
    });

    it("never overwrites what the database already has", async () => {
      await setNote(scratch.db, ITEMS[0], "written here");
      await writePreference(scratch.db, PREFERENCE_KEYS.theme, "light");

      const result = await importLegacyState(scratch.db, payload);

      const snapshot = await readLearnerSnapshot(scratch.db);
      expect(snapshot.notes[ITEMS[0]]).toBe("written here");
      expect(snapshot.theme).toBe("light");
      expect(result.skippedExisting).toBeGreaterThan(0);
    });

    it("is safe to run twice", async () => {
      await importLegacyState(scratch.db, payload);
      const second = await importLegacyState(scratch.db, payload);
      expect(second.progress).toBe(0);
      expect(second.recaps).toBe(0);
      expect((await readLearnerSnapshot(scratch.db)).knowledge[ITEMS[1]]?.sessions).toBe(5);
    });

    it("ignores junk instead of refusing the document", async () => {
      const result = await importLegacyState(scratch.db, {
        completed: { [ITEMS[0]]: "yes" },
        notes: { [ITEMS[0]]: 42 },
        knowledge: { [ITEMS[1]]: "not an object" },
        theme: "chartreuse",
        epoch: -3,
      } as never);

      expect(result.progress).toBe(0);
      expect(result.notes).toBe(0);
      expect(result.recaps).toBe(0);
      expect((await readLearnerSnapshot(scratch.db)).theme).toBe("light");
    });
  });
});
