import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { fsStore, key as blobKey, type BlobStore } from "@gnosia/blob";
import { asset, blobObject } from "@gnosia/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { auditBlobs, AUDIT_GRACE_MS } from "../src/content/blob-audit";
import { migratedScratchDatabase, probe, type Scratch } from "./scratch-database";

/**
 * What `catalog blob audit --fix` deletes, and what it must not (S13 of the
 * phase 1 review, docs/CONTENT-MIGRATION.md edge case 9).
 *
 * `--fix` has three destructive branches: it deletes an orphan object, sends a
 * missing or corrupt row back to `pending`, and deletes a stale `pending` row.
 * Each is held here to both halves of its rule: the case it acts on, and every
 * case its guard exists for, so a guard that goes missing fails a test rather
 * than deleting somebody's bytes. Every case runs against a fresh store root
 * of its own that this database alone writes, which is the scoping the audit
 * relies on (two databases sharing a root is refused by the root's `.owner`
 * marker, which `blob-owner.test.ts` tests with the marker itself).
 */

const reachable = await probe();
const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const LATER = () => new Date(Date.now() + AUDIT_GRACE_MS + 60_000);

describe.skipIf(!reachable.ok)("blob audit --fix, branch by branch", () => {
  let scratch: Scratch;
  let base: string;
  let store: BlobStore;
  let root: string;

  /** Bytes into the store, as an upload leaves them. */
  const put = async (text: string, ext = "mp4"): Promise<string> => {
    const bytes = Buffer.from(text);
    const key = blobKey("local", sha256(bytes), ext);
    const file = path.join(base, `upload-${sha256(bytes)}.${ext}`);
    await writeFile(file, bytes);
    await store.put(key, createReadStream(file), { sha256: sha256(bytes), bytes: bytes.length, mime: "video/mp4" });
    return key;
  };

  /** A `blob_object` row for `text`, in `state`. */
  const row = async (text: string, state: "present" | "pending", ext = "mp4"): Promise<string> => {
    const bytes = Buffer.from(text);
    const key = blobKey("local", sha256(bytes), ext);
    await scratch.db.insert(blobObject).values({
      key,
      sha256: sha256(bytes),
      bytes: bytes.length,
      mime: "video/mp4",
      provider: "fs",
      state,
      confirmedAt: state === "present" ? new Date() : null,
    });
    return key;
  };

  /** An asset that points at `key`, so the row it names is referenced. */
  const pointAt = async (id: string, key: string, kind = "video") => {
    await scratch.db.insert(asset).values({
      id,
      kind,
      path: kind === "poster" ? null : `out/demo/${id.replace(/\W+/g, "-")}.mp4`,
      url: null,
      contentHash: "0".repeat(64),
      bytes: 1,
      title: id,
      sourceRepo: kind === "poster" ? "gnosia" : "manimkc",
      blobKey: key,
    });
  };

  const rowState = async (key: string) =>
    (await scratch.db.select({ state: blobObject.state }).from(blobObject).where(eq(blobObject.key, key)))[0]?.state ??
    null;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    base = await mkdtemp(path.join(tmpdir(), "blob-audit-fix-"));
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
    if (base !== undefined) await rm(base, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await scratch.db.execute(sql`truncate asset, blob_object, content_revision cascade`);
    root = await mkdtemp(path.join(base, "root-"));
    store = fsStore(root);
  });

  it("deletes an orphan object only once it is a day old, and never an object a row names", async () => {
    const orphan = await put("nobody's row");
    const known = await put("a row names me");
    await row("a row names me", "present");
    await pointAt("manimkc:out/demo/known.mp4", known);

    const now = await auditBlobs(scratch.db, store, { fix: true });
    expect(now.findings.filter((f) => f.fixed !== undefined)).toEqual([]);
    expect(await store.stat(orphan)).not.toBeNull();

    const later = await auditBlobs(scratch.db, store, { fix: true, now: LATER() });
    expect(later.findings).toEqual([expect.objectContaining({ kind: "orphan", key: orphan, fixed: "deleted" })]);
    expect(await store.stat(orphan)).toBeNull();
    // The object with a row is read, found intact and left exactly where it was.
    expect(await store.stat(known)).not.toBeNull();
    expect(await rowState(known)).toBe("present");
    expect(later.outstanding).toBe(0);
  });

  it("sends a missing or corrupt row back to pending, and deletes neither the row nor any bytes", async () => {
    const missing = await row("the store lost me", "present");
    await pointAt("manimkc:out/demo/missing.mp4", missing);
    const corrupt = await put("the bytes I was uploaded as");
    await row("the bytes I was uploaded as", "present");
    await pointAt("manimkc:out/demo/corrupt.mp4", corrupt);
    const [owner, name] = corrupt.split("/") as [string, string];
    await writeFile(path.join(root, owner, name), "tampered");

    const fixed = await auditBlobs(scratch.db, store, { fix: true, now: LATER() });
    expect(fixed.findings.map((f) => [f.kind, f.key, f.fixed]).sort()).toEqual(
      [
        ["corrupt", corrupt, "marked-pending"],
        ["missing", missing, "marked-pending"],
      ].sort(),
    );
    expect(await rowState(missing)).toBe("pending");
    expect(await rowState(corrupt)).toBe("pending");
    // The tampered object is evidence, not an orphan: a row still names it.
    expect(await store.stat(corrupt)).not.toBeNull();
    // Both assets now answer not-uploaded, so the audit keeps failing.
    expect(fixed.outstanding).toBe(2);
    // A second --fix a day later deletes nothing: the rows are pointed at.
    const again = await auditBlobs(scratch.db, store, { fix: true, now: LATER() });
    expect(again.findings.every((f) => f.kind === "pending" && f.fixed === undefined)).toBe(true);
    expect(await rowState(missing)).toBe("pending");
    expect(await store.stat(corrupt)).not.toBeNull();
  });

  it("deletes a day-old pending row with no object and nothing pointing at it, and keeps each one a guard names", async () => {
    const stale = await row("abandoned upload", "pending");
    const pointed = await row("pointed at, bytes lost", "pending");
    await pointAt("manimkc:out/demo/pointed.mp4", pointed);
    const withObject = await put("uploaded, never confirmed");
    await row("uploaded, never confirmed", "pending");

    const young = await auditBlobs(scratch.db, store, { fix: true });
    expect(young.findings.filter((f) => f.fixed !== undefined)).toEqual([]);
    expect(await rowState(stale)).toBe("pending");

    const old = await auditBlobs(scratch.db, store, { fix: true, now: LATER() });
    const byKey = new Map(old.findings.map((f) => [f.key, f] as const));
    expect(byKey.get(stale)).toMatchObject({ kind: "stale-pending", fixed: "row-deleted" });
    expect(await rowState(stale)).toBeNull();
    // Pointed at: its asset needs the row to say not-uploaded, and the upload to rerun.
    expect(byKey.get(pointed)).toMatchObject({ kind: "pending" });
    expect(byKey.get(pointed)?.fixed).toBeUndefined();
    expect(await rowState(pointed)).toBe("pending");
    // Its bytes are in the store: an upload that did not confirm, to rerun, not to forget.
    expect(byKey.get(withObject)).toMatchObject({ kind: "pending" });
    expect(await rowState(withObject)).toBe("pending");
    expect(await store.stat(withObject)).not.toBeNull();
  });

  it("leaves an unreferenced present row and an orphan poster alone", async () => {
    const unreferenced = await put("the old render");
    await row("the old render", "present");
    const poster = await put("a poster of a pruned video", "jpg");
    await row("a poster of a pruned video", "present", "jpg");
    await pointAt("poster:manimkc:out/demo/pruned.mp4", poster, "poster");

    const audit = await auditBlobs(scratch.db, store, { fix: true, now: LATER() });
    expect(audit.findings.map((f) => f.kind).sort()).toEqual(["orphan-poster", "unreferenced"]);
    expect(audit.findings.every((f) => f.fixed === undefined)).toBe(true);
    expect(await store.stat(unreferenced)).not.toBeNull();
    expect(await rowState(unreferenced)).toBe("present");
    expect(await store.stat(poster)).not.toBeNull();
    expect(audit.outstanding).toBe(0);
  });
});
