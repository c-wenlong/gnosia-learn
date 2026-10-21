import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { update as bktUpdate, DEFAULT_PARAMS } from "../../../scripts/learn/lib/bkt.mjs";
import { gradeFromOutcome, newCard, review as sm2 } from "../../../scripts/learn/lib/schedule.mjs";
import {
  closeTutorSession,
  ensureSession,
  openTutorSession,
  readConceptGraph,
  readEvents,
  readModel,
  readParams,
  readReviews,
  readSession,
  recordObservation,
  replayMastery,
  StateError,
  upsertReview,
  type ReviewCard,
} from "../src/state";
import { replayReviews } from "../src/learn/replay";
import { clearTables, migratedScratchDatabase, probe, type Scratch } from "./scratch-database";
import { fixtureGraph, seedContent } from "./state-fixture";
import { collection, learner, LOCAL_LEARNER_ID, ownerScope } from "@gnosia/schema";

/** Who these reads are for: the one owner there is today (phase 4 scoping). */
const LOCAL = ownerScope(LOCAL_LEARNER_ID);

/**
 * `recordObservation`, the observe write moved out of the `learn` CLI so the
 * web app's `POST /api/learner/observe` runs the same code, and the session
 * open and close a page does around it.
 *
 * The CLI's `--json` shape stays pinned in `learn-cli.test.ts`, which runs the
 * real command through this function. This file pins what that golden cannot
 * see: the event is what a replay needs, the catalog graph propagates the way
 * the file graph does, a request id makes a retry harmless, and the lock keeps
 * two concurrent answers from losing one.
 */

// In the past on purpose: a session closes at the database's `cast(unixepoch('subsec') * 1000 as integer)`, and a
// start in the future would break `session_order_check`.
const NOW = new Date("2026-09-20T08:00:00.000Z");
const later = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

const reachable = await probe();

