import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearTables,
  migratedScratchDatabase,
  probe,
  type Scratch,
} from "../../../../../../../services/catalog/test/scratch-database";
import { seedContent } from "../../../../../../../services/catalog/test/state-fixture";
import { collection, learner } from "@gnosia/schema";

/**
 * Beside the fixture's live module `fx-m1`: one the course file stopped
 * listing (archived), and one another owner wrote, so a week check's
 * `module` can be refused for each reason.
 */
async function seedModules(db: Scratch["db"]) {
  await db.insert(learner).values({ id: "someone-else" }).onConflictDoNothing();
  await db
    .insert(collection)
    .values([
      { id: "fx-m2", kind: "module", slug: "m2", title: "Dropped module", parentId: "fx", position: 1, archivedAt: new Date() },
      { id: "theirs", kind: "course", slug: "theirs", title: "Their course", ownerId: "someone-else" },
      { id: "theirs-m1", kind: "module", slug: "m1", title: "Their module", parentId: "theirs", ownerId: "someone-else" },
    ])
    .onConflictDoNothing();
}

// A signed-in request, so the owner seam (`@/lib/owner`) resolves `local`.
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));

/**
 * `POST /api/learner/observe` and `POST /api/learner/session/close`, against a
 * scratch database.
 *
 * The observe route is the session's evidence write, so what it refuses is
 * pinned (a foreign origin, a malformed answer, a concept the catalog lacks,
 * a review dressed as a probe) and so is what it stores: the same event
 * `learn observe` writes, a session opened by its first answer, and one event
 * per answer however often the page retries it.
 */

const reachable = await probe();
const ORIGIN = "http://localhost:3000";
let ip = 0;

