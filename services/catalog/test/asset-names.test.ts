import { asset, assetName, COMMONS_OWNER, learner, LOCAL_LEARNER_ID, ownerScope } from "@gnosia/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runSearch } from "../src/commands/search";
import { updateSet } from "../src/content/upsert";
import { applyMigrations } from "../src/migrations";
import { listVideos } from "../src/content/videos";
import { assetsByIds, listAssets, readAssetNaming, StateError, writeAssetName } from "../src/state";
import { partialMigrations } from "./partial-migrations";
import { createScratchDatabase, migratedScratchDatabase, probe, type Scratch, sqlstate } from "./scratch-database";
import { storedBlob } from "./stored-blob";

/**
 * `asset_name`: a learner's own name for an asset.
 *
 * Held here: every `AssetRef` read shows the learner's name in place of the
 * source's title, and only to that learner; an import writing the asset row
 * again does not undo it; a prune and a re-import under the same id keep it;
 * clearing it, or naming the asset what its source calls it, brings the
 * source's title back; and the writer refuses an asset the learner cannot
 * read, a name too long, and the table refuses a blank or padded one.
 */

const reachable = await probe();
const OTHER = "owner-b";
const MINE = "link:mine";
const COMMONS = "link:commons";

/** A link row, which needs no blob: the one kind a scratch database can hold bare. */
function link(id: string, ownerId: string, title: string | null) {
  return { id, kind: "link", url: `https://example.com/${id}`, title, sourceRepo: "gnosia", ownerId };
}

/** Write the row the way `catalog import` does: every column from the source, by `updateSet`. */
async function reimport(scratch: Scratch, row: ReturnType<typeof link>) {
  await scratch.db.insert(asset).values(row).onConflictDoUpdate({ target: asset.id, set: updateSet(asset) });
}

