import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { fsStore, key as blobKey, type BlobStore } from "@self-learn/blob";
import { asset, assetDerivation, blobObject, type NewAsset } from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { uploadAssets } from "../src/content/asset-upload";
import { auditBlobs, AUDIT_GRACE_MS } from "../src/content/blob-audit";
import { openBlobStore, uploadBlob } from "../src/content/blob";
import { ownerIdentity, OWNER_FILE, readOwner, removePartial, stalePartials } from "../src/content/blob-owner";
import { writeContent } from "../src/content/write";
import { connect, type Connection } from "../src/db";
import type { TopicsReport } from "../src/index/manimkc";
import { applyMigrations } from "../src/migrations";
import { BEFORE_BLOB_CONTRACT, partialMigrations } from "./partial-migrations";
import { createScratchDatabase, probe, type Scratch, withoutConstraint } from "./scratch-database";

/**
 * The blob store against a second writer (docs/CONTENT-MIGRATION.md, phase 1
 * fixes S3 and S6): an upload whose rows an index rewrote while it ran, two
 * databases sharing one root, an upload taking a pending row back up while
 * the audit runs, and staged writes a crash left behind. Every concurrent
 * write is made on a second connection at the moment between the other
 * writer's read and its write.
 */

const reachable = await probe();

const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

const VIDEO = Buffer.from(Array.from({ length: 2_000 }, (_, i) => (i * 11) % 251));
const VTT = Buffer.from("WEBVTT\n");
const VIDEO_PATH = "out/algorithms/demo/demo.mp4";
const VTT_PATH = "out/algorithms/demo/demo.vtt";
const VIDEO_ID = `manimkc:${VIDEO_PATH}`;
const VTT_ID = `manimkc:${VTT_PATH}`;

