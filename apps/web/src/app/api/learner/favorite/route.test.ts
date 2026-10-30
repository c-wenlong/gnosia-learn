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
 * `POST /api/learner/favorite`, against a scratch database. Its own file for
 * the reason `../watched/route.test.ts` gives: the import has to follow the
 * scratch database being made.
 */

const reachable = await probe();

const ORIGIN = "http://localhost:3000";

function request(body: unknown, origin: string | null = ORIGIN): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json", host: "localhost:3000" };
  if (origin !== null) headers.origin = origin;
  return new Request(`${ORIGIN}/api/learner/favorite`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe.skipIf(!reachable.ok)("POST /api/learner/favorite", () => {
  let scratch: Scratch;
  let POST: (req: Request) => Promise<Response>;
  let state: typeof import("@gnosia/catalog/state");
  let favorite: typeof import("@gnosia/tutor/favorite");

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await seedContent(scratch.db);
    await seedAssets(scratch.db);
    process.env.DATABASE_URL = scratch.url;
    const [route, loaded, lib] = await Promise.all([
      import("./route"),
      import("@gnosia/catalog/state"),
      import("@gnosia/tutor/favorite"),
    ]);
    POST = route.POST;
    state = loaded;
    favorite = lib;
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  beforeEach(async () => {
    await clearTables(scratch.db, ["preference"]);
  });

  const call = async (body: unknown, origin?: string | null) => {
    const response = await POST(request(body, origin));
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };

  const stored = async (id: string) =>
    favorite.parseFavorite(await state.readPreference(scratch.db, favorite.favoriteKey(id)));

  it("stars an asset with the time, and unstarring clears the row", async () => {
    const on = await call({ assetId: ASSETS.video, favorite: true });
    expect(on.status).toBe(200);
    expect(on.body.result).toMatchObject({ assetId: ASSETS.video, favorite: true });
    const star = await stored(ASSETS.video);
    expect(star?.at).toBe((on.body.result as { at: string }).at);

    const off = await call({ assetId: ASSETS.video, favorite: false });
    expect(off.body.result).toMatchObject({ favorite: false, at: null });
    expect(await state.readPreference(scratch.db, favorite.favoriteKey(ASSETS.video))).toBeUndefined();
  });

  it("stars any kind of asset, not only a video", async () => {
    expect((await call({ assetId: ASSETS.diagram, favorite: true })).status).toBe(200);
    expect(await stored(ASSETS.diagram)).not.toBeNull();
  });

  it("refuses an asset the catalog does not have, and a malformed body, storing nothing", async () => {
    const unknown = await call({ assetId: "fx:nope", favorite: true });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toMatch(/no asset/);
    for (const body of [{ favorite: true }, { assetId: ASSETS.video }, { assetId: ASSETS.video, favorite: "yes" }]) {
      expect((await call(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(await stored(ASSETS.video)).toBeNull();
  });

  it("refuses a request from another origin", async () => {
    expect((await call({ assetId: ASSETS.video, favorite: true }, "https://evil.example")).status).toBe(403);
    expect(await stored(ASSETS.video)).toBeNull();
  });
});