describe.skipIf(!reachable.ok)("asset_name", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await scratch.db
      .insert(learner)
      .values([{ id: LOCAL_LEARNER_ID }, { id: OTHER }, { id: COMMONS_OWNER }])
      .onConflictDoNothing();
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  beforeEach(async () => {
    await scratch.db.delete(assetName);
    await scratch.db.delete(asset);
    await scratch.db.insert(asset).values([link(MINE, LOCAL_LEARNER_ID, "lec03 v2 final"), link(COMMONS, COMMONS_OWNER, null)]);
  });

  it("shows the learner's name in every read, and only to that learner", async () => {
    const saved = await writeAssetName(scratch.db, MINE, "  Master   theorem\twalkthrough ", LOCAL_LEARNER_ID);
    expect(saved).toEqual({ title: "Master theorem walkthrough", name: "Master theorem walkthrough", original: "lec03 v2 final" });

    const [byId] = await assetsByIds(scratch.db, [MINE], ownerScope(LOCAL_LEARNER_ID));
    expect(byId?.title).toBe("Master theorem walkthrough");
    const listed = await listAssets(scratch.db, {}, ownerScope(LOCAL_LEARNER_ID));
    expect(listed.find((row) => row.id === MINE)?.title).toBe("Master theorem walkthrough");

    // A commons asset can be named too, and the name is the namer's alone.
    await writeAssetName(scratch.db, COMMONS, "Shared reading", OTHER);
    const [mine] = await assetsByIds(scratch.db, [COMMONS], ownerScope(LOCAL_LEARNER_ID));
    const [theirs] = await assetsByIds(scratch.db, [COMMONS], ownerScope(OTHER));
    expect(mine?.title).toBeNull();
    expect(theirs?.title).toBe("Shared reading");
  });

  it("survives an import writing the row again, and follows a changed source title only once cleared", async () => {
    await writeAssetName(scratch.db, MINE, "Master theorem", LOCAL_LEARNER_ID);
    await reimport(scratch, link(MINE, LOCAL_LEARNER_ID, "lec03 v3"));

    expect(await readAssetNaming(scratch.db, MINE, LOCAL_LEARNER_ID)).toEqual({
      title: "Master theorem",
      name: "Master theorem",
      original: "lec03 v3",
    });

    expect(await writeAssetName(scratch.db, MINE, "", LOCAL_LEARNER_ID)).toEqual({ title: "lec03 v3", name: null, original: "lec03 v3" });
    const [row] = await assetsByIds(scratch.db, [MINE], ownerScope(LOCAL_LEARNER_ID));
    expect(row?.title).toBe("lec03 v3");
  });

  it("keeps the name through a prune and a re-import under the same id", async () => {
    await writeAssetName(scratch.db, MINE, "Master theorem", LOCAL_LEARNER_ID);
    await scratch.db.delete(asset).where(eq(asset.id, MINE));
    expect(await readAssetNaming(scratch.db, MINE, LOCAL_LEARNER_ID)).toBeNull();

    await reimport(scratch, link(MINE, LOCAL_LEARNER_ID, "lec03 v2 final"));
    const [row] = await assetsByIds(scratch.db, [MINE], ownerScope(LOCAL_LEARNER_ID));
    expect(row?.title).toBe("Master theorem");
  });

  it("stores a name equal to the source's title as no name", async () => {
    await writeAssetName(scratch.db, MINE, "Master theorem", LOCAL_LEARNER_ID);
    const back = await writeAssetName(scratch.db, MINE, " lec03 v2 final ", LOCAL_LEARNER_ID);
    expect(back).toEqual({ title: "lec03 v2 final", name: null, original: "lec03 v2 final" });
    expect(await scratch.db.select().from(assetName)).toEqual([]);
  });

  it("refuses an asset the learner cannot read, and one that does not exist", async () => {
    await scratch.db.insert(asset).values(link("link:theirs", OTHER, "Theirs"));
    await expect(writeAssetName(scratch.db, "link:theirs", "Mine now", LOCAL_LEARNER_ID)).rejects.toThrow(StateError);
    await expect(writeAssetName(scratch.db, "link:nowhere", "Anything", LOCAL_LEARNER_ID)).rejects.toThrow(StateError);
    expect(await readAssetNaming(scratch.db, "link:theirs", LOCAL_LEARNER_ID)).toBeNull();
    expect(await scratch.db.select().from(assetName)).toEqual([]);
  });

  it("refuses a name past the limit in the writer, and a blank or padded one in the table", async () => {
    await expect(writeAssetName(scratch.db, MINE, "x".repeat(201), LOCAL_LEARNER_ID)).rejects.toThrow(RangeError);
    for (const title of ["", " padded", "two  spaces", "line\nbreak", "x".repeat(201)]) {
      const error = await scratch.db
        .insert(assetName)
        .values({ learnerId: LOCAL_LEARNER_ID, assetId: MINE, title })
        .then(() => null, (caught: unknown) => caught);
      expect(sqlstate(error), JSON.stringify(title)).toBe("23514");
    }
  });

  it("names a tool's render in the studio's video list", async () => {
    const render = "manimkc:out/algorithms/cs3230/lec03.mp4";
    await scratch.db.insert(asset).values({
      id: render,
      kind: "video",
      path: "out/algorithms/cs3230/lec03.mp4",
      blobKey: await storedBlob(scratch.db, render, "mp4"),
      title: "lec03",
      sourceRepo: "manimkc",
      ownerId: LOCAL_LEARNER_ID,
    });
    await writeAssetName(scratch.db, render, "Master theorem", LOCAL_LEARNER_ID);
    const listed = await listVideos(scratch.db, ownerScope(LOCAL_LEARNER_ID));
    expect(listed.find((video) => video.assetId === render)?.title).toBe("Master theorem");
  });
  it("finds a renamed asset in `catalog search` by either name, listed under the new one", async () => {
    await writeAssetName(scratch.db, MINE, "Master theorem", LOCAL_LEARNER_ID);
    const saved = process.env["DATABASE_URL"];
    process.env["DATABASE_URL"] = scratch.url;
    try {
      for (const term of ["master theorem", "lec03 v2"]) {
        const hit = (await runSearch(term)).hits.find((h) => h.id === MINE);
        expect(hit?.title, term).toBe("Master theorem");
      }
    } finally {
      if (saved === undefined) delete process.env["DATABASE_URL"];
      else process.env["DATABASE_URL"] = saved;
    }
  });
});

describe.skipIf(!reachable.ok)("asset reads before 0024", () => {
  let behind: Scratch;

  beforeAll(async () => {
    behind = await createScratchDatabase();
    // The pre-0024 shape under the one-shot SQLite migration: every table,
    // minus `asset_name`, which the pre-name code paths probe for.
    await applyMigrations(behind.db);
    await behind.db.execute(sql`drop table asset_name`);
    await behind.db.insert(learner).values({ id: LOCAL_LEARNER_ID }).onConflictDoNothing();
    await behind.db.insert(asset).values(link(MINE, LOCAL_LEARNER_ID, "lec03 v2 final"));
  }, 60_000);

  afterAll(async () => {
    await behind?.drop();
  });

  it("lists assets under the source's title, offers no name, and refuses to write one", async () => {
    const listed = await listAssets(behind.db, {}, ownerScope(LOCAL_LEARNER_ID));
    expect(listed.map((row) => row.title)).toEqual(["lec03 v2 final"]);
    expect(await readAssetNaming(behind.db, MINE, LOCAL_LEARNER_ID)).toBeNull();
    await expect(writeAssetName(behind.db, MINE, "Master theorem", LOCAL_LEARNER_ID)).rejects.toThrow(/catalog -- migrate/);
  });
});
