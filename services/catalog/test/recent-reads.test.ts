import { concept, learner, LOCAL_LEARNER_ID, mastery, topic } from "@gnosia/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { appendEvent, readEvents, readKnowledgeBase, recentActivity, recentConcepts, type EventRecord } from "../src/state";
import { migratedScratchDatabase, probe, type Scratch } from "./scratch-database";

/**
 * The bounded reads behind the sidebar's Recent and Home's threads: the event
 * log folded per module and per concept (`recentActivity`), and the concepts
 * those name (`recentConcepts`), in place of the owner's whole `event` table
 * and every concept note.
 *
 * The web app folds what comes back with `moduleVisits` and `conceptTouches`
 * (apps/web/src/lib/recent-core.ts, home-core.ts), so the claim tested here
 * is that the fold of the folded rows is the fold of the whole log: the same
 * rows, in the same order, ties included. `fold` below is those two
 * functions, as they read the log.
 */

const OTHER = "owner-b";
const reachable = await probe();

const time = (at: string) => new Date(at).getTime();

/** `moduleVisits` and `conceptTouches` (with every readable concept known), newest first as `recentItems` sorts them. */
function fold(events: readonly EventRecord[], readable: ReadonlySet<string>) {
  const visits = new Map<string, string>();
  for (const e of events) {
    if (e.type !== "visit" || typeof e.course !== "string" || e.course === "") continue;
    const key = `${e.course}/${typeof e.module === "string" && e.module !== "" ? e.module : ""}`;
    const seen = visits.get(key);
    if (seen === undefined || time(e.at) > time(seen)) visits.set(key, e.at);
  }
  const voided = new Set(
    events.filter((e) => e.type === "void" && typeof e.session === "string" && e.session !== "").map((e) => e.session),
  );
  const touched = new Map<string, string>();
  for (const e of events) {
    if (e.type !== "observation" || typeof e.concept !== "string" || e.concept === "") continue;
    if (typeof e.session === "string" && voided.has(e.session)) continue;
    const seen = touched.get(e.concept);
    if (seen === undefined || time(e.at) > time(seen)) touched.set(e.concept, e.at);
  }
  const newest = (rows: [string, string][]) => rows.sort((a, b) => time(b[1]) - time(a[1]));
  return {
    visits: newest([...visits]),
    concepts: newest([...touched].filter(([id]) => readable.has(id))),
  };
}

