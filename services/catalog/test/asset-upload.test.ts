import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { fsStore, key as blobKey, type BlobStore } from "@self-learn/blob";
import { asset, assetDerivation, blobObject, COMMONS_OWNER, contentRevision, type NewAsset } from "@self-learn/schema";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { pdfId, posterId, uploadAssets, type AssetUploadOptions } from "../src/content/asset-upload";
import { auditBlobs, AUDIT_GRACE_MS } from "../src/content/blob-audit";
import { keepBlobKeys } from "../src/index/blob-keys";
import { buildRows, manimkcIndexer, type TopicsReport } from "../src/index/manimkc";
import { writeSource } from "../src/index/writer";
import { applyMigrations } from "../src/migrations";
import { ensureLearner } from "../src/state";
import { BEFORE_BLOB_CONTRACT, partialMigrations } from "./partial-migrations";
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
// Two narration beats, so the video's PDF is two pages rather than the
// silent cut's cadence.
const TRANSCRIPT = Buffer.from(
  JSON.stringify({
    segments: [
      { start: 0, end: 4, text: "Insertion sort keeps a sorted prefix on the left." },
      { start: 4, end: 8, text: "Each new element slides left until it is bigger than its neighbour." },
    ],
  }),
);
const VTT = Buffer.from("WEBVTT\n");
// A real 64x36 baseline JPEG: the PDF builder's embedJpg refuses the old
// marker-shaped bytes, and a fixed body keeps a re-cut poster's bytes the
// same, which is what "linked" asserts.
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAAkAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKAP/2Q==",
  "base64",
);

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

  /** A stored object's whole body, for looking inside a PDF rather than at its hash. */
  const streamOf = async (store: BlobStore, key: string): Promise<Buffer[]> => {
    const read = await store.get(key);
    const chunks: Buffer[] = [];
    for await (const chunk of read.body) chunks.push(chunk as Buffer);
    return chunks;
  };

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    // Flip day's upload runs before the contract (0013): rows first, bytes
    // after. Once 0013 is in, a stored-kind row cannot exist without its blob
    // and the import stores the bytes itself (blob-contract.test.ts). The
    // kind check is widened by hand for `pdf`: its migration (0030) comes
    // after 0013, so it cannot apply to a database stopped before it.
    await applyMigrations(scratch.db, { folder: await partialMigrations(BEFORE_BLOB_CONTRACT) });
    await scratch.db.execute(sql`
      alter table asset drop constraint asset_kind_check;
    `);
    await scratch.db.execute(sql`
      alter table asset add constraint asset_kind_check check (kind in ('video', 'transcript', 'chapters', 'captions', 'diagram_source', 'diagram_svg', 'note', 'session', 'link', 'poster', 'pdf'));
    `);
    base = await mkdtemp(path.join(tmpdir(), "asset-upload-"));
    outRoot = path.join(base, "manimkc-home");
    ffmpeg = path.join(base, "ffmpeg");
    // Prints the same JPEG whatever it is asked, like a real ffmpeg on a real
    // video prints the same frame, so a rerun cuts identical bytes — and a
    // Duration line on stderr, where the silent-cut cadence would read a
    // length for a video with no transcript.
    await writeFile(
      ffmpeg,
      `#!/bin/sh\necho '  Duration: 00:00:10.00, start: 0.000000, bitrate: 200 kb/s' >&2\necho '${JPEG.toString("base64")}' | base64 -d\n`,
    );
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

  it("uploads every indexed file, cuts a poster, makes a PDF, and points each row at bytes equal to its content_hash", async () => {
    const result = await uploadAssets(scratch.db, options());
    expect(result.counts).toEqual({ videos: 1, sidecars: 2, posters: 1, pdfs: 1 });
    expect(result.refused).toBe(0);
    expect(result.uploaded).toBe(5);
    expect(result.rowsWritten).toBe(5);

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

    const pdf = await assetRow(pdfId(VIDEO_ID));
    expect(pdf).toMatchObject({ kind: "pdf", path: null, url: null, ownerId: "local" });
    // The document is deterministic: the same video, transcript and title
    // make the same bytes, so its key is its hash and the store's copy
    // hashes to it.
    expect(pdf?.blobKey).toBe(blobKey("local", pdf?.contentHash as string, "pdf"));
    const head = await store.head(pdf?.blobKey as string);
    expect(head?.sha256).toBe(pdf?.contentHash);
    const pdfBody = Buffer.concat(await streamOf(store, pdf?.blobKey as string));
    expect(pdfBody.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const pdfDerived = await scratch.db
      .select()
      .from(assetDerivation)
      .where(eq(assetDerivation.assetId, pdfId(VIDEO_ID)));
    expect(pdfDerived.map((d) => d.sourceAssetId)).toEqual([VIDEO_ID]);

    const states = await scratch.db.select({ state: blobObject.state }).from(blobObject);
    expect(states.map((s) => s.state)).toEqual(["present", "present", "present", "present", "present"]);
    const revisions = await scratch.db
      .select({ id: contentRevision.entityId, op: contentRevision.op })
      .from(contentRevision)
      .where(eq(contentRevision.entityType, "asset"));
    expect(revisions).toHaveLength(5);
  });

  it("is resumable: a second run reads nothing, uploads nothing and writes no revision", async () => {
    await uploadAssets(scratch.db, options());
    const again = await uploadAssets(scratch.db, options({ ffmpeg: path.join(base, "not-ffmpeg") }));
    expect(again.uploaded).toBe(0);
    expect(again.rowsWritten).toBe(0);
    expect(again.items.map((i) => i.action)).toEqual(["present", "present", "present", "present", "present"]);
  });

  it("refuses each file its owner's cap refuses, and goes on with the rest (phase 4)", async () => {
    const saved = process.env["SELF_LEARN_OWNER_UPLOADS_PER_DAY"];
    process.env["SELF_LEARN_OWNER_UPLOADS_PER_DAY"] = "2";
    try {
      const result = await uploadAssets(scratch.db, options());
      expect(result.uploaded).toBe(2);
      expect(result.refused).toBe(3);
      const refused = result.items.filter((i) => i.action === "refused");
      expect(refused).toHaveLength(3);
      for (const item of refused) expect(item.detail).toContain("SELF_LEARN_OWNER_UPLOADS_PER_DAY");
    } finally {
      if (saved === undefined) delete process.env["SELF_LEARN_OWNER_UPLOADS_PER_DAY"];
      else process.env["SELF_LEARN_OWNER_UPLOADS_PER_DAY"] = saved;
    }
  });

  it("uploads a video the commons holds under the commons' prefix, and writes each row as the commons (phase 4)", async () => {
    // D23's move of the manimkc library to the commons is an update of
    // owner_id; the next upload keys the bytes and writes the rows as that
    // owner. Written as the CLI's owner, the seam refused every row with
    // foreign-owner after the bytes were stored, and the run aborted.
    await ensureLearner(scratch.db, COMMONS_OWNER);
    await scratch.db.update(asset).set({ ownerId: COMMONS_OWNER });
    const result = await uploadAssets(scratch.db, options());
    expect(result.refused).toBe(0);
    expect(result.rowsWritten).toBe(5);
    for (const [id, bytes, ext] of [
      [VIDEO_ID, VIDEO, "mp4"],
      [TRANSCRIPT_ID, TRANSCRIPT, "json"],
      [VTT_ID, VTT, "vtt"],
      [posterId(VIDEO_ID), JPEG, "jpg"],
    ] as const) {
      const stored = await assetRow(id);
      expect(stored?.ownerId, id).toBe(COMMONS_OWNER);
      expect(stored?.blobKey, id).toBe(blobKey(COMMONS_OWNER, sha256(bytes), ext));
    }
    const pdf = await assetRow(pdfId(VIDEO_ID));
    expect(pdf?.ownerId).toBe(COMMONS_OWNER);
    expect(pdf?.blobKey).toBe(blobKey(COMMONS_OWNER, pdf?.contentHash as string, "pdf"));
    const owners = await scratch.db.select({ owner: blobObject.ownerId }).from(blobObject);
    expect(new Set(owners.map((o) => o.owner))).toEqual(new Set([COMMONS_OWNER]));
    const authors = await scratch.db.select({ owner: contentRevision.ownerId }).from(contentRevision);
    expect(new Set(authors.map((a) => a.owner))).toEqual(new Set([COMMONS_OWNER]));
  });

  it("refuses a poster left with another owner than its video, before cutting or storing it (phase 4)", async () => {
    await uploadAssets(scratch.db, options());
    // D23's move done for the video and its sidecars but not its poster or PDF.
    await ensureLearner(scratch.db, COMMONS_OWNER);
    await scratch.db.update(asset).set({ ownerId: COMMONS_OWNER }).where(sql`${asset.id} like 'manimkc:%'`);
    const before = (await scratch.db.select({ key: blobObject.key }).from(blobObject)).map((b) => b.key);
    const result = await uploadAssets(scratch.db, options());
    const poster = result.items.filter((i) => i.id === posterId(VIDEO_ID));
    expect(poster.map((i) => i.action)).toEqual(["refused", "detached"]);
    expect(poster[0]?.detail).toContain("belongs to local and its video to commons");
    // Unhooked from the video whose link just changed, so it is not served
    // as that video's current picture.
    const derived = await scratch.db.select().from(assetDerivation).where(eq(assetDerivation.assetId, posterId(VIDEO_ID)));
    expect(derived).toEqual([]);
    expect((await assetRow(posterId(VIDEO_ID)))?.ownerId).toBe("local");

    // The PDF is the poster's sibling under the same rule: refused by name,
    // and unhooked so it is not served as the moved video's document.
    const pdf = result.items.filter((i) => i.id === pdfId(VIDEO_ID));
    expect(pdf.map((i) => i.action)).toEqual(["refused", "detached"]);
    expect(pdf[0]?.detail).toContain("belongs to local and its video to commons");
    const pdfDerived = await scratch.db.select().from(assetDerivation).where(eq(assetDerivation.assetId, pdfId(VIDEO_ID)));
    expect(pdfDerived).toEqual([]);
    expect((await assetRow(pdfId(VIDEO_ID)))?.ownerId).toBe("local");

    // The video and its sidecars moved to the commons' prefix; no derived
    // bytes were made for either owner.
    expect((await assetRow(VIDEO_ID))?.blobKey).toBe(blobKey(COMMONS_OWNER, sha256(VIDEO), "mp4"));
    const after = (await scratch.db.select({ key: blobObject.key }).from(blobObject)).map((b) => b.key);
    expect(after.filter((k) => !before.includes(k)).every((k) => !k.endsWith(".jpg") && !k.endsWith(".pdf"))).toBe(true);
  });

  it("says a mismatched poster is to be moved even when it is present and its video unchanged (phase 4)", async () => {
    await ensureLearner(scratch.db, COMMONS_OWNER);
    await scratch.db.update(asset).set({ ownerId: COMMONS_OWNER });
    await uploadAssets(scratch.db, options());
    await scratch.db.update(asset).set({ ownerId: "local" }).where(eq(asset.id, posterId(VIDEO_ID)));
    const result = await uploadAssets(scratch.db, options());
    const poster = result.items.filter((i) => i.id === posterId(VIDEO_ID));
    // Refused by name, not reported as present; and left hooked up, since its
    // video did not change and it is still the right picture.
    expect(poster.map((i) => i.action)).toEqual(["refused"]);
    const derived = await scratch.db.select().from(assetDerivation).where(eq(assetDerivation.assetId, posterId(VIDEO_ID)));
    expect(derived.map((d) => d.sourceAssetId)).toEqual([VIDEO_ID]);
    // The PDF stayed the commons' with its video, so it is simply present.
    expect(result.items.find((i) => i.id === pdfId(VIDEO_ID))?.action).toBe("present");
  });

  it("refuses another owner's video before storing a byte, and goes on with the rest (phase 4)", async () => {
    await ensureLearner(scratch.db, "other");
    await scratch.db.update(asset).set({ ownerId: "other" }).where(eq(asset.id, VIDEO_ID));
    const result = await uploadAssets(scratch.db, options());
    const refused = result.items.filter((i) => i.action === "refused");
    expect(refused.map((i) => i.id)).toEqual([VIDEO_ID]);
    expect(refused[0]?.detail).toContain("belongs to other");
    expect((await assetRow(VIDEO_ID))?.blobKey).toBeNull();
    const keys = (await scratch.db.select({ key: blobObject.key }).from(blobObject)).map((b) => b.key);
    expect(keys.some((k) => k.startsWith("other/"))).toBe(false);
    expect(keys.some((k) => k.endsWith(`${sha256(VIDEO)}.mp4`))).toBe(false);
    // Its sidecars are the owner's and went up.
    expect((await assetRow(TRANSCRIPT_ID))?.blobKey).not.toBeNull();
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
      ["would-make", "would-make", "would-upload", "would-upload", "would-upload"].sort(),
    );
    expect(await scratch.db.select().from(blobObject)).toEqual([]);
    expect((await assetRow(VIDEO_ID))?.blobKey).toBeNull();
    const objects: string[] = [];
    for await (const object of store.list("")) objects.push(object.key);
    expect(objects).toEqual([]);
  });

  it("says on a dry run which files the caps would refuse, counting what it has planned", async () => {
    const saved = process.env["SELF_LEARN_OWNER_UPLOADS_PER_DAY"];
    process.env["SELF_LEARN_OWNER_UPLOADS_PER_DAY"] = "2";
    try {
      const dry = await uploadAssets(scratch.db, options({ dryRun: true }));
      const real = await uploadAssets(scratch.db, options());
      // The same files are refused, by the dry run as by the real one, the
      // poster included (the day's count is asked for it; its bytes cannot be).
      const refusedIds = (r: typeof dry) => r.items.filter((i) => i.action === "refused").map((i) => i.id).sort();
      expect(refusedIds(dry)).toEqual(refusedIds(real));
      expect(dry.items.filter((i) => i.action === "would-upload")).toHaveLength(2);
      for (const item of dry.items.filter((i) => i.action === "refused")) {
        expect(item.detail).toContain("a real run would refuse it");
      }
    } finally {
      if (saved === undefined) delete process.env["SELF_LEARN_OWNER_UPLOADS_PER_DAY"];
      else process.env["SELF_LEARN_OWNER_UPLOADS_PER_DAY"] = saved;
    }
  });

  it("says a dry run's bytes-cap answers are an estimate when it plans derived files, whose sizes it cannot know", async () => {
    const saved = process.env["SELF_LEARN_OWNER_BYTES_CAP"];
    process.env["SELF_LEARN_OWNER_BYTES_CAP"] = "1000000000";
    try {
      const dry = await uploadAssets(scratch.db, options({ dryRun: true }));
      expect(dry.items.filter((i) => i.action === "would-make")).toHaveLength(2);
      expect(dry.bytesCapEstimate).toMatch(
        /SELF_LEARN_OWNER_BYTES_CAP answers are an estimate: the 2 poster\(s\)\/PDF\(s\) this run would make/,
      );
      // No posters planned (no ffmpeg), or no bytes cap: an exact answer, and nothing said.
      expect((await uploadAssets(scratch.db, options({ dryRun: true, ffmpeg: null }))).bytesCapEstimate).toBeNull();
      delete process.env["SELF_LEARN_OWNER_BYTES_CAP"];
      expect((await uploadAssets(scratch.db, options({ dryRun: true }))).bytesCapEstimate).toBeNull();
      // Nor on a real run, which measures each poster it cuts.
      process.env["SELF_LEARN_OWNER_BYTES_CAP"] = "1000000000";
      expect((await uploadAssets(scratch.db, options())).bytesCapEstimate).toBeNull();
    } finally {
      if (saved === undefined) delete process.env["SELF_LEARN_OWNER_BYTES_CAP"];
      else process.env["SELF_LEARN_OWNER_BYTES_CAP"] = saved;
    }
  });

  it("counts a key once on a dry run, as a real run's row would", async () => {
    // A second deliverable with the video's bytes: one key, one upload.
    const COPY_PATH = "out/algorithms/demo/copy.mp4";
    await writeFile(path.join(outRoot, COPY_PATH), VIDEO);
    await scratch.db.insert(asset).values(row(`manimkc:${COPY_PATH}`, "video", COPY_PATH, VIDEO));
    const withCopy = report();
    const sections = withCopy.topics[0]?.sections as unknown[];
    sections.push({ section: "copy", deliverable: { path: COPY_PATH, exists: true, sidecars: {} } });
    const saved = process.env["SELF_LEARN_OWNER_UPLOADS_PER_DAY"];
    process.env["SELF_LEARN_OWNER_UPLOADS_PER_DAY"] = "3";
    try {
      const dry = await uploadAssets(scratch.db, options({ dryRun: true, ffmpeg: null, report: withCopy }));
      expect(dry.items.filter((i) => i.action === "refused")).toEqual([]);
      const real = await uploadAssets(scratch.db, options({ ffmpeg: null, report: withCopy }));
      expect(real.refused).toBe(0);
    } finally {
      if (saved === undefined) delete process.env["SELF_LEARN_OWNER_UPLOADS_PER_DAY"];
      else process.env["SELF_LEARN_OWNER_UPLOADS_PER_DAY"] = saved;
    }
  });

  it("refuses a file re-rendered since it was indexed, by name, and leaves its row alone", async () => {
    await writeFile(path.join(outRoot, VIDEO_PATH), Buffer.from("a different render"));
    const result = await uploadAssets(scratch.db, options());
    const refused = result.items.filter((i) => i.action === "refused");
    expect(refused.map((i) => i.id)).toEqual([VIDEO_ID]);
    expect(refused[0]?.detail).toContain("catalog -- import --only manimkc");
    expect((await assetRow(VIDEO_ID))?.blobKey).toBeNull();
    // No video, no poster, no PDF: a derived file of bytes nobody indexed
    // would be a lie.
    expect(await assetRow(posterId(VIDEO_ID))).toBeUndefined();
    expect(await assetRow(pdfId(VIDEO_ID))).toBeUndefined();
    // The sidecars were fine and went up.
    expect((await assetRow(TRANSCRIPT_ID))?.blobKey).not.toBeNull();
  });

  it("refuses a deliverable the catalog has no row for", async () => {
    await scratch.db.delete(asset).where(eq(asset.id, VTT_ID));
    const result = await uploadAssets(scratch.db, options());
    expect(result.items.filter((i) => i.action === "refused").map((i) => i.id)).toEqual([VTT_ID]);
  });

  it("skips posters and PDFs, and says so, with no ffmpeg", async () => {
    const result = await uploadAssets(scratch.db, options({ ffmpeg: null }));
    expect(result.postersSkipped).toContain("ffmpeg");
    expect(result.pdfsSkipped).toContain("ffmpeg");
    expect(result.counts.posters).toBe(0);
    expect(result.counts.pdfs).toBe(0);
    expect(await assetRow(posterId(VIDEO_ID))).toBeUndefined();
    expect(await assetRow(pdfId(VIDEO_ID))).toBeUndefined();
    expect((await assetRow(VIDEO_ID))?.blobKey).not.toBeNull();
  });

  it("unhooks a poster cut from the old render when it cannot cut one from the new", async () => {
    await uploadAssets(scratch.db, options());
    const oldPoster = (await assetRow(posterId(VIDEO_ID)))?.blobKey;

    // A re-render, then the re-index: new bytes, new hash, and the stale key dropped.
    const rerender = Buffer.from("a new render of the demo");
    await writeFile(path.join(outRoot, VIDEO_PATH), rerender);
    await scratch.db
      .update(asset)
      .set({ contentHash: sha256(rerender), bytes: rerender.length, blobKey: null })
      .where(eq(asset.id, VIDEO_ID));

    const noFfmpeg = await uploadAssets(scratch.db, options({ ffmpeg: null }));
    expect(noFfmpeg.items.find((i) => i.id === posterId(VIDEO_ID))?.action).toBe("detached");
    // The PDF is unhooked by the same rule.
    expect(noFfmpeg.items.find((i) => i.id === pdfId(VIDEO_ID))?.action).toBe("detached");
    expect((await assetRow(VIDEO_ID))?.blobKey).toBe(blobKey("local", sha256(rerender), "mp4"));
    const derivedFrom = async () =>
      (
        await scratch.db
          .select({ source: assetDerivation.sourceAssetId })
          .from(assetDerivation)
          .where(eq(assetDerivation.assetId, posterId(VIDEO_ID)))
      ).map((row) => row.source);
    // No stored poster for the video now: the route cuts one from the file.
    expect(await derivedFrom()).toEqual([]);

    // A later run with ffmpeg sees no poster for the video and cuts one. This
    // ffmpeg prints the same JPEG whatever it is given, so the cut is the
    // picture the row already names, and the run says it linked it again.
    const withFfmpeg = await uploadAssets(scratch.db, options());
    expect(withFfmpeg.items.find((i) => i.id === posterId(VIDEO_ID))?.action).toBe("linked");
    expect(await derivedFrom()).toEqual([VIDEO_ID]);
    expect((await assetRow(posterId(VIDEO_ID)))?.blobKey).toBe(oldPoster);
    // And the PDF, byte-for-byte the document the fixture makes again, is
    // linked back rather than stored again.
    expect(withFfmpeg.items.find((i) => i.id === pdfId(VIDEO_ID))?.action).toBe("linked");
    expect(
      (
        await scratch.db
          .select({ source: assetDerivation.sourceAssetId })
          .from(assetDerivation)
          .where(eq(assetDerivation.assetId, pdfId(VIDEO_ID)))
      ).map((row) => row.source),
    ).toEqual([VIDEO_ID]);
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
        }, "local"),
      );
      const [kept, dropped, explicit] = rows.asset ?? [];
      expect(kept?.blobKey).toBe(video?.blobKey);
      expect(transcript?.blobKey).not.toBeNull();
      expect(dropped?.blobKey).toBeUndefined();
      // A row that names its blob itself (a diagram import) is left as given.
      expect(explicit?.blobKey).toBeNull();
    });

    // The carry-forward through the writer the indexer really uses (S13 of
    // the phase 1 review): upload, then the manimkc import writes its rows
    // back over the uploaded ones, and every key whose bytes it hashed again
    // survives. Before `keepBlobKeys` this set every blob_key back to null.
    it("keeps every key through an upload followed by the manimkc import, and drops only a re-rendered one", async () => {
      await scratch.db.execute(
        sql`insert into topic (slug, title, domain) values ('demo-topic', 'Demo', 'testing') on conflict do nothing`,
      );
      await uploadAssets(scratch.db, options());
      const before = new Map(
        (await scratch.db.select({ id: asset.id, key: asset.blobKey }).from(asset)).map((r) => [r.id, r.key] as const),
      );
      expect([VIDEO_ID, TRANSCRIPT_ID, VTT_ID].every((id) => before.get(id) != null)).toBe(true);

      const importOnce = async () => {
        const built = await buildRows(report(), outRoot, new Map([["algorithms/demo", "demo-topic"]]), new Map([["demo-topic", {}]]));
        await writeSource(scratch.db, manimkcIndexer, built.rows, built.notes, outRoot, { metadata: built.metadata });
      };
      await importOnce();
      for (const id of [VIDEO_ID, TRANSCRIPT_ID, VTT_ID, posterId(VIDEO_ID)]) {
        expect((await assetRow(id))?.blobKey, id).toBe(before.get(id));
      }

      // A re-render of the transcript, then the import: that key alone goes.
      await writeFile(path.join(outRoot, TRANSCRIPT_PATH), '{"cues":[{"re":"rendered"}]}');
      await importOnce();
      expect((await assetRow(TRANSCRIPT_ID))?.blobKey).toBeNull();
      expect((await assetRow(VIDEO_ID))?.blobKey).toBe(before.get(VIDEO_ID));
      expect((await assetRow(VTT_ID))?.blobKey).toBe(before.get(VTT_ID));
    });
  });

  describe("blob audit", () => {
    it("finds nothing after a clean upload", async () => {
      await uploadAssets(scratch.db, options());
      const audit = await auditBlobs(scratch.db, store);
      expect(audit.findings).toEqual([]);
      expect(audit).toMatchObject({ rows: 5, objects: 5, outstanding: 0 });
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
      // Both rows are now pending, and both are pointed at: those two assets
      // answer not-uploaded until the upload reruns, so the audit keeps failing.
      expect(fixed.outstanding).toBe(2);
      const states = await scratch.db
        .select({ key: blobObject.key, state: blobObject.state })
        .from(blobObject)
        .where(eq(blobObject.state, "pending"));
      expect(states.map((s) => s.key).sort()).toEqual([transcript, video].sort());
    });

    it("keeps failing while a referenced blob is pending, and passes once the upload reruns", async () => {
      await uploadAssets(scratch.db, options());
      const video = (await assetRow(VIDEO_ID))?.blobKey as string;
      await scratch.db.update(blobObject).set({ state: "pending" }).where(eq(blobObject.key, video));
      const audit = await auditBlobs(scratch.db, store);
      expect(audit.findings).toEqual([expect.objectContaining({ kind: "pending", key: video })]);
      expect(audit.outstanding).toBe(1);

      await uploadAssets(scratch.db, options());
      expect((await auditBlobs(scratch.db, store)).outstanding).toBe(0);
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

    it("lists the poster and PDF whose video is gone, and bytes nothing points at", async () => {
      await uploadAssets(scratch.db, options());
      const videoKey = (await assetRow(VIDEO_ID))?.blobKey as string;
      // The manimkc prune deleting the video: its links cascade, the derived
      // rows stay.
      await scratch.db.delete(asset).where(eq(asset.id, VIDEO_ID));
      const audit = await auditBlobs(scratch.db, store);
      const kinds = audit.findings.map((f) => f.kind).sort();
      expect(kinds).toEqual(["orphan-poster", "orphan-poster", "unreferenced"]);
      expect(audit.findings.find((f) => f.kind === "unreferenced")?.key).toBe(videoKey);
      // Neither is a disagreement between the table and the store.
      expect(audit.outstanding).toBe(0);
      expect(
        await scratch.db
          .select()
          .from(assetDerivation)
          .where(and(eq(assetDerivation.assetId, posterId(VIDEO_ID)))),
      ).toEqual([]);
      expect(
        await scratch.db
          .select()
          .from(assetDerivation)
          .where(and(eq(assetDerivation.assetId, pdfId(VIDEO_ID)))),
      ).toEqual([]);
    });
  });
});