describe.skipIf(!reachable.ok)("the blob store against a second writer", () => {
  let a: Scratch;
  let b: Scratch;
  let two: Connection;
  let base: string;
  let outRoot: string;
  let root: string;
  let store: BlobStore;

  const report = (): TopicsReport => ({
    outRoot,
    topics: [
      {
        path: "algorithms/demo",
        sections: [
          {
            section: "main",
            deliverable: { path: VIDEO_PATH, exists: true, sidecars: { vtt: { path: VTT_PATH, exists: true } } },
          },
        ],
      },
    ],
    drift: {},
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

  /** A store that runs `before` once, the first time `method` is called, then does what the store does. */
  function interrupted(inner: BlobStore, method: "put" | "list", before: () => Promise<void>): BlobStore {
    let done = false;
    const once = async () => {
      if (done) return;
      done = true;
      await before();
    };
    return {
      ...inner,
      put: async (key, body, meta) => {
        if (method === "put") await once();
        return inner.put(key, body, meta);
      },
      list: (prefix) => {
        const source = inner.list(prefix);
        return (async function* () {
          if (method === "list") await once();
          yield* source;
        })();
      },
    };
  }

  beforeAll(async () => {
    a = await createScratchDatabase();
    b = await createScratchDatabase();
    // Without the contract-era check, as flip day's upload was: see
    // asset-upload.test.ts for why the fixture rebuilds the table.
    await applyMigrations(a.db);
    await applyMigrations(b.db);
    await withoutConstraint(a.db, "asset", "asset_stored_blob_check");
    await withoutConstraint(b.db, "asset", "asset_stored_blob_check");
    two = connect({ url: a.url });
    base = await mkdtemp(path.join(tmpdir(), "blob-owner-"));
    outRoot = path.join(base, "manimkc-home");
    const dir = path.join(outRoot, "out", "algorithms", "demo");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "demo.mp4"), VIDEO);
    await writeFile(path.join(dir, "demo.vtt"), VTT);
  }, 60_000);

  afterAll(async () => {
    await two?.close();
    await a?.drop();
    await b?.drop();
    await rm(base, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await a.db.execute(sql`delete from asset; delete from blob_object; delete from content_revision;`);
    root = await mkdtemp(path.join(base, "blobs-"));
    store = fsStore(root);
  });

  it("refuses to point a row an index rewrote mid-upload at its blob, and keeps the rewrite", async () => {
    await a.db.insert(asset).values([row(VIDEO_ID, "video", VIDEO_PATH, VIDEO), row(VTT_ID, "captions", VTT_PATH, VTT)]);
    await a.db.insert(assetDerivation).values({ assetId: VTT_ID, sourceAssetId: VIDEO_ID });
    const [indexed] = await a.db.select().from(asset).where(eq(asset.id, VIDEO_ID));

    // While the bytes stream, a `catalog index` on another connection rewrites the video's row.
    const racing = interrupted(store, "put", async () => {
      const rest: Record<string, unknown> = { ...indexed };
      delete rest["createdAt"];
      delete rest["updatedAt"];
      await writeContent(two.db, {
        owner: "local",
        type: "asset",
        id: VIDEO_ID,
        next: { row: { ...rest, title: "Retitled by an index" } },
        base: null,
        author: "local",
        authorKind: "import",
        reason: "catalog index",
      });
    });
    const result = await uploadAssets(a.db, { store: racing, repoRoot: base, manimkcRoot: outRoot, ffmpeg: null, report: report() });
    expect(result.rowsWritten).toBe(0);
    expect(result.refused).toBe(2);
    expect(result.items.map((i) => [i.id, i.action])).toEqual([
      [VIDEO_ID, "refused"],
      [VTT_ID, "refused"],
    ]);
    expect(result.items[0]?.detail).toMatch(/its row changed while this upload ran/);
    const [after] = await a.db.select().from(asset).where(eq(asset.id, VIDEO_ID));
    expect(after).toMatchObject({ title: "Retitled by an index", blobKey: null });

    // A rerun reads the row as it is now and links it, keeping the new title.
    const again = await uploadAssets(a.db, { store, repoRoot: base, manimkcRoot: outRoot, ffmpeg: null, report: report() });
    expect(again.refused).toBe(0);
    const [linked] = await a.db.select().from(asset).where(eq(asset.id, VIDEO_ID));
    expect(linked).toMatchObject({ title: "Retitled by an index", blobKey: blobKey("local", sha256(VIDEO), "mp4") });
  });

  it("lets --fix act only on a root that names this database, which the first writer claims", async () => {
    const saved = process.env["SELF_LEARN_HOME"];
    process.env["SELF_LEARN_HOME"] = path.dirname(root);
    await rm(root, { recursive: true, force: true });
    await mkdir(path.join(path.dirname(root), "blobs"), { recursive: true });
    try {
      const shared = openBlobStore();
      expect(shared.root).toBe(path.join(path.dirname(root), "blobs"));
      // Database B writes first, through the catalog's own store: the root is B's.
      const file = path.join(base, "b-bytes.bin");
      await writeFile(file, "bytes database b wrote");
      const put = await uploadBlob(b.db, shared, { ownerId: "local", file, mime: "application/octet-stream", ext: "bin" });
      expect(await readOwner(shared.root)).toEqual({
        database: expect.stringMatching(new RegExp(`^${b.name}:\\d+$`)),
        port: expect.stringMatching(/^\d+$/),
      });

      // A cannot write there: its objects would be orphans to B's audit.
      const other = path.join(base, "a-bytes.bin");
      await writeFile(other, "bytes database a wanted to write");
      await expect(
        uploadBlob(a.db, shared, { ownerId: "local", file: other, mime: "application/octet-stream", ext: "bin" }),
      ).rejects.toThrow(new RegExp(`belongs to database "${b.name}:\\d+" on port \\d+.*nothing was uploaded`));
      expect(await a.db.select().from(blobObject)).toEqual([]);

      // To A the object is an orphan, a day old. A read-only audit says so and whose root it is.
      const later = new Date(Date.now() + AUDIT_GRACE_MS * 2);
      const listed = await auditBlobs(a.db, shared, { root: shared.root, now: later });
      expect(listed.owner?.database).toMatch(new RegExp(`^${b.name}:`));
      expect(listed.findings).toEqual([expect.objectContaining({ kind: "orphan", key: put.key })]);
      // --fix from A is refused before anything changes.
      await expect(auditBlobs(a.db, shared, { fix: true, root: shared.root, now: later })).rejects.toThrow(
        new RegExp(`belongs to database "${b.name}:\\d+" on port \\d+ \\(its \\.owner\\), and this is database "${a.name}:\\d+" on port \\d+`),
      );
      expect(await shared.stat(put.key)).not.toBeNull();
      // From B, the owner, the same object is its own and stays.
      const own = await auditBlobs(b.db, shared, { fix: true, root: shared.root, now: later });
      expect(own.findings.filter((f) => f.kind === "orphan")).toEqual([]);
      // The marker is not an object: nothing lists it.
      expect(own.objects).toBe(1);
      expect(JSON.parse(await readFile(path.join(shared.root, OWNER_FILE), "utf8"))).toMatchObject({ database: expect.stringMatching(new RegExp(`^${b.name}:`)) });
    } finally {
      if (saved === undefined) delete process.env["SELF_LEARN_HOME"];
      else process.env["SELF_LEARN_HOME"] = saved;
    }
  });

  it("tells a database from one of the same name and oid on another server by its port", async () => {
    const self = await ownerIdentity(a.db);
    await writeFile(path.join(root, OWNER_FILE), JSON.stringify({ database: self.database, port: `${self.port}0` }));
    await expect(auditBlobs(a.db, store, { fix: true, root })).rejects.toThrow(/belongs to database .* on port \d+0 /);
  });

  it("claims an unclaimed root on its first --fix, then deletes its own day-old orphans there", async () => {
    await store.put(blobKey("local", sha256("stray"), "bin"), Readable.from([Buffer.from("stray")]), {
      sha256: sha256("stray"),
      bytes: 5,
      mime: "application/octet-stream",
    });
    const later = new Date(Date.now() + AUDIT_GRACE_MS * 2);
    const result = await auditBlobs(a.db, store, { fix: true, root, now: later });
    expect(result.owner?.database).toMatch(new RegExp(`^${a.name}:`));
    expect(result.findings).toEqual([expect.objectContaining({ kind: "orphan", fixed: "deleted" })]);
    expect((await readOwner(root))?.database).toMatch(new RegExp(`^${a.name}:`));
  });

  it("keeps a stale pending row an upload took up again while the audit ran", async () => {
    const key = blobKey("local", sha256("pending"), "bin");
    await a.db.insert(blobObject).values({
      key,
      sha256: sha256("pending"),
      bytes: 7,
      mime: "application/octet-stream",
      provider: "fs",
      state: "pending",
    });
    await a.db.execute(sql`update blob_object set updated_at = cast(unixepoch('subsec') * 1000 as integer) - interval '2 days' where key = ${key}`);
    // Between the audit's read of the rows and its delete, an upload of the
    // same key marks the row pending again, as `uploadBlob` does first.
    const racing = interrupted(store, "list", async () => {
      await two.db.execute(sql`update blob_object set state = 'pending', updated_at = cast(unixepoch('subsec') * 1000 as integer) where key = ${key}`);
    });
    const result = await auditBlobs(a.db, racing, { fix: true, root });
    const finding = result.findings.find((f) => f.key === key);
    expect(finding).toMatchObject({ kind: "stale-pending" });
    expect(finding?.fixed).toBeUndefined();
    expect(finding?.detail).toMatch(/an upload took it up again while the audit ran/);
    expect(await a.db.select().from(blobObject).where(eq(blobObject.key, key))).toHaveLength(1);

    // With nothing taking it up, the same row goes.
    await a.db.execute(sql`update blob_object set updated_at = cast(unixepoch('subsec') * 1000 as integer) - interval '2 days' where key = ${key}`);
    const swept = await auditBlobs(a.db, store, { fix: true, root });
    expect(swept.findings.find((f) => f.key === key)?.fixed).toBe("row-deleted");
  });

  it("sweeps staged writes older than a day from .tmp, and leaves one in flight", async () => {
    const tmp = path.join(root, ".tmp");
    await mkdir(tmp, { recursive: true });
    await writeFile(path.join(tmp, "old.part"), "half an upload");
    await writeFile(path.join(tmp, "new.part"), "an upload running now");
    const twoDaysAgo = new Date(Date.now() - 2 * AUDIT_GRACE_MS);
    await utimes(path.join(tmp, "old.part"), twoDaysAgo, twoDaysAgo);

    const listed = await auditBlobs(a.db, store, { root });
    expect(listed.findings).toEqual([expect.objectContaining({ kind: "partial", key: path.join(".tmp", "old.part") })]);
    expect(listed.outstanding).toBe(1);
    const fixed = await auditBlobs(a.db, store, { fix: true, root });
    expect(fixed.findings).toEqual([expect.objectContaining({ kind: "partial", fixed: "deleted" })]);
    expect(fixed.outstanding).toBe(0);
    expect(await readdir(tmp)).toEqual(["new.part"]);
    // Asked again at the delete: a file written to since its listing stays.
    await utimes(path.join(tmp, "new.part"), twoDaysAgo, twoDaysAgo);
    const listedOld = await stalePartials(root, new Date(Date.now() - AUDIT_GRACE_MS));
    expect(listedOld.map((p) => path.basename(p.file))).toEqual(["new.part"]);
    const now = new Date();
    await utimes(path.join(tmp, "new.part"), now, now);
    expect(await removePartial(path.join(tmp, "new.part"), new Date(Date.now() - AUDIT_GRACE_MS))).toBe(false);
    expect(await readdir(tmp)).toEqual(["new.part"]);
  });
});