describe.skipIf(!reachable.ok)("recentActivity and recentConcepts", () => {
  let scratch: Scratch;
  const at = (minute: number, ms = 0) => new Date(Date.UTC(2026, 9, 3, 10, minute, 0, ms)).toISOString();

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await scratch.db.insert(learner).values([{ id: LOCAL_LEARNER_ID }, { id: OTHER }]).onConflictDoNothing();
    await scratch.db.insert(topic).values({ slug: "alpha", title: "Alpha", domain: "one" });
    await scratch.db.insert(concept).values([
      ...["a", "b", "c", "d"].map((slug) => ({
        slug,
        title: `Concept ${slug.toUpperCase()}`,
        topicSlug: "alpha",
        path: `learn/concepts/one/${slug}.md`,
      })),
      { slug: "theirs", title: "Theirs", topicSlug: "alpha", path: "learn/concepts/one/theirs.md", ownerId: OTHER },
    ]);
    await scratch.db.insert(mastery).values({ learnerId: LOCAL_LEARNER_ID, conceptSlug: "a", pL: 0.97, observations: 3, correct: 3 });

    const local = (record: EventRecord) => appendEvent(scratch.db, record, LOCAL_LEARNER_ID);
    await local({ type: "visit", at: at(1), course: "cs3230", module: "m1" });
    await local({ type: "observation", at: at(1), concept: "a", session: "s1", correct: true });
    await local({ type: "visit", at: at(2), course: "cs3230" });
    await local({ type: "observation", at: at(2), concept: "b", correct: false });
    // The same instant as b's, and later in the log: a tie the log's order breaks.
    await local({ type: "observation", at: at(2), concept: "d", correct: true });
    await local({ type: "visit", at: at(3), course: "cs3230", module: "m1" });
    await local({ type: "visit", at: at(3), course: "cs3230", module: "" });
    await local({ type: "observation", at: at(3), concept: "a", correct: true });
    // Retracted by the void below, so never a touch, however recent.
    await local({ type: "observation", at: at(4), concept: "c", session: "s-void", correct: true });
    await local({ type: "void", at: at(5), session: "s-void", reason: "smoke test" });
    // Another owner's concept: not one this owner may read.
    await local({ type: "observation", at: at(6), concept: "theirs", correct: true });
    // Neither a course nor a module the fold would read.
    await local({ type: "visit", at: at(7), course: 5 as unknown as string });
    await local({ type: "visit", at: at(7), course: "" });
    await local({ type: "observation", at: at(8), concept: "a", correct: true });
    // Another learner's log is not this one's.
    await appendEvent(scratch.db, { type: "observation", at: at(9), concept: "b", correct: true }, OTHER);
    await appendEvent(scratch.db, { type: "visit", at: at(9), course: "cs4225", module: "m2" }, OTHER);
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  it("folds the log into one visit per module and one answer per readable concept, each in the order the log first met it", async () => {
    expect(await recentActivity(scratch.db, LOCAL_LEARNER_ID)).toEqual([
      { type: "visit", at: at(3), course: "cs3230", module: "m1" },
      { type: "visit", at: at(3), course: "cs3230" },
      { type: "observation", at: at(8), concept: "a" },
      { type: "observation", at: at(2), concept: "b" },
      { type: "observation", at: at(2), concept: "d" },
    ]);
  });

  it("keeps the newest concepts within the limit, a tie going the way the log breaks it, and every visit", async () => {
    const rows = await recentActivity(scratch.db, LOCAL_LEARNER_ID, { limit: 2 });
    expect(rows.filter((r) => r.type === "observation").map((r) => r.concept)).toEqual(["a", "b"]);
    expect(rows.filter((r) => r.type === "visit")).toHaveLength(2);
    expect((await recentActivity(scratch.db, LOCAL_LEARNER_ID, { limit: 0 })).filter((r) => r.type === "observation")).toEqual([]);
  });

  it("folds to what the whole log folds to", async () => {
    const kb = await readKnowledgeBase(scratch.db, LOCAL_LEARNER_ID);
    const readable = new Set(kb.concepts.map((c) => c.id));
    const whole = fold(await readEvents(scratch.db, LOCAL_LEARNER_ID), readable);
    expect(fold(await recentActivity(scratch.db, LOCAL_LEARNER_ID), readable)).toEqual(whole);
    for (const limit of [1, 2, 3]) {
      const bounded = fold(await recentActivity(scratch.db, LOCAL_LEARNER_ID, { limit }), readable);
      expect(bounded).toEqual({ visits: whole.visits, concepts: whole.concepts.slice(0, limit) });
    }
  });

  it("reads only the concepts asked for, with the mastery the knowledge base gives them", async () => {
    const kb = await readKnowledgeBase(scratch.db, LOCAL_LEARNER_ID);
    const cards = await recentConcepts(scratch.db, LOCAL_LEARNER_ID, ["a", "b", "a", "theirs", "missing"]);
    const byId = new Map(cards.map((c) => [c.id, c]));
    expect([...byId.keys()].sort()).toEqual(["a", "b"]);
    for (const id of ["a", "b"]) {
      const full = kb.concepts.find((c) => c.id === id);
      expect(byId.get(id)).toEqual({
        id,
        title: full?.title,
        pL: full?.pL,
        mastery: full?.mastery,
        observations: full?.observations,
      });
    }
    expect(byId.get("a")).toMatchObject({ mastery: "mastered", observations: 3 });
    // No mastery row: the prior, as `masteryOf` falls back to it.
    expect(byId.get("b")).toMatchObject({ pL: 0.25, mastery: "gap", observations: 0 });
    expect(await recentConcepts(scratch.db, LOCAL_LEARNER_ID, [])).toEqual([]);
    expect((await recentConcepts(scratch.db, OTHER, ["theirs", "a"])).map((c) => c.id).sort()).toEqual(["theirs"]);
  });
});

describe.skipIf(!reachable.ok)("recentActivity over a longer log", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await scratch.db.insert(learner).values({ id: LOCAL_LEARNER_ID }).onConflictDoNothing();
    await scratch.db.insert(topic).values({ slug: "alpha", title: "Alpha", domain: "one" });
    const slugs = Array.from({ length: 12 }, (_, i) => `k${i}`);
    await scratch.db
      .insert(concept)
      .values(slugs.map((slug) => ({ slug, title: slug, topicSlug: "alpha", path: `learn/concepts/one/${slug}.md` })));
    // A fixed pseudo-random log: instants land on a few seconds, so ties
    // between concepts and between modules are common, and events arrive out
    // of time order, as a backfill writes them.
    let seed = 7;
    const next = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let i = 0; i < 240; i += 1) {
      const at = new Date(Date.UTC(2026, 9, 3, 10, 0, next(20), next(3))).toISOString();
      const roll = next(10);
      if (roll < 6) {
        const session = next(4) === 0 ? `s${next(5)}` : undefined;
        await appendEvent(scratch.db, { type: "observation", at, concept: slugs[next(slugs.length)], correct: true, ...(session ? { session } : {}) });
      } else if (roll < 9) {
        const slot = next(4);
        await appendEvent(scratch.db, { type: "visit", at, course: `c${next(3)}`, ...(slot === 0 ? {} : { module: `m${slot}` }) });
      } else if (next(3) === 0) {
        await appendEvent(scratch.db, { type: "void", at, session: `s${next(5)}`, reason: "test" });
      }
    }
  }, 120_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  it("folds to what the whole log folds to, at every limit", async () => {
    const readable = new Set(Array.from({ length: 12 }, (_, i) => `k${i}`));
    const whole = fold(await readEvents(scratch.db, LOCAL_LEARNER_ID), readable);
    expect(whole.concepts.length).toBeGreaterThan(3);
    expect(fold(await recentActivity(scratch.db, LOCAL_LEARNER_ID), readable)).toEqual(whole);
    for (let limit = 1; limit <= 13; limit += 1) {
      const bounded = fold(await recentActivity(scratch.db, LOCAL_LEARNER_ID, { limit }), readable);
      expect(bounded).toEqual({ visits: whole.visits, concepts: whole.concepts.slice(0, limit) });
    }
  });
});
