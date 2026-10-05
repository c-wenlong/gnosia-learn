import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { asset, assetDerivation, LOCAL_LEARNER_ID, ownerScope } from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { doctor } from "../src/commands/doctor";
import { posterId, uploadAssets } from "../src/content/asset-upload";
import { openBlobStore } from "../src/content/blob";
import { REPO_ROOT } from "../src/env";
import { runIndex } from "../src/index/run";
import { findFfmpeg } from "../src/poster/extract";
import { videosWithStoredPoster } from "../src/state/blobs";
import { manimkcStandIn, seedWithManimkc } from "./manimkc-standin";
import { migratedScratchDatabase, probe, type Scratch } from "./scratch-database";

/**
 * Every rendered video leaves `catalog import` with a poster (2026-10-05).
 *
 * Until then the import stored a render's bytes and left the poster to a
 * `catalog asset upload` someone had to remember, and a prune that deleted a
 * video took its poster's `asset_derivation` row with it (the cascade), so a
 * video that came back with the same id and bytes had a poster row the
 * Library could not find. Three remotionkc videos showed the grey placeholder
 * that way after 2026-10-04's prune.
 *
 * The first suite runs a real ffmpeg on a real mp4, which is what proves the
 * recipe's `format=yuvj420p` still turns a limited-range render into a JPEG;
 * it is skipped on a machine with no ffmpeg on `PATH`. The second uses the
 * suites' stand-in (vitest.setup.ts), since what it tests is the bookkeeping.
 */

const reachable = await probe();
const run = promisify(execFile);
const VIDEO = "manimkc:out/demo/one/one.mp4";
const POSTER = posterId(VIDEO);
const LOCAL = ownerScope(LOCAL_LEARNER_ID);
/** The real ffmpeg on PATH, ignoring the suites' FFMPEG_PATH stand-in. */
const realFfmpeg = await findFfmpeg({ PATH: process.env.PATH });

const SAVED = { manimkc: process.env.MANIMKC_ROOT, home: process.env.SELF_LEARN_HOME };

/**
 * The seed with the manimkc stand-in, and the two variables pointed at this
 * suite's own: the stand-in's CLI is found through `MANIMKC_ROOT`, and each
 * scratch database needs a blob store of its own (`SELF_LEARN_HOME`), since a
 * store belongs to the database that first wrote it.
 */
async function fixture(prefix: string, video: (dir: string) => Promise<Buffer>) {
  const work = await mkdtemp(path.join(tmpdir(), prefix));
  const tree = path.join(work, "tree");
  await seedWithManimkc(tree);
  const manimkc = path.join(work, "manimkc");
  const { videoFile } = await manimkcStandIn(manimkc, await video(work));
  process.env.MANIMKC_ROOT = manimkc;
  process.env.SELF_LEARN_HOME = path.join(work, "home");
  return { work, tree, manimkc, videoFile };
}

function restore(): void {
  for (const [key, value] of [["MANIMKC_ROOT", SAVED.manimkc], ["SELF_LEARN_HOME", SAVED.home]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe.skipIf(!reachable.ok || realFfmpeg === null)("catalog import with a real ffmpeg", () => {
  let scratch: Scratch;
  let work: string;
  let tree: string;
  let manimkc: string;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    ({ work, tree, manimkc } = await fixture("catalog-poster-real-", async (dir) => {
      // One second of the test pattern as limited-range yuv420p, the format a
      // render that is not manim's arrives in: mjpeg refuses it without the
      // recipe's `format=yuvj420p`.
      const file = path.join(dir, "pattern.mp4");
      await run(realFfmpeg as string, [
        "-nostdin", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=1:size=64x48:rate=10",
        "-pix_fmt", "yuv420p", "-color_range", "tv", file,
      ]);
      return readFile(file);
    }));
  }, 60_000);

  afterAll(async () => {
    restore();
    await scratch?.drop();
    if (work !== undefined) await rm(work, { recursive: true, force: true });
  });

  it("cuts and stores a JPEG poster derived from the render, in the import itself", async () => {
    const result = await runIndex(scratch.db, { repoRoot: tree, toolsRoot: REPO_ROOT, manimkcRoot: manimkc, ffmpeg: realFfmpeg });
    expect(result.sources.find((s) => s.source === "manimkc")?.notes).toContain(
      "1 poster(s) cut and stored, 0 linked to their video again",
    );
    expect(await videosWithStoredPoster(scratch.db, [VIDEO], LOCAL)).toEqual(new Set([VIDEO]));
    const [poster] = await scratch.db.select().from(asset).where(eq(asset.id, POSTER));
    expect(poster).toMatchObject({ kind: "poster", ownerId: LOCAL_LEARNER_ID, sourceRepo: "self-learn" });
    expect(poster?.blobKey).toMatch(/^local\/[0-9a-f]{64}\.jpg$/);
    const read = await openBlobStore().get(poster?.blobKey as string);
    const chunks: Buffer[] = [];
    for await (const chunk of read.body) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks);
    // A JPEG starts with SOI.
    expect([...body.subarray(0, 2)]).toEqual([0xff, 0xd8]);
    expect((await doctor(scratch.db, "scratch")).posters.videosWithout).toEqual([]);
  });
});