describe.skipIf(!reachable.ok)("recordObservation", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await seedContent(scratch.db);
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  async function reset() {
    await clearTables(scratch.db, ["event", "mastery", "review", "session"]);
  }

  beforeEach(reset);

  it("builds the same graph from the catalog that the notes give the CLI", async () => {
    const graph = await readConceptGraph(scratch.db, LOCAL);
    const requires = (id: string) => (graph.nodes.get(id) as { requires: string[] } | undefined)?.requires;
    expect([...graph.nodes.keys()].sort()).toEqual(["alpha", "beta", "gamma"]);
    expect(requires("alpha")).toEqual([]);
    expect(requires("beta")).toEqual(["alpha"]);
    expect(requires("gamma")).toEqual(["beta"]);
  });

  describe("a week check's answer", () => {
    beforeAll(async () => {
      await scratch.db.insert(learner).values({ id: "someone-else" }).onConflictDoNothing();
      await scratch.db
        .insert(collection)
        .values([
          { id: "fx-m2", kind: "module", slug: "m2", title: "Dropped", parentId: "fx", position: 1, archivedAt: new Date() },
          { id: "theirs", kind: "course", slug: "theirs", title: "Theirs", ownerId: "someone-else" },
          { id: "theirs-m1", kind: "module", slug: "m1", title: "Theirs", parentId: "theirs", ownerId: "someone-else" },
          // The learner's own module under a course they cannot read.
          { id: "mine-under-theirs", kind: "module", slug: "m2", title: "Mine", parentId: "theirs", position: 2 },
        ])
        .onConflictDoNothing();
    });

    it("carries its module in the event payload, and the session it opens is the module's", async () => {
      const graph = await readConceptGraph(scratch.db, LOCAL);
      await recordObservation(scratch.db, {
        conceptId: "beta",
        correct: true,
        graph,
        source: "probe",
        module: "fx-m1",
        session: "web-week",
        openSession: { goal: "fx-m1" },
        now: NOW,
      });
      const [start, answer] = await readEvents(scratch.db);
      expect(answer).toMatchObject({ type: "observation", concept: "beta", source: "probe", module: "fx-m1" });
      expect(start).toMatchObject({ type: "session-start", goal: "fx-m1" });
      expect(await readSession(scratch.db, "web-week")).toMatchObject({ title: "Fixture module", goal: "fx-m1" });
    });

    it.each([
      ["no module of that id", "fx-m9"],
      ["an archived module", "fx-m2"],
      ["another owner's module", "theirs-m1"],
      ["their own module under a course they cannot read", "mine-under-theirs"],
      ["a course rather than a module", "fx"],
    ])("refuses %s, and writes nothing", async (_label, module) => {
      const graph = await readConceptGraph(scratch.db, LOCAL);
      const observe = recordObservation(scratch.db, { conceptId: "beta", correct: true, graph, module, session: "web-x", openSession: {} });
      await expect(observe).rejects.toBeInstanceOf(StateError);
      await expect(observe).rejects.toThrow(`no live module "${module}"`);
      expect(await readEvents(scratch.db)).toEqual([]);
      expect(await readSession(scratch.db, "web-x")).toBeUndefined();
    });
  });

  it("appends the event, moves p(L), propagates and schedules, on one clock", async () => {
    const graph = await readConceptGraph(scratch.db, LOCAL);
    const result = await recordObservation(scratch.db, {
      conceptId: "gamma",
      correct: true,
      graph,
      source: "teach",
      question: "Q?",
      answer: "A",
      chosen: "B",
      now: NOW,
      requestId: "a-1",
    });

    const pLAfter = bktUpdate(0.25, true, { params: DEFAULT_PARAMS, opportunity: true }) as number;
    const grade = gradeFromOutcome(true, pLAfter) as number;
    const card = sm2(newCard("gamma", NOW), grade, { now: NOW }) as ReviewCard;
    expect(result).toMatchObject({
      concept: "gamma",
      correct: true,
      pLBefore: 0.25,
      pLAfter,
      grade,
      card,
      cardCreated: true,
      due: card.due,
      replayed: false,
    });
    expect(result.propagated.map((p) => [p.concept, p.hops])).toEqual([
      ["beta", 1],
      ["alpha", 2],
    ]);

    expect(await readEvents(scratch.db)).toEqual([
      {
        at: NOW.toISOString(),
        type: "observation",
        concept: "gamma",
        correct: true,
        propagated: [
          { concept: "beta", hops: 1 },
          { concept: "alpha", hops: 2 },
        ],
        source: "teach",
        opportunity: true,
        grade,
        scheduled: true,
        pLBefore: 0.25,
        pLAfter,
        question: "Q?",
        answer: "A",
        chosen: "B",
        requestId: "a-1",
      },
    ]);

    const model = await readModel(scratch.db);
    expect(model.concepts.gamma).toEqual({ pL: pLAfter, observations: 1, correct: 1, lastSeen: NOW.toISOString() });
    // Propagation moves belief but asks nothing, so it counts no observation.
    expect(model.concepts.beta?.observations).toBe(0);
    expect(model.concepts.beta?.pL).toBe(result.propagated[0]?.pLAfter);
    expect((await readReviews(scratch.db)).cards.gamma).toEqual({ ...card, history: [] });
  });

  it("propagates along the catalog graph exactly as along the fixture graph", async () => {
    const fromCatalog = await recordObservation(scratch.db, {
      conceptId: "gamma",
      correct: true,
      graph: await readConceptGraph(scratch.db, LOCAL),
      now: NOW,
      schedule: false,
    });
    await reset();
    const fromFixture = await recordObservation(scratch.db, {
      conceptId: "gamma",
      correct: true,
      graph: fixtureGraph(),
      now: NOW,
      schedule: false,
    });
    expect(fromCatalog.propagated).toEqual(fromFixture.propagated);
  });

  it("gives a probe no learning step and no opportunity, and a teach answer both", async () => {
    const graph = await readConceptGraph(scratch.db, LOCAL);
    const probe = await recordObservation(scratch.db, { conceptId: "alpha", correct: true, graph, now: NOW });
    expect(probe.pLAfter).toBe(bktUpdate(0.25, true, { params: DEFAULT_PARAMS, opportunity: false }));
    const teach = await recordObservation(scratch.db, {
      conceptId: "beta",
      correct: true,
      graph,
      source: "teach",
      now: NOW,
    });
    expect(teach.pLAfter).toBe(bktUpdate(teach.pLBefore, true, { params: DEFAULT_PARAMS, opportunity: true }));
    const events = await readEvents(scratch.db);
    expect(events.map((e) => [e.source, e.opportunity])).toEqual([
      ["probe", false],
      ["teach", true],
    ]);
  });

  it("does not propagate a wrong answer, and reschedules an existing card without creating one", async () => {
    const graph = await readConceptGraph(scratch.db, LOCAL);
    const first = await recordObservation(scratch.db, { conceptId: "beta", correct: false, graph, now: NOW });
    expect(first.propagated).toEqual([]);
    expect(first.cardCreated).toBe(true);
    expect((await readModel(scratch.db)).concepts.alpha).toBeUndefined();

    const second = await recordObservation(scratch.db, {
      conceptId: "beta",
      correct: true,
      graph,
      now: later(60),
    });
    expect(second.cardCreated).toBe(false);
    expect(second.pLBefore).toBe(first.pLAfter);
  });

  it("with schedule false writes no card and reports the stored due date", async () => {
    const stored: ReviewCard = {
      ...(newCard("alpha", NOW) as ReviewCard),
      intervalDays: 3,
      due: "2026-09-23T08:00:00.000Z",
    };
    await upsertReview(scratch.db, stored);
    const result = await recordObservation(scratch.db, {
      conceptId: "alpha",
      correct: true,
      graph: fixtureGraph(),
      schedule: false,
      now: NOW,
    });
    expect(result.card).toBeNull();
    expect(result.due).toBe(stored.due);
    expect((await readEvents(scratch.db))[0]).toMatchObject({ scheduled: false });
  });

  it("records a request id once: a retry answers with the first write", async () => {
    const graph = await readConceptGraph(scratch.db, LOCAL);
    const first = await recordObservation(scratch.db, {
      conceptId: "gamma",
      correct: true,
      graph,
      now: NOW,
      requestId: "r-1",
    });
    // The retry even claims the opposite answer: what was saved stands.
    const again = await recordObservation(scratch.db, {
      conceptId: "gamma",
      correct: false,
      graph,
      now: later(5),
      requestId: "r-1",
    });
    expect(again).toMatchObject({
      concept: "gamma",
      correct: true,
      pLBefore: first.pLBefore,
      pLAfter: first.pLAfter,
      grade: first.grade,
      card: { ...first.card, history: [] },
      replayed: true,
    });
    expect(again.propagated).toEqual(first.propagated.map((p) => ({ concept: p.concept, hops: p.hops })));
    expect(await readEvents(scratch.db)).toHaveLength(1);
    expect((await readModel(scratch.db)).concepts.gamma?.observations).toBe(1);

    const other = await recordObservation(scratch.db, {
      conceptId: "gamma",
      correct: true,
      graph,
      now: later(10),
      requestId: "r-2",
    });
    expect(other.replayed).toBe(false);
    expect(await readEvents(scratch.db)).toHaveLength(2);
  });

  it("serialises concurrent answers, so neither is lost from the projection", async () => {
    const graph = await readConceptGraph(scratch.db, LOCAL);
    await Promise.all(
      [0, 1, 2, 3].map((i) =>
        recordObservation(scratch.db, { conceptId: "alpha", correct: i % 2 === 0, graph, now: later(i) }),
      ),
    );
    const entry = (await readModel(scratch.db)).concepts.alpha;
    expect(entry?.observations).toBe(4);
    expect(entry?.correct).toBe(2);
    // And the projection is the log's: a replay lands on the same number.
    const { model } = replayMastery(await readEvents(scratch.db), graph, await readParams(scratch.db));
    expect(model.concepts.alpha?.pL).toBeCloseTo(entry?.pL ?? -1, 12);
  });

  it("writes events both replays reproduce: the mastery and the schedule", async () => {
    const graph = await readConceptGraph(scratch.db, LOCAL);
    await recordObservation(scratch.db, { conceptId: "alpha", correct: true, graph, now: NOW });
    await recordObservation(scratch.db, { conceptId: "gamma", correct: false, graph, source: "teach", now: later(30) });
    await recordObservation(scratch.db, { conceptId: "gamma", correct: true, graph, source: "teach", now: later(90) });

    const events = await readEvents(scratch.db);
    const { model } = replayMastery(events, graph, await readParams(scratch.db));
    const stored = await readModel(scratch.db);
    for (const slug of ["alpha", "beta", "gamma"]) {
      expect(model.concepts[slug]?.pL).toBeCloseTo(stored.concepts[slug]?.pL ?? -1, 12);
    }
    const { reviews } = replayReviews(events);
    const cards = (await readReviews(scratch.db)).cards;
    for (const slug of Object.keys(cards)) {
      expect({ ...reviews.cards[slug], history: [] }).toEqual(cards[slug]);
    }
  });

  it("refuses an unknown concept, a bad request id and a bad grade before writing anything", async () => {
    const graph = fixtureGraph();
    await expect(recordObservation(scratch.db, { conceptId: "nope", correct: true, graph })).rejects.toThrow(
      StateError,
    );
    await expect(
      recordObservation(scratch.db, { conceptId: "alpha", correct: true, graph, requestId: "no spaces" }),
    ).rejects.toThrow(StateError);
    await expect(
      recordObservation(scratch.db, { conceptId: "alpha", correct: true, graph, grade: Number.NaN }),
    ).rejects.toThrow(StateError);
    expect(await readEvents(scratch.db)).toEqual([]);
  });

  describe("a tutor session from a page", () => {
    it("opens once: one row, one session-start, however often it is asked", async () => {
      const first = await openTutorSession(scratch.db, { id: "web-alpha-1", title: "Alpha", goal: "alpha", now: NOW });
      const again = await openTutorSession(scratch.db, { id: "web-alpha-1", title: "Alpha", goal: "alpha", now: later(5) });
      expect(first).toEqual({ id: "web-alpha-1", created: true });
      expect(again).toEqual({ id: "web-alpha-1", created: false });

      const row = await readSession(scratch.db, "web-alpha-1");
      expect(row).toMatchObject({ kind: "tutor", state: "running", title: "Alpha", goal: "alpha" });
      expect(row?.startedAt.toISOString()).toBe(NOW.toISOString());
      expect(await readEvents(scratch.db)).toEqual([
        { at: NOW.toISOString(), type: "session-start", session: "web-alpha-1", goal: "alpha" },
      ]);
    });

    it("will not adopt a studio session's id, or reopen a closed one", async () => {
      await ensureSession(scratch.db, { id: "studio-1", kind: "studio", startedAt: NOW });
      await expect(openTutorSession(scratch.db, { id: "studio-1", now: NOW })).rejects.toThrow(StateError);
      await openTutorSession(scratch.db, { id: "done-1", now: NOW });
      await closeTutorSession(scratch.db, "done-1");
      await expect(openTutorSession(scratch.db, { id: "done-1", now: NOW })).rejects.toThrow(/closed/);
    });

    it("opens the session with the first answer, in one transaction with it", async () => {
      const graph = fixtureGraph();
      const open = { title: "Alpha", goal: "alpha" };
      await recordObservation(scratch.db, { conceptId: "alpha", correct: true, graph, session: "s-1", openSession: open, now: NOW });
      await recordObservation(scratch.db, { conceptId: "alpha", correct: true, graph, session: "s-1", openSession: open, now: later(1) });
      expect((await readEvents(scratch.db)).map((e) => e.type)).toEqual(["session-start", "observation", "observation"]);
      expect(await readSession(scratch.db, "s-1")).toMatchObject({ kind: "tutor", state: "running", title: "Alpha" });
    });

    it("leaves no session-start behind when the answer is refused", async () => {
      await expect(
        recordObservation(scratch.db, {
          conceptId: "nope",
          correct: true,
          graph: fixtureGraph(),
          session: "s-2",
          openSession: {},
          now: NOW,
        }),
      ).rejects.toThrow(StateError);
      expect(await readEvents(scratch.db)).toEqual([]);
      expect(await readSession(scratch.db, "s-2")).toBeUndefined();
    });

    it("refuses an answer into a closed session, but still answers its replay", async () => {
      const graph = fixtureGraph();
      const first = await recordObservation(scratch.db, {
        conceptId: "alpha",
        correct: true,
        graph,
        session: "s-3",
        openSession: {},
        now: NOW,
        requestId: "q-1",
      });
      await closeTutorSession(scratch.db, "s-3");
      await expect(
        recordObservation(scratch.db, { conceptId: "alpha", correct: true, graph, session: "s-3", openSession: {}, requestId: "q-2" }),
      ).rejects.toThrow(/closed/);
      const replay = await recordObservation(scratch.db, {
        conceptId: "alpha",
        correct: true,
        graph,
        session: "s-3",
        openSession: {},
        requestId: "q-1",
      });
      expect(replay).toMatchObject({ replayed: true, pLAfter: first.pLAfter });
      expect((await readEvents(scratch.db)).filter((e) => e.type === "observation")).toHaveLength(1);
    });

    it("orders a close and a first answer: the close counts the answer or the answer is refused", async () => {
      const graph = fixtureGraph();
      await openTutorSession(scratch.db, { id: "s-4", now: NOW });
      const [answer, closed] = await Promise.allSettled([
        recordObservation(scratch.db, { conceptId: "beta", correct: true, graph, session: "s-4", openSession: {}, now: later(1) }),
        closeTutorSession(scratch.db, "s-4"),
      ]);
      expect(closed.status).toBe("fulfilled");
      const counted = closed.status === "fulfilled" ? closed.value.answered : -1;
      expect(counted).toBe(answer.status === "fulfilled" ? 1 : 0);
      const types = (await readEvents(scratch.db)).map((e) => e.type);
      expect(types.at(-1) === "session-close" || answer.status === "rejected").toBe(true);
      expect(types.indexOf("session-close")).toBeGreaterThan(types.lastIndexOf("observation"));
    });

    it("closes in the answer's own transaction with closeSession, replay or not", async () => {
      const graph = fixtureGraph();
      const base = { conceptId: "alpha", correct: true, graph, session: "s-5", openSession: {}, requestId: "c-1" };
      const first = await recordObservation(scratch.db, { ...base, closeSession: true, now: NOW });
      expect(first).toMatchObject({ replayed: false, closed: true });
      expect((await readEvents(scratch.db)).map((e) => e.type)).toEqual(["session-start", "observation", "session-close"]);
      // The original copy arriving after: a replay, and nothing more to close.
      expect(await recordObservation(scratch.db, base)).toMatchObject({ replayed: true, closed: false });
      expect(await readEvents(scratch.db)).toHaveLength(3);
    });

    it("writes nothing when the session cannot take the answer, closeSession or not", async () => {
      await ensureSession(scratch.db, { id: "studio-2", kind: "studio", startedAt: NOW });
      await expect(
        recordObservation(scratch.db, {
          conceptId: "alpha",
          correct: true,
          graph: fixtureGraph(),
          session: "studio-2",
          openSession: {},
          closeSession: true,
          now: NOW,
        }),
      ).rejects.toThrow(StateError);
      expect(await readEvents(scratch.db)).toEqual([]);
    });

    it("leaves chosen out of the event when the caller does not know it, as the CLI does", async () => {
      await recordObservation(scratch.db, { conceptId: "alpha", correct: true, graph: fixtureGraph(), now: NOW });
      expect(Object.keys((await readEvents(scratch.db))[0] ?? {})).not.toContain("chosen");
    });

    it("closes once, with what was answered, and a replayed close writes nothing", async () => {
      const graph = await readConceptGraph(scratch.db, LOCAL);
      await openTutorSession(scratch.db, { id: "s-web", title: "Gamma", goal: "gamma", now: NOW });
      await recordObservation(scratch.db, { conceptId: "gamma", correct: false, graph, session: "s-web", now: later(1) });
      await recordObservation(scratch.db, {
        conceptId: "gamma",
        correct: true,
        graph,
        source: "teach",
        session: "s-web",
        now: later(2),
      });

      const closed = await closeTutorSession(scratch.db, "s-web", { now: later(3) });
      expect(closed).toEqual({ session: "s-web", closed: true, answered: 2, correct: 1, concepts: ["gamma"] });
      expect((await readSession(scratch.db, "s-web"))?.state).toBe("closed");

      const replay = await closeTutorSession(scratch.db, "s-web", { now: later(4) });
      expect(replay).toMatchObject({ closed: false, answered: 2 });
      const types = (await readEvents(scratch.db)).map((e) => e.type);
      expect(types).toEqual(["session-start", "observation", "observation", "session-close"]);
    });

    it("closing a session nobody opened is a no-op, not an error", async () => {
      expect(await closeTutorSession(scratch.db, "never-opened")).toEqual({
        session: "never-opened",
        closed: false,
        answered: 0,
        correct: 0,
        concepts: [],
      });
      expect(await readEvents(scratch.db)).toEqual([]);
    });
  });
});
