import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearTables,
  migratedScratchDatabase,
  probe,
  type Scratch,
} from "../../../../../../services/catalog/test/scratch-database";
import { seedContent } from "../../../../../../services/catalog/test/state-fixture";

// A signed-in request, so the owner seam (`@/lib/owner`) resolves `local`.
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));

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
  let state: typeof import("@self-learn/catalog/state");

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await seedContent(scratch.db);
    process.env.DATABASE_URL = scratch.url;
    const [gradeRoute, dueRoute, store] = await Promise.all([
      import("./grade/route"),
      import("./due/route"),
      import("@self-learn/catalog/state"),
    ]);
    grade = gradeRoute.POST;
    due = dueRoute.GET;
    state = store;
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  beforeEach(async () => {
    await clearTables(scratch.db, ["event", "mastery", "review"]);
  });

  const send = async (body: unknown, origin?: string | null) => {
    const response = await grade(post(body, origin));
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };

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

  it("refuses an empty or oversized concept in the query", async () => {
    expect((await due(new Request(`${ORIGIN}/api/review/due?concept=`))).status).toBe(400);
    expect((await due(new Request(`${ORIGIN}/api/review/due?concept=${"x".repeat(200)}`))).status).toBe(400);
  });
});
