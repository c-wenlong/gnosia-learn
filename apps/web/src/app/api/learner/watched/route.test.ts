import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { asset, learner } from "@hermes/schema";

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
import { storedBlob } from "../../../../../../../services/catalog/test/stored-blob";

// A signed-in request, so the owner seam (`@/lib/owner`) resolves `local`.
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));

/**
 * `POST /api/learner/watched`, against a scratch database.
 *
 * Its own file rather than a case in `../routes.test.ts`: it needs the asset
 * fixture as well as the content one, and `learner-store` reads
 * `DATABASE_URL` once per module graph, so the import has to follow the
 * scratch database being made (see the note at the top of that file).
 */

const reachable = await probe();

const ORIGIN = "http://localhost:3000";

function request(body: unknown, origin: string | null = ORIGIN): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json", host: "localhost:3000" };
  if (origin !== null) headers.origin = origin;
  return new Request(`${ORIGIN}/api/learner/watched`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe.skipIf(!reachable.ok)("POST /api/learner/watched", () => {
  let scratch: Scratch;
  let POST: (req: Request) => Promise<Response>;
  let readEvents: typeof import("@hermes/catalog/state").readEvents;

  let previousDatabaseUrl: string | undefined;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await seedContent(scratch.db);
    await seedAssets(scratch.db);
    // Another owner's asset: the scope the turn looks it up under must not
    // reach it.
    await scratch.db.insert(learner).values({ id: "someone-else" }).onConflictDoNothing();
    await scratch.db
      .insert(asset)
      .values({
        id: "fx:theirs",
        kind: "video",
        path: "out/theirs/theirs.mp4",
        sourceRepo: "manimkc",
        ownerId: "someone-else",
        blobKey: await storedBlob(scratch.db, "fx:theirs", "mp4"),
      })
      .onConflictDoNothing();
    previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = scratch.url;
    const [route, state] = await Promise.all([import("./route"), import("@hermes/catalog/state")]);
    POST = route.POST;
    readEvents = state.readEvents;
  }, 60_000);

  afterAll(async () => {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    await scratch?.drop();
  });

  beforeEach(async () => {
    await clearTables(scratch.db, ["event"]);
  });

  const call = async (body: unknown, origin?: string | null) => {
    const response = await POST(request(body, origin));
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };

  it("appends one watched event naming the asset and its kind, and no concept", async () => {
    const { status, body } = await call({ assetId: ASSETS.video });
    expect(status).toBe(200);
    const result = body.result as { assetId: string; at: string };
    expect(result.assetId).toBe(ASSETS.video);

    const events = await readEvents(scratch.db);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ at: result.at, type: "watched", asset: ASSETS.video, kind: "video" });
    expect(events[0]).not.toHaveProperty("concept");
  });

  it("appends again on a second press, since watching twice is two events", async () => {
    await call({ assetId: ASSETS.diagram });
    await call({ assetId: ASSETS.diagram });
    expect((await readEvents(scratch.db)).map((e) => e.type)).toEqual(["watched", "watched"]);
  });

  it("refuses another owner's asset as though it were not there, appending nothing", async () => {
    // `assetsByIds` reads under the request's owner scope: a press that
    // dropped the scope would find `fx:theirs` and log `local`'s watch on it.
    const { status, body } = await call({ assetId: "fx:theirs" });
    expect(status).toBe(400);
    expect(body.error).toMatch(/no asset/);
    expect(await readEvents(scratch.db)).toEqual([]);
  });

  it("refuses an id no row has, as the caller's mistake and not the database's", async () => {
    const { status, body } = await call({ assetId: "fx:gone" });
    expect(status).toBe(400);
    expect(body.error).toMatch(/no asset in the catalog for "fx:gone"/);
    expect(await readEvents(scratch.db)).toEqual([]);
  });

  it("refuses a missing, empty or oversized id", async () => {
    expect((await call({})).status).toBe(400);
    expect((await call({ assetId: "  " })).status).toBe(400);
    expect((await call({ assetId: 42 })).status).toBe(400);
    expect((await call({ assetId: `x:${"a".repeat(600)}` })).status).toBe(400);
    expect(await readEvents(scratch.db)).toEqual([]);
  });

  it("refuses a request that did not come from a page on this host", async () => {
    expect((await call({ assetId: ASSETS.video }, "https://evil.example")).status).toBe(403);
    expect(await readEvents(scratch.db)).toEqual([]);
  });
});