function request(path: string, body: unknown, origin: string | null = ORIGIN): Request {
  ip += 1;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    host: "localhost:3000",
    // A fresh client per request, so the rate limit never trips across tests.
    "x-forwarded-for": `10.2.0.${ip}`,
  };
  if (origin !== null) headers.origin = origin;
  return new Request(`${ORIGIN}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

describe.skipIf(!reachable.ok)("the session's learner routes", () => {
  let scratch: Scratch;
  let observe: (req: Request) => Promise<Response>;
  let close: (req: Request) => Promise<Response>;
  let state: typeof import("@gnosia/catalog/state");

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await seedContent(scratch.db);
    await seedModules(scratch.db);
    process.env.DATABASE_URL = scratch.url;
    const [observeRoute, closeRoute, store] = await Promise.all([
      import("./route"),
      import("../session/close/route"),
      import("@gnosia/catalog/state"),
    ]);
    observe = observeRoute.POST;
    close = closeRoute.POST;
    state = store;
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  beforeEach(async () => {
    await clearTables(scratch.db, ["event", "mastery", "review", "session"]);
  });

  const answer = {
    conceptSlug: "gamma",
    correct: true,
    source: "teach",
    requestId: "req-1",
    sessionId: "web-2026-09-26-gamma-abc",
    question: "What does gamma need?",
    answer: "Beta",
    chosen: "Beta",
  };

  const send = async (body: unknown, origin?: string | null) => {
    const res = await observe(request("/api/learner/observe", body, origin));
    return { status: res.status, body: (await res.json()) as { ok: boolean; result?: Record<string, unknown>; code?: string } };
  };

  it("refuses another origin, or none, and writes nothing", async () => {
    expect((await send(answer, "https://evil.example")).status).toBe(403);
    expect((await send(answer, null)).status).toBe(403);
    expect(await state.readEvents(scratch.db)).toEqual([]);
  });

  it.each([
    ["a slug that is not a concept id", { conceptSlug: "Gamma!" }],
    ["a non-boolean verdict", { correct: "true" }],
    ["a review dressed as an answer", { source: "review" }],
    ["no request id", { requestId: undefined }],
    ["a request id with a space", { requestId: "a b" }],
    ["a session id with a slash", { sessionId: "a/b" }],
    ["a question past the cap", { question: "x".repeat(2_001) }],
    ["a non-boolean closeSession", { closeSession: "yes" }],
    ["a module that is not an id", { module: "Week 1!" }],
    ["a module that is not a string", { module: 7 }],
  ])("refuses %s as a 400", async (_label, change) => {
    const { status, body } = await send({ ...answer, ...change });
    expect(status).toBe(400);
    expect(body.code).toBe("BAD_REQUEST");
    expect(await state.readEvents(scratch.db)).toEqual([]);
  });

  it("refuses a concept the catalog lacks as a 400, not a 503", async () => {
    const { status } = await send({ ...answer, conceptSlug: "delta", sessionId: undefined });
    expect(status).toBe(400);
    expect(await state.readEvents(scratch.db)).toEqual([]);
  });

  it("leaves no session behind when the first answer is refused", async () => {
    expect((await send({ ...answer, conceptSlug: "delta" })).status).toBe(400);
    expect(await state.readEvents(scratch.db)).toEqual([]);
    expect(await state.readSession(scratch.db, answer.sessionId)).toBeUndefined();
  });

  it("records the answer as learn observe does, opening the session with it", async () => {
    const { status, body } = await send(answer);
    expect(status).toBe(200);
    const result = body.result as Record<string, unknown>;
    expect(result).toMatchObject({
      concept: "gamma",
      correct: true,
      pLBefore: 0.25,
      mastery: "shaky",
      mastered: false,
      session: answer.sessionId,
      replayed: false,
    });
    expect(result.delta).toBeCloseTo((result.pLAfter as number) - 0.25, 12);
    expect(result.card).toMatchObject({ intervalDays: 1, created: true });
    expect(result.propagated).toEqual([
      expect.objectContaining({ concept: "beta", title: "Beta", hops: 1 }),
      expect.objectContaining({ concept: "alpha", title: "Alpha", hops: 2 }),
    ]);

    const events = await state.readEvents(scratch.db);
    expect(events.map((e) => e.type)).toEqual(["session-start", "observation"]);
    expect(events[1]).toMatchObject({
      concept: "gamma",
      session: answer.sessionId,
      correct: true,
      source: "teach",
      opportunity: true,
      scheduled: true,
      question: answer.question,
      answer: "Beta",
      chosen: "Beta",
      requestId: "req-1",
    });
    expect(await state.readSession(scratch.db, answer.sessionId)).toMatchObject({
      kind: "tutor",
      state: "running",
      title: "Gamma",
      goal: "gamma",
    });
    expect((await state.readModel(scratch.db)).concepts.gamma?.observations).toBe(1);
    expect(Object.keys((await state.readReviews(scratch.db)).cards)).toEqual(["gamma"]);
  });

  it("records the week check's module in the event, and opens the session on the module", async () => {
    const { status } = await send({ ...answer, source: "probe", module: "fx-m1" });
    expect(status).toBe(200);
    const events = await state.readEvents(scratch.db);
    expect(events[1]).toMatchObject({ concept: "gamma", source: "probe", opportunity: false, module: "fx-m1" });
    expect(await state.readSession(scratch.db, answer.sessionId)).toMatchObject({ title: "Fixture module", goal: "fx-m1" });
  });

  it("opens a chat's session under the title and goal it names, and refuses a bad one", async () => {
    const { status } = await send({ ...answer, sessionTitle: "CP4284 · Attention", sessionGoal: "cp4284-m1-t1" });
    expect(status).toBe(200);
    expect(await state.readSession(scratch.db, answer.sessionId)).toMatchObject({
      title: "CP4284 · Attention",
      goal: "cp4284-m1-t1",
    });
    expect((await send({ ...answer, requestId: "req-bad-1", sessionTitle: "" })).status).toBe(400);
    expect((await send({ ...answer, requestId: "req-bad-2", sessionGoal: "has space" })).status).toBe(400);
  });

  it("writes no module key when the answer names none", async () => {
    await send(answer);
    expect(Object.keys((await state.readEvents(scratch.db))[1] ?? {})).not.toContain("module");
  });

  it.each([
    ["no module of that id", "fx-m9"],
    ["an archived module", "fx-m2"],
    ["another owner's module", "theirs-m1"],
    ["a course, not a module", "fx"],
  ])("refuses %s as a 400, and writes nothing", async (_label, module) => {
    const { status, body } = await send({ ...answer, source: "probe", module });
    expect(status).toBe(400);
    expect(body.code).toBe("BAD_REQUEST");
    expect(await state.readEvents(scratch.db)).toEqual([]);
    expect(await state.readSession(scratch.db, answer.sessionId)).toBeUndefined();
  });

  it("records a probe without the learning step", async () => {
    const probed = await send({ ...answer, source: "probe" });
    const events = await state.readEvents(scratch.db);
    expect(events[1]).toMatchObject({ source: "probe", opportunity: false });
    // The CLI's pinned probe: the posterior at the 0.25 prior, no transit.
    expect(probed.body.result?.pLAfter).toBeCloseTo(0.6, 12);
  });

  it("answers a retry with the first write and records one event", async () => {
    const first = await send(answer);
    const retry = await send({ ...answer, correct: false });
    expect(retry.status).toBe(200);
    expect(retry.body.result).toMatchObject({
      correct: true,
      pLAfter: first.body.result?.pLAfter,
      replayed: true,
    });
    const types = (await state.readEvents(scratch.db)).map((e) => e.type);
    expect(types).toEqual(["session-start", "observation"]);
  });

  it("closes the session once, with what it answered", async () => {
    await send(answer);
    await send({ ...answer, requestId: "req-2", correct: false });
    const post = async () => {
      const res = await close(request("/api/learner/session/close", { sessionId: answer.sessionId }));
      return { status: res.status, body: (await res.json()) as { ok: boolean; result: Record<string, unknown> } };
    };
    const first = await post();
    expect(first.status).toBe(200);
    expect(first.body.result).toEqual({
      session: answer.sessionId,
      closed: true,
      answered: 2,
      correct: 1,
      concepts: ["gamma"],
    });
    expect((await post()).body.result.closed).toBe(false);
    const types = (await state.readEvents(scratch.db)).map((e) => e.type);
    expect(types).toEqual(["session-start", "observation", "observation", "session-close"]);
    expect((await state.readSession(scratch.db, answer.sessionId))?.state).toBe("closed");
  });

  it("refuses an answer into a session that has closed", async () => {
    await send(answer);
    await close(request("/api/learner/session/close", { sessionId: answer.sessionId }));
    const late = await send({ ...answer, requestId: "req-late" });
    expect(late.status).toBe(400);
    expect((await state.readEvents(scratch.db)).filter((e) => e.type === "observation")).toHaveLength(1);
  });

  it("records then closes with closeSession, and either copy of a racing answer replays the other", async () => {
    // A page leaving mid-save resends the pending answer with closeSession.
    const leaving = await send({ ...answer, closeSession: true });
    expect(leaving.body.result).toMatchObject({ replayed: false, closed: true });
    // The original request, arriving late, finds its answer already recorded.
    const late = await send(answer);
    expect(late.status).toBe(200);
    expect(late.body.result).toMatchObject({ replayed: true, closed: false });
    const again = await send({ ...answer, closeSession: true });
    expect(again.body.result).toMatchObject({ replayed: true, closed: false });
    const types = (await state.readEvents(scratch.db)).map((e) => e.type);
    expect(types).toEqual(["session-start", "observation", "session-close"]);
    expect((await state.readSession(scratch.db, answer.sessionId))?.state).toBe("closed");
  });

  it("refuses a close from another origin, and a malformed session id", async () => {
    expect((await close(request("/api/learner/session/close", { sessionId: "x" }, "https://evil.example"))).status).toBe(403);
    expect((await close(request("/api/learner/session/close", { sessionId: "../x" }))).status).toBe(400);
  });
});
