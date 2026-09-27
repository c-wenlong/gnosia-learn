import { asset } from "@self-learn/schema";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { applyMigrations } from "../src/migrations";
import { assetBlobs, posterBlob } from "../src/state/blobs";
import { partialMigrations } from "./partial-migrations";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";

/**
 * The blob readers against a database still at 0009, which is where the
 * owner's is until they run `catalog migrate`: no `blob_object`, no
 * `asset.blob_key`. They answer "no blob", so the asset routes fall through to
 * the legacy file as they did before the blob store, instead of every video
 * answering `catalog-unreachable`. Found by `npm run e2e`, whose template is
 * that database.
 */

const reachable = await probe();

/** Migrations up to and including 0009. */
const THROUGH_0009 = 10;

describe.skipIf(!reachable.ok)("blob readers before migration 0010", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db, { folder: await partialMigrations(THROUGH_0009) });
    // Only the columns 0009 has; the typed insert would name blob_key.
    await scratch.db.execute(
      sql`insert into ${asset} (id, kind, path, source_repo) values ('manimkc:out/a.mp4', 'video', 'out/a.mp4', 'manimkc')`,
    );
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  it("finds no blob for an asset, and no stored poster, and says to migrate once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await assetBlobs(scratch.db, ["manimkc:out/a.mp4"])).toEqual(new Map());
    expect(await posterBlob(scratch.db, "manimkc:out/a.mp4")).toBeNull();
    expect(warn.mock.calls.filter(([line]) => String(line).includes("migrate"))).toHaveLength(1);
    warn.mockRestore();
  });
});
