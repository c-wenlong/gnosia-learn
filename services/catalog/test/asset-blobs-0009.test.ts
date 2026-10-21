import { asset } from "@gnosia/schema";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { applyMigrations } from "../src/migrations";
import { assetsByIds, assetsForTopic, conceptSummaries, listAssets, topicTitles } from "../src/state";
import { assetBlobs, posterBlob } from "../src/state/blobs";
import { partialMigrations } from "./partial-migrations";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";
import { LOCAL_LEARNER_ID, ownerScope } from "@gnosia/schema";

/** Who these reads are for: the one owner there is today (phase 4 scoping). */
const LOCAL = ownerScope(LOCAL_LEARNER_ID);

/**
 * The blob readers, and the owner-scoped reads, against a database still at 0009, which is where the
 * owner's is until they run `catalog migrate`: no `blob_object`, no
 * `asset.blob_key`. They answer "no blob", so the asset routes fall through to
 * the legacy file as they did before the blob store, instead of every video
 * answering `catalog-unreachable`. Found by `npm run e2e`, whose template is
 * that database.
 */

const reachable = await probe();

/** Migrations up to and including 0009. */
const THROUGH_0009 = 10;

describe.skip("blob readers and scoped reads before migration 0010" /* SQLite ships one foundation migration; a pre-0010 schema is only reachable through pg-to-sqlite.mjs. */, () => {
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
    expect(await assetBlobs(scratch.db, ["manimkc:out/a.mp4"], LOCAL)).toEqual(new Map());
    expect(await posterBlob(scratch.db, "manimkc:out/a.mp4", LOCAL)).toBeNull();
    expect(warn.mock.calls.filter(([line]) => String(line).includes("migrate"))).toHaveLength(1);
    warn.mockRestore();
  });

  /**
   * `owner_id` arrived with 0010 too, and the asset and concept reads the
   * pages make are scoped by it (phase 4). A database without the column holds
   * one owner's rows by construction, so they read it unscoped, as before,
   * rather than failing on every page until flip day migrates it.
   */
  it("reads assets, topics and concepts unscoped, since a database with no owner_id has one owner", async () => {
    await scratch.db.execute(sql`insert into topic (slug, title, domain) values ('fx-topic', 'Fixture topic', 'fx')`);
    await scratch.db.execute(
      sql`insert into concept (slug, title, topic_slug, path) values ('fx-concept', 'Fixture concept', 'fx-topic', 'learn/concepts/fx/fx-concept.md')`,
    );
    await scratch.db.execute(sql`insert into asset_topic (asset_id, topic_slug) values ('manimkc:out/a.mp4', 'fx-topic')`);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await listAssets(scratch.db, {}, LOCAL)).map((a) => a.id)).toEqual(["manimkc:out/a.mp4"]);
    expect(await assetsByIds(scratch.db, ["manimkc:out/a.mp4"], LOCAL)).toHaveLength(1);
    expect((await assetsForTopic(scratch.db, "fx-topic", LOCAL)).map((a) => a.id)).toEqual(["manimkc:out/a.mp4"]);
    expect(await topicTitles(scratch.db, ["fx-topic"], LOCAL)).toEqual({ "fx-topic": "Fixture topic" });
    expect((await conceptSummaries(scratch.db, LOCAL)).map((c) => c.conceptId)).toEqual(["fx-concept"]);
    expect(warn.mock.calls.filter(([line]) => String(line).includes("predates owner_id"))).toHaveLength(1);
    warn.mockRestore();
  });
});
