import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { fsStore, key as blobKey, type BlobStore } from "@self-learn/blob";
import { asset, assetDerivation, blobObject, contentRevision, type NewAsset } from "@self-learn/schema";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { posterId, uploadAssets, type AssetUploadOptions } from "../src/content/asset-upload";
import { auditBlobs, AUDIT_GRACE_MS } from "../src/content/blob-audit";
import { keepBlobKeys } from "../src/index/blob-keys";
import type { TopicsReport } from "../src/index/manimkc";
import { applyMigrations } from "../src/migrations";
import { createScratchDatabase, probe, type Scratch } from "./scratch-database";

/**
 * `catalog asset upload --source manimkc` and `catalog blob audit`
 * (docs/CONTENT-MIGRATION.md, Track E; edge cases 5 and 9), against a scratch
 * database, a scratch manimkc data root and a scratch `fs` blob store. The
 * report is captured rather than spawned, the way the indexer's own tests feed
 * it, and ffmpeg is a shell script that prints a fixed JPEG, so the poster path
 * runs the same on a machine with no ffmpeg.
 */

const reachable = await probe();

const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

const VIDEO = Buffer.from(Array.from({ length: 4_000 }, (_, i) => (i * 7) % 251));
const TRANSCRIPT = Buffer.from('{"cues":[]}');
const VTT = Buffer.from("WEBVTT\n");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);

const VIDEO_PATH = "out/algorithms/demo/demo.mp4";
const TRANSCRIPT_PATH = "out/algorithms/demo/demo.transcript.json";
const VTT_PATH = "out/algorithms/demo/demo.vtt";
const VIDEO_ID = `manimkc:${VIDEO_PATH}`;
const TRANSCRIPT_ID = `manimkc:${TRANSCRIPT_PATH}`;
const VTT_ID = `manimkc:${VTT_PATH}`;