describe.skipIf(!reachable.ok)("every video leaves catalog import with a poster", () => {
  let scratch: Scratch;
  let work: string;
  let tree: string;
  let manimkc: string;
  const derivedFrom = async () =>
    (await scratch.db.select().from(assetDerivation).where(eq(assetDerivation.assetId, POSTER))).map((d) => d.sourceAssetId);
  const posterRevisions = async () =>
    Number(
      (
        await scratch.db.execute<{ n: string }>(
          sql`select count(*) as n from content_revision where entity_type = 'asset' and entity_id = ${POSTER}`,
        )
      ).rows[0]?.n,
    );
  const importTree = (ffmpeg?: string | null) =>
    runIndex(scratch.db, {
      repoRoot: tree,
      toolsRoot: REPO_ROOT,
      manimkcRoot: manimkc,
      ...(ffmpeg === undefined ? {} : { ffmpeg }),
    });

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    ({ work, tree, manimkc } = await fixture("catalog-poster-import-", async () => Buffer.from("a render")));
  }, 60_000);

  afterAll(async () => {
    restore();
    await scratch?.drop();
    if (work !== undefined) await rm(work, { recursive: true, force: true });
  });

  it("fails loudly, naming ffmpeg, when there is none to cut with, and writes the rest", async () => {
    await expect(importTree(null)).rejects.toThrow(
      /1 manimkc video\(s\) have no poster \(manimkc:out\/demo\/one\/one\.mp4\): ffmpeg was not found; set FFMPEG_PATH or put ffmpeg on PATH\..*run the import again/,
    );
    // The rows landed; the poster did not, and the doctor says so.
    expect((await scratch.db.select().from(asset).where(eq(asset.id, VIDEO))).length).toBe(1);
    const report = await doctor(scratch.db, "scratch");
    expect(report.posters.videosWithout).toEqual([{ id: VIDEO, sourceRepo: "manimkc" }]);
  });

  it("cuts what is missing on the next import with ffmpeg, and the doctor finds nothing", async () => {
    const result = await importTree();
    expect(result.sources.find((s) => s.source === "manimkc")?.notes).toContain(
      "1 poster(s) cut and stored, 0 linked to their video again",
    );
    expect(await derivedFrom()).toEqual([VIDEO]);
    const report = await doctor(scratch.db, "scratch");
    expect(report.posters).toEqual({ videosWithout: [], unlinked: [] });
    // And again: nothing to cut, nothing said.
    const again = await importTree();
    expect(again.sources.find((s) => s.source === "manimkc")?.notes.some((n) => n.includes("poster(s) cut"))).toBe(false);
  });

  it("links the poster again when a prune and a re-import bring its video back", async () => {
    const [before] = await scratch.db.select().from(asset).where(eq(asset.id, POSTER));
    const revisions = await posterRevisions();
    // What 2026-10-04's prune did: the video row deleted, and with it, by the
    // foreign key's cascade, the poster's derivation. The poster row lives
    // outside the `manimkc:` namespace, so it stays, linked to nothing.
    await scratch.db.delete(asset).where(eq(asset.id, VIDEO));
    expect(await derivedFrom()).toEqual([]);
    const orphaned = await doctor(scratch.db, "scratch");
    expect(orphaned.posters.unlinked).toEqual([POSTER]);

    const result = await importTree();
    expect(result.sources.find((s) => s.source === "manimkc")?.notes).toContain(
      "0 poster(s) cut and stored, 1 linked to their video again",
    );
    // The card has its poster again: the same picture, the same row, and no
    // revision appended, since the poster's history already records the link.
    expect(await videosWithStoredPoster(scratch.db, [VIDEO], LOCAL)).toEqual(new Set([VIDEO]));
    expect(await derivedFrom()).toEqual([VIDEO]);
    const [after] = await scratch.db.select().from(asset).where(eq(asset.id, POSTER));
    expect(after?.blobKey).toBe(before?.blobKey);
    expect(await posterRevisions()).toBe(revisions);
    expect((await doctor(scratch.db, "scratch")).posters).toEqual({ videosWithout: [], unlinked: [] });
  });

  it("has the upload link a poster the cascade left behind, and say linked, not made", async () => {
    // The same cascade, mended by `catalog asset upload` alone, as the owner
    // runs it: before, it planned "made" every run and wrote nothing.
    await scratch.db.delete(assetDerivation).where(eq(assetDerivation.assetId, POSTER));
    const upload = () =>
      uploadAssets(scratch.db, {
        store: openBlobStore(),
        repoRoot: REPO_ROOT,
        manimkcRoot: manimkc,
        ffmpeg: process.env.FFMPEG_PATH as string,
      });
    const first = await upload();
    expect(first.items.find((i) => i.id === POSTER)?.action).toBe("linked");
    expect(first.rowsWritten).toBe(1);
    expect(await derivedFrom()).toEqual([VIDEO]);
    const second = await upload();
    expect(second.items.find((i) => i.id === POSTER)?.action).toBe("present");
    expect(second.rowsWritten).toBe(0);
  });
});
