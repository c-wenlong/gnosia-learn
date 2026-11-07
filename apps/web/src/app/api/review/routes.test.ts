import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { concept, learner } from "@gnosia/schema";

import {
  clearTables,
  migratedScratchDatabase,
  probe,
  type Scratch,
} from "../../../../../../services/catalog/test/scratch-database";
import { seedContent, TOPIC_SLUG } from "../../../../../../services/catalog/test/state-fixture";

// A signed-in request, so the owner seam (`@/lib/owner`) resolves `local`;
// a test that wants a signed-out one says so once.
const signedIn = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => signedIn.value,
}));
// The database seam, real unless a test breaks it, for the unreachable answer.
const store = vi.hoisted(() => ({ broken: false }));
vi.mock("@/lib/learner-store", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/learner-store")>();
  return {
    ...real,
    catalogDatabase: async () => (store.broken ? Promise.reject(new Error("database unavailable")) : real.catalogDatabase()),
  };
});

/**
 * `GET /api/review/due` and `POST /api/review/grade`, against a scratch
 * database.
 *
 * The grade route is the first page-facing write of `event`, `review` and
 * `mastery`, so what it refuses is pinned here as for the learner routes: a
 * foreign origin, a rating outside 0 to 3, and a concept the catalog lacks.
 * What it stores is pinned too: the rating is mapped onto SM-2's scale before
 * `gradeReview` records it, so Again lands in the log as grade 1 and Easy as 5.
 *
 * `DATABASE_URL` is set before the routes are imported, since `learner-store`
 * opens its one pool on first use.
 */

const reachable = await probe();
const ORIGIN = "http://localhost:3000";

function post(body: unknown, origin: string | null = ORIGIN): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json", host: "localhost:3000" };
  if (origin !== null) headers.origin = origin;
  return new Request(`${ORIGIN}/api/review/grade`, { method: "POST", headers, body: JSON.stringify(body) });
}