describe.skipIf(!reachable.ok)("catalog asset upload and blob audit", () => {
  let scratch: Scratch;
  let base: string;
  let outRoot: string;
  let blobRoot: string;
  let store: BlobStore;
  let ffmpeg: string;

  const report = (): TopicsReport => ({
    outRoot,
    topics: [
      {
        path: "algorithms/demo",
        sections: [
          {
            section: "main",
            deliverable: {
              path: VIDEO_PATH,
              exists: true,
              sidecars: {
                transcript: { path: TRANSCRIPT_PATH, exists: true },
                vtt: { path: VTT_PATH, exists: true },
                chapters: { path: "out/algorithms/demo/demo.chapters.json", exists: false },
              },
            },
          },
        ],
      },
    ],
    drift: {},
  });

  const options = (extra: Partial<AssetUploadOptions> = {}): AssetUploadOptions => ({
    store,
    repoRoot: base,
    manimkcRoot: outRoot,
    ffmpeg,
    report: report(),
    ...extra,
  });

  const row = (id: string, kind: string, file: string, bytes: Buffer): NewAsset => ({
    id,
    kind,
    path: file,
    url: null,
    contentHash: sha256(bytes),
    bytes: bytes.length,
    title: `Demo (${kind})`,
    sourceRepo: "manimkc",
  });

  /** The three rows `catalog index --only manimkc` would have written for the fixture. */
  const seedIndexed = async () => {
    await scratch.db
      .insert(asset)
      .values([
        row(VIDEO_ID, "video", VIDEO_PATH, VIDEO),
        row(TRANSCRIPT_ID, "transcript", TRANSCRIPT_PATH, TRANSCRIPT),
        row(VTT_ID, "captions", VTT_PATH, VTT),
      ]);
    await scratch.db.insert(assetDerivation).values([
      { assetId: TRANSCRIPT_ID, sourceAssetId: VIDEO_ID },
      { assetId: VTT_ID, sourceAssetId: VIDEO_ID },
    ]);
  };

  const writeFixture = async () => {
    const dir = path.join(outRoot, "out", "algorithms", "demo");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "demo.mp4"), VIDEO);
    await writeFile(path.join(dir, "demo.transcript.json"), TRANSCRIPT);
    await writeFile(path.join(dir, "demo.vtt"), VTT);
  };

  const assetRow = async (id: string) => (await scratch.db.select().from(asset).where(eq(asset.id, id)))[0];

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    base = await mkdtemp(path.join(tmpdir(), "asset-upload-"));
    outRoot = path.join(base, "manimkc-home");
    ffmpeg = path.join(base, "ffmpeg");
    // Prints the same JPEG whatever it is asked, like a real ffmpeg on a real
    // video prints the same frame, so a rerun cuts identical bytes.
    await writeFile(ffmpeg, `#!/bin/sh\nprintf '\\377\\330\\377\\340\\001\\002\\003\\004\\377\\331'\n`);
    await chmod(ffmpeg, 0o755);
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
    await rm(base, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await scratch.db.execute(sql`truncate asset, blob_object, content_revision cascade`);
    blobRoot = await mkdtemp(path.join(base, "blobs-"));
    store = fsStore(blobRoot);
    await writeFixture();
    await seedIndexed();
  });

  it("uploads every indexed file, cuts a poster, and points each row at bytes equal to its content_hash", async () => {
    const result = await uploadAssets(scratch.db, options());
    expect(result.counts).toEqual({ videos: 1, sidecars: 2, posters: 1 });
    expect(result.refused).toBe(0);
    expect(result.uploaded).toBe(4);
    expect(result.rowsWritten).toBe(4);

    for (const [id, bytes, ext] of [
      [VIDEO_ID, VIDEO, "mp4"],
      [TRANSCRIPT_ID, TRANSCRIPT, "json"],
      [VTT_ID, VTT, "vtt"],
    ] as const) {
      const stored = await assetRow(id);
      expect(stored?.blobKey, id).toBe(blobKey("local", sha256(bytes), ext));
      expect(stored?.contentHash).toBe(sha256(bytes));
      const head = await store.head(stored?.blobKey as string);
      expect(head?.sha256).toBe(stored?.contentHash);
    }

    const poster = await assetRow(posterId(VIDEO_ID));
    expect(poster).toMatchObject({
      kind: "poster",
      path: null,
      url: null,
      contentHash: sha256(JPEG),
      bytes: JPEG.length,
      blobKey: blobKey("local", sha256(JPEG), "jpg"),
    });
    const derived = await scratch.db
      .select()
      .from(assetDerivation)
      .where(eq(assetDerivation.assetId, posterId(VIDEO_ID)));
    expect(derived.map((d) => d.sourceAssetId)).toEqual([VIDEO_ID]);

    const states = await scratch.db.select({ state: blobObject.state }).from(blobObject);
    expect(states.map((s) => s.state)).toEqual(["present", "present", "present", "present"]);
    const revisions = await scratch.db
      .select({ id: contentRevision.entityId, op: contentRevision.op })
      .from(contentRevision)
      .where(eq(contentRevision.entityType, "asset"));
    expect(revisions).toHaveLength(4);
  });

  it("is resumable: a second run reads nothing, uploads nothing and writes no revision", async () => {
    await uploadAssets(scratch.db, options());
    const again = await uploadAssets(scratch.db, options({ ffmpeg: path.join(base, "not-ffmpeg") }));
    expect(again.uploaded).toBe(0);
    expect(again.rowsWritten).toBe(0);
    expect(again.items.map((i) => i.action)).toEqual(["present", "present", "present", "present"]);
  });

  it("finishes an upload an earlier run left pending (edge case 5)", async () => {
    const key = blobKey("local", sha256(VIDEO), "mp4");
    await scratch.db.insert(blobObject).values({
      key,
      sha256: sha256(VIDEO),
      bytes: VIDEO.length,
      mime: "video/mp4",
      provider: "fs",
      state: "pending",
    });
    const result = await uploadAssets(scratch.db, options());
    expect(result.refused).toBe(0);
    const [blob] = await scratch.db.select().from(blobObject).where(eq(blobObject.key, key));
    expect(blob?.state).toBe("present");
    expect((await assetRow(VIDEO_ID))?.blobKey).toBe(key);
  });

  it("writes nothing on a dry run", async () => {
    const result = await uploadAssets(scratch.db, options({ dryRun: true }));
    expect(result.items.map((i) => i.action).sort()).toEqual(
      ["would-make", "would-upload", "would-upload", "would-upload"].sort(),
    );
    expect(await scratch.db.select().from(blobObject)).toEqual([]);
    expect((await assetRow(VIDEO_ID))?.blobKey).toBeNull();
    const objects: string[] = [];
    for await (const object of store.list("")) objects.push(object.key);
    expect(objects).toEqual([]);
  });

  it("refuses a file re-rendered since it was indexed, by name, and leaves its row alone", async () => {
    await writeFile(path.join(outRoot, VIDEO_PATH), Buffer.from("a different render"));
    const result = await uploadAssets(scratch.db, options());
    const refused = result.items.filter((i) => i.action === "refused");
    expect(refused.map((i) => i.id)).toEqual([VIDEO_ID]);
    expect(refused[0]?.detail).toContain("catalog -- index --only manimkc");
    expect((await assetRow(VIDEO_ID))?.blobKey).toBeNull();
    // No video, no poster: a poster of bytes nobody indexed would be a lie.
    expect(await assetRow(posterId(VIDEO_ID))).toBeUndefined();
    // The sidecars were fine and went up.
    expect((await assetRow(TRANSCRIPT_ID))?.blobKey).not.toBeNull();
  });

  it("refuses a deliverable the catalog has no row for", async () => {
    await scratch.db.delete(asset).where(eq(asset.id, VTT_ID));
    const result = await uploadAssets(scratch.db, options());
    expect(result.items.filter((i) => i.action === "refused").map((i) => i.id)).toEqual([VTT_ID]);
  });

  it("skips posters, and says so, with no ffmpeg", async () => {
    const result = await uploadAssets(scratch.db, options({ ffmpeg: null }));
    expect(result.postersSkipped).toContain("ffmpeg");
    expect(result.counts.posters).toBe(0);
    expect(await assetRow(posterId(VIDEO_ID))).toBeUndefined();
    expect((await assetRow(VIDEO_ID))?.blobKey).not.toBeNull();
  });

  describe("a re-index", () => {
    it("keeps a blob_key whose bytes are the ones it just hashed, and drops one it re-rendered", async () => {
      await uploadAssets(scratch.db, options());
      const video = await assetRow(VIDEO_ID);
      const transcript = await assetRow(TRANSCRIPT_ID);
      const rows = await scratch.db.transaction((tx) =>
        keepBlobKeys(tx, {
          asset: [
            row(VIDEO_ID, "video", VIDEO_PATH, VIDEO),
            row(TRANSCRIPT_ID, "transcript", TRANSCRIPT_PATH, Buffer.from("re-rendered")),
            { ...row(VTT_ID, "captions", VTT_PATH, VTT), blobKey: null },
          ],
        }),
      );
      const [kept, dropped, explicit] = rows.asset ?? [];
      expect(kept?.blobKey).toBe(video?.blobKey);
      expect(transcript?.blobKey).not.toBeNull();
      expect(dropped?.blobKey).toBeUndefined();
      // A row that names its blob itself (a diagram import) is left as given.
      expect(explicit?.blobKey).toBeNull();
    });
  });

  describe("blob audit", () => {
    it("finds nothing after a clean upload", async () => {
      await uploadAssets(scratch.db, options());
      const audit = await auditBlobs(scratch.db, store);
      expect(audit.findings).toEqual([]);
      expect(audit).toMatchObject({ rows: 4, objects: 4, outstanding: 0 });
    });

    it("lists a missing and a corrupt object, and --fix sends their rows back to pending", async () => {
      await uploadAssets(scratch.db, options());
      const video = (await assetRow(VIDEO_ID))?.blobKey as string;
      const transcript = (await assetRow(TRANSCRIPT_ID))?.blobKey as string;
      await store.delete(video);
      const [owner, name] = transcript.split("/") as [string, string];
      await writeFile(path.join(blobRoot, owner, name), "tampered");

      const listed = await auditBlobs(scratch.db, store);
      expect(listed.findings.map((f) => [f.kind, f.key]).sort()).toEqual(
        [
          ["corrupt", transcript],
          ["missing", video],
        ].sort(),
      );
      expect(listed.outstanding).toBe(2);

      const fixed = await auditBlobs(scratch.db, store, { fix: true });
      expect(fixed.outstanding).toBe(0);
      const states = await scratch.db
        .select({ key: blobObject.key, state: blobObject.state })
        .from(blobObject)
        .where(eq(blobObject.state, "pending"));
      expect(states.map((s) => s.key).sort()).toEqual([transcript, video].sort());
    });

    it("deletes an orphan object only once it is a day old", async () => {
      const stray = Buffer.from("no row for me");
      const key = blobKey("local", sha256(stray), "mp4");
      const file = path.join(base, "stray.mp4");
      await writeFile(file, stray);
      const { createReadStream } = await import("node:fs");
      await store.put(key, createReadStream(file), { sha256: sha256(stray), bytes: stray.length, mime: "video/mp4" });

      const fresh = await auditBlobs(scratch.db, store, { fix: true });
      expect(fresh.findings).toEqual([expect.objectContaining({ kind: "orphan", key })]);
      expect(fresh.findings[0]?.fixed).toBeUndefined();
      expect(await store.stat(key)).not.toBeNull();

      const later = await auditBlobs(scratch.db, store, {
        fix: true,
        now: new Date(Date.now() + AUDIT_GRACE_MS + 60_000),
      });
      expect(later.findings[0]?.fixed).toBe("deleted");
      expect(await store.stat(key)).toBeNull();
    });

    it("deletes a day-old pending row with no object and nothing pointing at it, and keeps a young one", async () => {
      const key = blobKey("local", sha256("never uploaded"), "mp4");
      await scratch.db.insert(blobObject).values({
        key,
        sha256: sha256("never uploaded"),
        bytes: 14,
        mime: "video/mp4",
        provider: "fs",
        state: "pending",
      });
      const young = await auditBlobs(scratch.db, store, { fix: true });
      expect(young.findings.map((f) => f.kind)).toEqual(["pending"]);

      const old = await auditBlobs(scratch.db, store, {
        fix: true,
        now: new Date(Date.now() + AUDIT_GRACE_MS + 60_000),
      });
      expect(old.findings).toEqual([expect.objectContaining({ kind: "stale-pending", fixed: "row-deleted" })]);
      expect(await scratch.db.select().from(blobObject)).toEqual([]);
    });

    it("lists a poster whose video is gone, and bytes nothing points at", async () => {
      await uploadAssets(scratch.db, options());
      const videoKey = (await assetRow(VIDEO_ID))?.blobKey as string;
      // The manimkc prune deleting the video: its links cascade, the poster stays.
      await scratch.db.delete(asset).where(eq(asset.id, VIDEO_ID));
      const audit = await auditBlobs(scratch.db, store);
      const kinds = audit.findings.map((f) => f.kind).sort();
      expect(kinds).toEqual(["orphan-poster", "unreferenced"]);
      expect(audit.findings.find((f) => f.kind === "unreferenced")?.key).toBe(videoKey);
      // Neither is a disagreement between the table and the store.
      expect(audit.outstanding).toBe(0);
      expect(
        await scratch.db
          .select()
          .from(assetDerivation)
          .where(and(eq(assetDerivation.assetId, posterId(VIDEO_ID)))),
      ).toEqual([]);
    });
  });
});
