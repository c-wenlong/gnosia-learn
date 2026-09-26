import { KNOWLEDGE_LIMITS, PREFERENCE_KEYS } from "@self-learn/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../src/migrations";
import {
  appendEvent,
  assetCounts,
  assetsByIds,
  assetsForCollection,
  assetsForConcept,
  assetsForTopic,
  clearRecap,
  conceptsForAsset,
  conceptsForAssets,
  derivationSources,
  dueReviews,
  emptyReviews,
  importLegacyState,
  listAssets,
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
  topicTitles,
  upsertRecap,
  upsertReview,
  writeModel,
  writePreference,
  writeReviews,
  type ReviewCard,
} from "../src/state";
import { conceptsIndexer } from "../src/index/concepts";
import { replayReviews } from "../src/learn/replay";
import { writeSource } from "../src/index/writer";
import { readKnowledgeBase } from "../src/state/knowledge-base";
import { createScratchDatabase, probe, SQLSTATE, sqlstate, type Scratch } from "./scratch-database";
import {
  ASSETS,
  CONCEPTS,
  DECK_ID,
  fixtureGraph,
  ITEMS,
  OTHER_TOPIC_SLUG,
  seedAssets,
  seedContent,
  TOPIC_SLUG,
} from "./state-fixture";

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

    it("reads every theme mode back, and falls back to light for one it does not know", async () => {
      for (const mode of ["gnosia-dark", "gnosia-system", "gnosia", "system"] as const) {
        await writePreference(scratch.db, PREFERENCE_KEYS.theme, mode);
        expect((await readLearnerSnapshot(scratch.db)).theme).toBe(mode);
      }
      // A row written by some later build, or by hand, renders light rather
      // than handing the root layout a class it has no palette for.
      await writePreference(scratch.db, PREFERENCE_KEYS.theme, "gnosia-sepia");
      expect((await readLearnerSnapshot(scratch.db)).theme).toBe("light");
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

    it("accepts a watched event, which names an asset and no concept", async () => {
      await appendEvent(scratch.db, {
        at: "2026-09-26T08:00:00.000Z",
        type: "watched",
        asset: "fx:video",
        kind: "video",
      });
      const [record] = await readEvents(scratch.db);
      expect(record).toEqual({
        at: "2026-09-26T08:00:00.000Z",
        type: "watched",
        asset: "fx:video",
        kind: "video",
      });
    });

    it("still refuses a type the log does not know", async () => {
      await expect(
        appendEvent(scratch.db, { type: "skimmed" as never, asset: "fx:video" }),
      ).rejects.toThrow(/unknown event type "skimmed"/);
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

    it("replays past a watched event without counting it as evidence", async () => {
      await appendEvent(scratch.db, {
        at: "2026-08-01T00:00:00.000Z",
        type: "observation",
        concept: "alpha",
        correct: true,
        opportunity: false,
      });
      await appendEvent(scratch.db, {
        at: "2026-08-01T00:05:00.000Z",
        type: "watched",
        asset: "fx:video",
        kind: "video",
      });
      const events = await readEvents(scratch.db);
      expect(events.map((e) => e.type)).toEqual(["observation", "watched"]);
      const { model, skipped } = replayMastery(
        events,
        fixtureGraph(),
        (await readModel(scratch.db)).params,
      );
      expect(skipped).toBe(0);
      expect(model.concepts.alpha?.observations).toBe(1);
      expect(Object.keys(model.concepts).sort()).toEqual(["alpha"]);
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

  /**
   * The asset queries. They read the content half rather than the state half,
   * and they are here because `src/state/` is the door the web app comes
   * through: a page that cannot run these cannot show a video or a diagram at
   * all, which is the gap this suite is guarding against reopening.
   */
  describe("assets", () => {
    beforeAll(async () => {
      await seedAssets(scratch.db);
    });

    it("finds everything about a topic, ordered by kind then id", async () => {
      const rows = await assetsForTopic(scratch.db, TOPIC_SLUG);
      expect(rows.map((r) => r.id)).toEqual([
        ASSETS.diagram,
        ASSETS.link,
        ASSETS.transcript,
        ASSETS.video,
      ]);
      // The whole row, so a page has the path, the title and the size without
      // a second query. `bytes` comes back as a number, not a bigint string.
      expect(rows.find((r) => r.id === ASSETS.video)).toEqual({
        id: ASSETS.video,
        kind: "video",
        path: "out/fixtures/alpha/alpha.mp4",
        url: null,
        bytes: 1024,
        title: "Alpha, animated",
        sourceRepo: "manimkc",
      });
    });

    it("finds the narrower set about a concept", async () => {
      expect((await assetsForConcept(scratch.db, "alpha")).map((r) => r.id)).toEqual([
        ASSETS.diagram,
        ASSETS.video,
      ]);
      expect((await assetsForConcept(scratch.db, "beta")).map((r) => r.id)).toEqual([
        ASSETS.diagram,
      ]);
    });

    /**
     * A module's members are all topic-backed, because that is the only shape
     * `src/index/courses.ts` writes. Resolving only `collection_item.asset_id`
     * returns nothing at all here, which is what it did for every collection in
     * the catalog until this was fixed.
     */
    it("resolves a module through the topic it contains", async () => {
      const rows = await assetsForCollection(scratch.db, "fx-m1");
      expect(rows.map((r) => r.id)).toEqual([
        ASSETS.diagram,
        ASSETS.link,
        ASSETS.transcript,
        ASSETS.video,
      ]);
      // A link has a url and no path. Both columns come back so the caller
      // never has to guess which one is set.
      const link = rows.find((r) => r.id === ASSETS.link);
      expect(link?.url).toBe("https://example.invalid/alpha");
      expect(link?.path).toBeNull();
    });

    it("orders the merge the way Postgres would, not the way the locale would", async () => {
      /**
       * The other queries sort in `ORDER BY`. This one merges three selects, so
       * its ordering is TypeScript and has to agree with them. `localeCompare`
       * does not: it is locale-sensitive, so the answer depends on the host's
       * ICU data, and on these ids it is simply wrong. `select ... order by`
       * against the fixture database returns `fx:Beta` before `fx:alpha`;
       * `localeCompare` returns the reverse.
       */
      const notes = (await assetsForCollection(scratch.db, DECK_ID))
        .filter((r) => r.kind === "note")
        .map((r) => r.id);
      expect(notes).toEqual([ASSETS.upperCase, ASSETS.lowerCase, ASSETS.pinned]);
      expect(notes).not.toEqual([...notes].sort((a, b) => a.localeCompare(b)));
    });

    it("resolves concept members and asset members too, and dedupes", async () => {
      const rows = await assetsForCollection(scratch.db, DECK_ID);
      // `alpha` brings the video and the diagram, `beta` brings the diagram
      // again, and the deck names the pinned note directly. The diagram appears
      // once: two members sharing an asset is one asset, not two.
      expect(rows.map((r) => r.id)).toEqual([
        ASSETS.diagram,
        ASSETS.upperCase,
        ASSETS.lowerCase,
        ASSETS.pinned,
        ASSETS.video,
      ]);
      expect(rows.filter((r) => r.id === ASSETS.diagram)).toHaveLength(1);
    });

    it("finds the concepts an asset explains, the reverse of assetsForConcept", async () => {
      expect(await conceptsForAsset(scratch.db, ASSETS.diagram)).toEqual(["alpha", "beta"]);
      expect(await conceptsForAsset(scratch.db, ASSETS.video)).toEqual(["alpha"]);
      // Filed under a topic and explaining nothing is the normal case for a
      // link, and the answer is an empty list, not a throw.
      expect(await conceptsForAsset(scratch.db, ASSETS.link)).toEqual([]);
      expect(await conceptsForAsset(scratch.db, "fx:gone")).toEqual([]);
    });

    it("answers for many assets in one call, leaving out the ones with no concept", async () => {
      const out = await conceptsForAssets(scratch.db, [
        ASSETS.video,
        ASSETS.diagram,
        ASSETS.link,
        ASSETS.video,
      ]);
      expect(out).toEqual({ [ASSETS.video]: ["alpha"], [ASSETS.diagram]: ["alpha", "beta"] });
      expect(await conceptsForAssets(scratch.db, [])).toEqual({});
    });

    it("agrees with assetsForConcept in the other direction", async () => {
      const all = await listAssets(scratch.db);
      const forward = await conceptsForAssets(
        scratch.db,
        all.map((a) => a.id),
      );
      for (const slug of ["alpha", "beta", "gamma"]) {
        const reverse = (await assetsForConcept(scratch.db, slug)).map((a) => a.id).sort();
        const derived = Object.entries(forward)
          .filter(([, slugs]) => slugs.includes(slug))
          .map(([id]) => id)
          .sort();
        expect(derived).toEqual(reverse);
      }
    });

    it("reads derivation upward for many assets at once", async () => {
      expect(
        await derivationSources(scratch.db, [ASSETS.transcript, ASSETS.video, ASSETS.link]),
      ).toEqual({ [ASSETS.transcript]: [ASSETS.video] });
      expect(await derivationSources(scratch.db, [])).toEqual({});
    });

    it("returns an empty list rather than throwing for something with no assets", async () => {
      expect(await assetsForTopic(scratch.db, "no-such-topic")).toEqual([]);
      expect(await assetsForConcept(scratch.db, "gamma")).toEqual([]);
      // The course holds the module, and membership is not transitive: `fx` has
      // no `collection_item` rows of its own.
      expect(await assetsForCollection(scratch.db, "fx")).toEqual([]);
    });

    it("never reaches an asset nothing points at", async () => {
      const reachable = [
        ...(await assetsForTopic(scratch.db, TOPIC_SLUG)),
        ...(await assetsForConcept(scratch.db, "alpha")),
        ...(await assetsForCollection(scratch.db, "fx-m1")),
        ...(await assetsForCollection(scratch.db, DECK_ID)),
      ].map((r) => r.id);
      expect(reachable).not.toContain(ASSETS.orphan);
    });

    it("looks assets up by id, and asks nothing for an empty list", async () => {
      expect((await assetsByIds(scratch.db, [ASSETS.video, ASSETS.link])).map((r) => r.id)).toEqual(
        [ASSETS.link, ASSETS.video],
      );
      expect(await assetsByIds(scratch.db, [])).toEqual([]);
      // An id the catalog does not have is absent, not an error: the caller
      // asked what exists, and the answer is that this one does not.
      expect(await assetsByIds(scratch.db, ["fx:gone"])).toEqual([]);
    });

    /**
     * `listAssets` is the library page's query: everything, filtered and
     * paged, rather than "about this one topic". The fixture's eight assets
     * sort `diagram_svg, link, note x4, transcript, video` by kind, and the
     * four notes sort `fx:Beta, fx:alpha, fx:orphan, fx:pinned` by code unit —
     * the same order `assetsForCollection`'s ordering test already proves
     * `ORDER BY` produces and `localeCompare` does not.
     */
    describe("listAssets", () => {
      it("returns everything when no option is given, in kind-then-id order", async () => {
        const rows = await listAssets(scratch.db);
        expect(rows.map((r) => r.id)).toEqual([
          ASSETS.diagram,
          ASSETS.link,
          ASSETS.upperCase,
          ASSETS.lowerCase,
          ASSETS.orphan,
          ASSETS.pinned,
          ASSETS.transcript,
          ASSETS.video,
        ]);
      });

      it("attaches topic slugs without a query per row", async () => {
        const rows = await listAssets(scratch.db);
        const byId = new Map(rows.map((r) => [r.id, r.topics]));
        // Everything asset_topic names comes back with it.
        expect(byId.get(ASSETS.video)).toEqual([TOPIC_SLUG]);
        expect(byId.get(ASSETS.diagram)).toEqual([TOPIC_SLUG]);
        expect(byId.get(ASSETS.link)).toEqual([TOPIC_SLUG]);
        expect(byId.get(ASSETS.transcript)).toEqual([TOPIC_SLUG]);
        // Filed nowhere is an empty list, not a missing key or a null. The SQL
        // is `coalesce(array_agg(...), '{}')` precisely so this is `[]` rather
        // than the `null` an unfiltered `array_agg` over zero rows would send.
        expect(byId.get(ASSETS.orphan)).toEqual([]);
        expect(Array.isArray(byId.get(ASSETS.orphan))).toBe(true);
        expect(byId.get(ASSETS.pinned)).toEqual([]);
      });

      it("says when each row entered the catalog, as an ISO instant", async () => {
        const rows = await listAssets(scratch.db);
        for (const row of rows) {
          expect(typeof row.createdAt).toBe("string");
          expect(new Date(row.createdAt).toISOString()).toBe(row.createdAt);
        }
      });

      it("filters by kind", async () => {
        const rows = await listAssets(scratch.db, { kind: "note" });
        expect(rows.map((r) => r.id)).toEqual([
          ASSETS.upperCase,
          ASSETS.lowerCase,
          ASSETS.orphan,
          ASSETS.pinned,
        ]);
      });

      it("filters by topic slug, to the asset_topic membership rather than a join that would duplicate rows", async () => {
        const rows = await listAssets(scratch.db, { topicSlug: TOPIC_SLUG });
        expect(rows.map((r) => r.id)).toEqual([
          ASSETS.diagram,
          ASSETS.link,
          ASSETS.transcript,
          ASSETS.video,
        ]);
        // A note in no asset_topic row is excluded, not returned with an empty list.
        expect(rows.map((r) => r.id)).not.toContain(ASSETS.orphan);
      });

      it("filters by source repo", async () => {
        const rows = await listAssets(scratch.db, { sourceRepo: "tldrawkc" });
        expect(rows.map((r) => r.id)).toEqual([ASSETS.diagram]);
      });

      it("combines filters with AND", async () => {
        const rows = await listAssets(scratch.db, { kind: "link", topicSlug: TOPIC_SLUG });
        expect(rows.map((r) => r.id)).toEqual([ASSETS.link]);
        expect(await listAssets(scratch.db, { kind: "video", topicSlug: "no-such-topic" })).toEqual(
          [],
        );
      });

      it("pages with limit and offset, over the same order as the unpaged call", async () => {
        const first = await listAssets(scratch.db, { limit: 2 });
        expect(first.map((r) => r.id)).toEqual([ASSETS.diagram, ASSETS.link]);
        const second = await listAssets(scratch.db, { limit: 2, offset: 2 });
        expect(second.map((r) => r.id)).toEqual([ASSETS.upperCase, ASSETS.lowerCase]);
      });

      it("returns an empty list for a filter that matches nothing, rather than throwing", async () => {
        expect(await listAssets(scratch.db, { kind: "no-such-kind" })).toEqual([]);
      });

      it("selects exactly the named ids, with their topics attached", async () => {
        // The detail page's lookup. `assetsByIds` answers the same question
        // without the topics, which is why this option exists: a page needing
        // both had to page through the whole catalog looking for one row, and
        // answered 404 for anything past the end of that page.
        const rows = await listAssets(scratch.db, { ids: [ASSETS.video, ASSETS.orphan] });
        expect(rows.map((r) => r.id).sort()).toEqual([ASSETS.orphan, ASSETS.video].sort());
        expect(rows.find((r) => r.id === ASSETS.video)?.topics).toEqual([TOPIC_SLUG]);
        expect(rows.find((r) => r.id === ASSETS.orphan)?.topics).toEqual([]);
      });

      it("asks for nothing when given no ids, rather than widening to everything", async () => {
        expect(await listAssets(scratch.db, { ids: [] })).toEqual([]);
      });

      it("returns nothing for an id no row has", async () => {
        expect(await listAssets(scratch.db, { ids: ["nope:not-a-row"] })).toEqual([]);
      });

      it("ANDs ids with the other filters", async () => {
        expect(
          await listAssets(scratch.db, { ids: [ASSETS.video], kind: "note" }),
        ).toEqual([]);
      });
    });

    /**
     * `assetCounts` backs a filter chip. One grouped scan, not one query per
     * kind, the same shape `mirrorCoverage` in `../commands/status.ts` already
     * uses for the same reason.
     */
    describe("assetCounts", () => {
      it("counts every kind the fixture has, and nothing it does not", async () => {
        const counts = new Map((await assetCounts(scratch.db)).map((r) => [r.kind, r.count]));
        expect(counts.get("video")).toBe(1);
        expect(counts.get("diagram_svg")).toBe(1);
        expect(counts.get("transcript")).toBe(1);
        expect(counts.get("link")).toBe(1);
        expect(counts.get("note")).toBe(4);
        // No chapters or captions in the fixture, so no chip should claim any.
        expect(counts.has("chapters")).toBe(false);
        expect(counts.has("captions")).toBe(false);
      });

      it("orders by kind, stably", async () => {
        const kinds = (await assetCounts(scratch.db)).map((r) => r.kind);
        expect(kinds).toEqual([...kinds].sort());
      });
    });
  });

  /**
   * `topicTitles` is the library grid's chip lookup: a card's `topics` is a
   * list of slugs, and this turns a page of them into titles in one round
   * trip rather than one query per chip.
   */
  describe("topicTitles", () => {
    it("resolves every slug it is given, keyed by slug", async () => {
      expect(await topicTitles(scratch.db, [TOPIC_SLUG, OTHER_TOPIC_SLUG])).toEqual({
        [TOPIC_SLUG]: "Fixture topic",
        [OTHER_TOPIC_SLUG]: "Second fixture topic",
      });
    });

    it("omits a slug with no topic row rather than erroring", async () => {
      // A chip falls back to the raw slug with `titles[slug] ?? slug`, so the
      // miss has to be a missing key rather than `null` or a thrown error.
      const titles = await topicTitles(scratch.db, [TOPIC_SLUG, "no-such-topic"]);
      expect(titles).toEqual({ [TOPIC_SLUG]: "Fixture topic" });
      expect(Object.prototype.hasOwnProperty.call(titles, "no-such-topic")).toBe(false);
    });

    it("asks for nothing when given no slugs, rather than issuing where slug in ()", async () => {
      expect(await topicTitles(scratch.db, [])).toEqual({});
    });

    it("returns an empty result when nothing given resolves", async () => {
      expect(await topicTitles(scratch.db, ["no-such-topic", "also-not-a-topic"])).toEqual({});
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

    it("carries a theme mode newer than the localStorage document", async () => {
      await importLegacyState(scratch.db, { theme: "gnosia-dark" });
      expect((await readLearnerSnapshot(scratch.db)).theme).toBe("gnosia-dark");
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

/**
 * `watched` is study, not evidence. Both replays are pure, so this needs no
 * database: whatever else is in the log, a watched event moves no p(L) and
 * schedules no card, and a rebuild from a log full of them is the same rebuild
 * as one without.
 */
describe("replaying a log with watched events in it", () => {
  const evidence = [
    {
      at: "2026-08-01T00:00:00.000Z",
      type: "observation" as const,
      concept: "alpha",
      correct: true,
      grade: 4,
      opportunity: false,
    },
    { at: "2026-08-02T00:00:00.000Z", type: "review" as const, concept: "beta", grade: 3 },
  ];
  const watched = [
    { at: "2026-08-01T12:00:00.000Z", type: "watched" as const, asset: "fx:video", kind: "video" },
    // A watched event that happens to name a concept is still not evidence.
    {
      at: "2026-08-03T00:00:00.000Z",
      type: "watched" as const,
      asset: "fx:diagram",
      kind: "diagram_svg",
      concept: "gamma",
      correct: true,
      grade: 5,
    },
  ];
  const mixed = [...evidence, ...watched].sort((a, b) => (a.at < b.at ? -1 : 1));
  const params = { pL0: 0.25, pT: 0.15, pG: 0.2, pS: 0.1 };

  it("leaves the mastery model as if they were not there", () => {
    const with_ = replayMastery(mixed, fixtureGraph(), params);
    const without = replayMastery(evidence, fixtureGraph(), params);
    expect(with_).toEqual(without);
    expect(with_.model.concepts.gamma).toBeUndefined();
  });

  it("leaves the review schedule as if they were not there", () => {
    const with_ = replayReviews(mixed);
    const without = replayReviews(evidence);
    expect(with_).toEqual(without);
    expect(with_.applied).toBe(2);
    expect(with_.reviews.cards.gamma).toBeUndefined();
  });
});