describe.skipIf(!reachable.ok)("review API routes", () => {
  let scratch: Scratch;
  let grade: (req: Request) => Promise<Response>;
  let due: (req: Request) => Promise<Response>;
  let state: typeof import("@gnosia/catalog/state");

  let previousDatabaseUrl: string | undefined;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await seedContent(scratch.db);
    // Another owner's concept under the fixture's own topic, so only its
    // `owner_id` keeps it out of `local`'s graph.
    await scratch.db.insert(learner).values({ id: "someone-else" }).onConflictDoNothing();
    await scratch.db
      .insert(concept)
      .values({
        slug: "their-concept",
        title: "Their concept",
        topicSlug: TOPIC_SLUG,
        path: "learn/concepts/fixtures/their-concept.md",
        ownerId: "someone-else",
      })
      .onConflictDoNothing();
    previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = scratch.url;
    const [gradeRoute, dueRoute, store] = await Promise.all([
      import("./grade/route"),
      import("./due/route"),
      import("@gnosia/catalog/state"),
    ]);
    grade = gradeRoute.POST;
    due = dueRoute.GET;
    state = store;
  }, 60_000);

  afterAll(async () => {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    await scratch?.drop();
  });

  beforeEach(async () => {
    signedIn.value = true;
    store.broken = false;
    await clearTables(scratch.db, ["event", "mastery", "review"]);
  });

  const send = async (body: unknown, origin?: string | null) => {
    const response = await grade(post(body, origin));
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };

  it("answers a request with no session with a 401, and writes nothing", async () => {
    signedIn.value = false;
    const list = await due(new Request(`${ORIGIN}/api/review/due`));
    expect(list.status).toBe(401);
    const { status, body } = await send({ conceptId: "alpha", grade: 2 });
    expect(status).toBe(401);
    expect(body.error).toBe("UNAUTHENTICATED");
    expect(await state.readEvents(scratch.db)).toEqual([]);
  });

  it("refuses a grade on another owner's concept as though it were not there", async () => {
    // `assertReadableConcepts` reads under the grader's owner: a grade that
    // dropped the scope would find `their-concept` and write `local`'s card.
    const { status } = await send({ conceptId: "their-concept", grade: 2 });
    expect(status).toBe(400);
    expect(await state.readEvents(scratch.db)).toEqual([]);
  });

  it("refuses a grade from another origin, or with no origin at all", async () => {
    expect((await send({ conceptId: "alpha", grade: 2 }, "https://evil.example")).status).toBe(403);
    expect((await send({ conceptId: "alpha", grade: 2 }, null)).status).toBe(403);
    expect(await state.readEvents(scratch.db)).toEqual([]);
  });

  it.each([[-1], [4], [1.5], ["2"], [null]])("refuses rating %s as a 400", async (bad) => {
    const { status, body } = await send({ conceptId: "alpha", grade: bad });
    expect(status).toBe(400);
    expect(body.code).toBe("BAD_REQUEST");
  });

  it("answers a concept the catalog does not know with a 400, not a 503", async () => {
    const { status } = await send({ conceptId: "not-a-concept", grade: 2 });
    expect(status).toBe(400);
    expect(await state.readEvents(scratch.db)).toEqual([]);
  });

  it("records the rating on SM-2's scale, exactly as learn review grade would", async () => {
    const { status, body } = await send({ conceptId: "alpha", grade: 3 });
    expect(status).toBe(200);
    const result = body.result as Record<string, unknown>;
    expect(result).toMatchObject({ concept: "alpha", rating: 3, grade: 5, intervalDays: 1, lapses: 0, leech: false });

    const [event] = await state.readEvents(scratch.db);
    expect(event).toMatchObject({ type: "review", concept: "alpha", grade: 5, pLBefore: 0.25 });
    expect(event?.pLAfter).toBe(result.pL);
    expect((await state.readReviews(scratch.db)).cards.alpha?.due).toBe(result.due);
  });

  it("records a retried request once and says it was a replay", async () => {
    const first = await send({ conceptId: "alpha", grade: 2, requestId: "card-1" });
    // The retry asks for Easy; Good was recorded first, and Good is reported.
    const retry = await send({ conceptId: "alpha", grade: 3, requestId: "card-1" });
    expect(first.body.result).toMatchObject({ replayed: false, rating: 2, grade: 4 });
    expect(retry.body.result).toMatchObject({
      replayed: true,
      rating: 2,
      grade: 4,
      due: (first.body.result as { due: string }).due,
    });
    expect(await state.readEvents(scratch.db)).toHaveLength(1);
    expect((await send({ conceptId: "alpha", grade: 2, requestId: "no spaces" })).status).toBe(400);
  });

  it("records Again as a failed grade 1", async () => {
    await send({ conceptId: "alpha", grade: 2 });
    const { body } = await send({ conceptId: "alpha", grade: 0 });
    expect(body.result).toMatchObject({ rating: 0, grade: 1, lapses: 1, intervalDays: 1 });
    expect((await state.readEvents(scratch.db)).map((e) => e.grade)).toEqual([4, 1]);
  });

  it("lists what is due, with the focus first and the four intervals", async () => {
    await state.upsertReview(scratch.db, {
      conceptId: "beta",
      repetitions: 2,
      ease: 2.5,
      intervalDays: 6,
      lapses: 0,
      due: "2026-01-01T00:00:00.000Z",
      lastReviewed: "2025-12-26T00:00:00.000Z",
      leech: false,
      history: [],
    });
    const response = await due(new Request(`${ORIGIN}/api/review/due?concept=gamma`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as {
      ok: boolean;
      reachable: boolean;
      items: { conceptId: string; kind: string; prompt: string; intervals: number[]; checks: number }[];
    };
    expect(body.ok).toBe(true);
    expect(body.reachable).toBe(true);
    expect(body.items.map((i) => i.conceptId)).toEqual(["gamma", "beta"]);
    expect(body.items[0]).toMatchObject({ kind: "recall", prompt: "Recall: Gamma", intervals: [1, 1, 1, 1], checks: 0 });
    // SM-2 from 6 days at ease 2.5: Hard 2.36 x 6 = 14, Good 15, Easy 16,
    // then schedule.mjs's deterministic fuzz of up to a day either way. The
    // fuzz can put Hard past Good, and the buttons show it as it will be.
    expect(body.items[1]?.intervals).toEqual([1, 15, 14, 16]);
  });

  it("answers the due list the page renders when the catalog cannot be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    store.broken = true;
    try {
      const response = await due(new Request(`${ORIGIN}/api/review/due`));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, reachable: false, items: [], nextDue: null });
    } finally {
      warn.mockRestore();
    }
  });

  it("cuts a long queue at the session's limit and says more are due", async () => {
    const card = (conceptId: string) => ({
      conceptId,
      repetitions: 2,
      ease: 2.5,
      intervalDays: 6,
      lapses: 0,
      due: "2026-01-01T00:00:00.000Z",
      lastReviewed: "2025-12-26T00:00:00.000Z",
      leech: false,
      history: [],
    });
    for (const id of ["alpha", "beta", "gamma"]) await state.upsertReview(scratch.db, card(id));
    const { readReviewSession } = await import("@/lib/review-queue");
    const cut = await readReviewSession(null, new Date("2026-02-01T00:00:00.000Z"), null, 2);
    expect(cut.items).toHaveLength(2);
    expect(cut.more).toBe(true);
    const whole = await readReviewSession(null, new Date("2026-02-01T00:00:00.000Z"), null, 3);
    expect(whole.items).toHaveLength(3);
    expect(whole.more).toBeUndefined();
  });

  it("refuses an empty or oversized concept in the query", async () => {
    expect((await due(new Request(`${ORIGIN}/api/review/due?concept=`))).status).toBe(400);
    expect((await due(new Request(`${ORIGIN}/api/review/due?concept=${"x".repeat(200)}`))).status).toBe(400);
  });
});
