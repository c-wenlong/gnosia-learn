import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearTables,
  migratedScratchDatabase,
  probe,
  type Scratch,
} from "../../../../../../../services/catalog/test/scratch-database";
import {
  ASSETS,
  seedAssets,
  seedContent,
} from "../../../../../../../services/catalog/test/state-fixture";

// A signed-in request, so the owner seam (`@/lib/owner`) resolves `local`.
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));

/**
 * `POST /api/learner/playback`, against a scratch database. Its own file for
 * the reason `../watched/route.test.ts` gives: the import has to follow the
 * scratch database being made.
 */

const reachable = await probe();

const ORIGIN = "http://localhost:3000";

function request(body: unknown, origin: string | null = ORIGIN): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json", host: "localhost:3000" };
  if (origin !== null) headers.origin = origin;
  return new Request(`${ORIGIN}/api/learner/playback`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe.skipIf(!reachable.ok)("POST /api/learner/playback", () => {
  let scratch: Scratch;
  let POST: (req: Request) => Promise<Response>;
  let state: typeof import("@gnosia/catalog/state");

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await seedContent(scratch.db);
    await seedAssets(scratch.db);
    process.env.DATABASE_URL = scratch.url;
    const [route, loaded] = await Promise.all([import("./route"), import("@gnosia/catalog/state")]);
    POST = route.POST;
    state = loaded;
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  beforeEach(async () => {
    await clearTables(scratch.db, ["event"]);
    await state.clearPreference(scratch.db, `playback:${ASSETS.video}`);
  });

  const call = async (body: unknown, origin?: string | null) => {
    const response = await POST(request(body, origin));
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };

  it("stores the position and the ranges, and appends nothing below the threshold", async () => {
    const { status, body } = await call({ assetId: ASSETS.video, position: 40, duration: 100, ranges: [[0, 40]] });
    expect(status).toBe(200);
    expect(body.result).toMatchObject({ coverage: 0.4, watchedAt: null, crossed: false });

    const stored = (await state.readPreference(scratch.db, `playback:${ASSETS.video}`)) as Record<string, unknown>;
    expect(stored).toMatchObject({ position: 40, duration: 100, ranges: [[0, 40]] });
    expect(await state.readEvents(scratch.db)).toEqual([]);
  });

  it("appends one watched event when saves together cross the threshold, and none after", async () => {
    await call({ assetId: ASSETS.video, position: 50, duration: 100, ranges: [[0, 50]] });
    const crossing = await call({ assetId: ASSETS.video, position: 92, duration: 100, ranges: [[50, 92]] });
    expect(crossing.body.result).toMatchObject({ crossed: true, position: 92 });
    expect((crossing.body.result as { watchedDay: string }).watchedDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await call({ assetId: ASSETS.video, position: 100, duration: 100, ranges: [[92, 100]] });

    const events = await state.readEvents(scratch.db);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "watched", asset: ASSETS.video, kind: "video" });
  });

  it("merges two saves in flight together, and appends one event when both cross", async () => {
    await call({ assetId: ASSETS.video, position: 80, duration: 100, ranges: [[0, 80]] });
    await Promise.all([
      call({ assetId: ASSETS.video, position: 90, duration: 100, ranges: [[80, 90]] }),
      call({ assetId: ASSETS.video, position: 95, duration: 100, ranges: [[80, 95]] }),
    ]);
    const stored = (await state.readPreference(scratch.db, `playback:${ASSETS.video}`)) as { ranges: number[][] };
    expect(stored.ranges).toEqual([[0, 95]]);
    expect(await state.readEvents(scratch.db)).toHaveLength(1);
  });

  it("does not count a scrub to the end as watching", async () => {
    await call({ assetId: ASSETS.video, position: 99, duration: 100, ranges: [[0, 3], [97, 99]] });
    expect(await state.readEvents(scratch.db)).toEqual([]);
  });

  it("refuses an asset that is not a video, and one no row has", async () => {
    const diagram = await call({ assetId: ASSETS.diagram, position: 1, duration: 10, ranges: [] });
    expect(diagram.status).toBe(400);
    expect(diagram.body.error).toMatch(/not a video/);
    expect((await call({ assetId: "fx:gone", position: 1, duration: 10 })).status).toBe(400);
  });

  it("refuses malformed numbers and ranges", async () => {
    const base = { assetId: ASSETS.video, position: 1, duration: 10 };
    expect((await call({ ...base, duration: 0 })).status).toBe(400);
    expect((await call({ ...base, position: -1 })).status).toBe(400);
    expect((await call({ ...base, position: "1" })).status).toBe(400);
    expect((await call({ ...base, ranges: [[0, "1"]] })).status).toBe(400);
    expect((await call({ ...base, ranges: "0-1" })).status).toBe(400);
  });

  it("refuses a request that did not come from a page on this host", async () => {
    const body = { assetId: ASSETS.video, position: 1, duration: 10, ranges: [[0, 1]] };
    expect((await call(body, "https://evil.example")).status).toBe(403);
  });
});
