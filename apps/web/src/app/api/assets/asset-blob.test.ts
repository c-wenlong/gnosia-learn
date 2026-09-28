import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { fsStore, key as blobKey } from "@self-learn/blob";
import { asset, assetDerivation, blobObject } from "@self-learn/schema";
import { eq } from "drizzle-orm";

import { applyMigrations } from "../../../../../../services/catalog/src/migrations";
import { BEFORE_BLOB_CONTRACT, partialMigrations } from "../../../../../../services/catalog/test/partial-migrations";
import {
  createScratchDatabase,
  probe,
  type Scratch,
} from "../../../../../../services/catalog/test/scratch-database";

/**
 * The asset routes serving from the blob store (docs/CONTENT-MIGRATION.md,
 * Track E), through the streaming path the `fs` adapter takes because its
 * `signedUrl` is null. The redirect path, which a cloud store takes, is in
 * `asset-blob-redirect.test.ts` with a store that signs local URLs.
 *
 * `ASSET_FILES_ENABLED` is off for this whole file, on purpose: it gates the
 * legacy file branch only, and a blob is served whatever it says. No legacy
 * file exists for any of these rows either, so a 200 can only have come from
 * the store.
 */

const reachable = await probe();

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

const VIDEO = Buffer.from(Array.from({ length: 3_000 }, (_, i) => (i % 253) + 1));
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7, 0xff, 0xd9]);
const VIDEO_ID = "manimkc:out/algorithms/demo/demo.mp4";
const POSTER_ID = `poster:${VIDEO_ID}`;
const PENDING_ID = "manimkc:out/algorithms/demo/pending.mp4";
const LOST_ID = "manimkc:out/algorithms/demo/lost.mp4";
const LEGACY_ID = "manimkc:out/algorithms/demo/legacy.mp4";
const ORIGIN = "http://localhost:3000";

type Handler = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;

const codeOf = async (response: Response): Promise<unknown> =>
  ((await response.clone().json()) as { code?: unknown }).code;

describe.skipIf(!reachable.ok)("asset routes from the blob store", () => {
  let scratch: Scratch;
  let home: string;
  let FILE: Handler;
  let POSTER: Handler;
  let STATUS: Handler;
  let library: typeof import("@/lib/asset-library");

  const call = (handler: Handler, suffix: string, id: string, headers: Record<string, string> = {}) =>
    handler(new Request(`${ORIGIN}/api/assets/${encodeURIComponent(id)}/${suffix}`, { headers }), {
      params: Promise.resolve({ id }),
    });

  /** Stores `bytes` and writes the `blob_object` row, as `catalog asset upload` leaves them. */
  const stored = async (bytes: Buffer, ext: string, state: "present" | "pending" = "present", put = true) => {
    const key = blobKey("local", sha256(bytes), ext);
    if (put) {
      const file = path.join(home, `upload.${ext}`);
      await writeFile(file, bytes);
      await fsStore(path.join(home, "blobs")).put(key, createReadStream(file), {
        sha256: sha256(bytes),
        bytes: bytes.length,
        mime: "application/octet-stream",
      });
    }
    await scratch.db
      .insert(blobObject)
      .values({
        key,
        sha256: sha256(bytes),
        bytes: bytes.length,
        mime: "video/mp4",
        provider: "fs",
        state,
        confirmedAt: state === "present" ? new Date() : null,
      })
      .onConflictDoNothing();
    return key;
  };

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    // At 0012: these rows carry a path and no blob, which the contract (0013)
    // forbids; p2/readers-db-only rewrites the suite for the contract.
    await applyMigrations(scratch.db, { folder: await partialMigrations(BEFORE_BLOB_CONTRACT) });
    home = await mkdtemp(path.join(tmpdir(), "asset-blob-"));
    process.env.DATABASE_URL = scratch.url;
    process.env.SELF_LEARN_HOME = home;
    delete process.env.ASSET_FILES_ENABLED;
    ({ GET: FILE } = (await import("./[id]/file/route")) as { GET: Handler });
    ({ GET: POSTER } = (await import("./[id]/poster/route")) as { GET: Handler });
    ({ GET: STATUS } = (await import("./[id]/status/route")) as { GET: Handler });
    library = await import("@/lib/asset-library");

    const videoKey = await stored(VIDEO, "mp4");
    const posterKey = await stored(JPEG, "jpg");
    const pendingBytes = Buffer.from("half an upload");
    const pendingKey = await stored(pendingBytes, "mp4", "pending", false);
    const lostBytes = Buffer.from("the store lost this one");
    const lostKey = await stored(lostBytes, "mp4", "present", false);
    const video = (id: string, file: string, key: string | null, bytes: Buffer) => ({
      id,
      kind: "video",
      path: file,
      url: null,
      contentHash: sha256(bytes),
      bytes: bytes.length,
      title: "Demo",
      sourceRepo: "manimkc",
      blobKey: key,
    });
    await scratch.db.insert(asset).values([
      video(VIDEO_ID, "out/algorithms/demo/demo.mp4", videoKey, VIDEO),
      video(PENDING_ID, "out/algorithms/demo/pending.mp4", pendingKey, pendingBytes),
      video(LOST_ID, "out/algorithms/demo/lost.mp4", lostKey, lostBytes),
      video(LEGACY_ID, "out/algorithms/demo/legacy.mp4", null, VIDEO),
      {
        id: POSTER_ID,
        kind: "poster",
        path: null,
        url: null,
        contentHash: sha256(JPEG),
        bytes: JPEG.length,
        title: "Demo (poster)",
        sourceRepo: "self-learn",
        blobKey: posterKey,
      },
    ]);
    await scratch.db.insert(assetDerivation).values({ assetId: POSTER_ID, sourceAssetId: VIDEO_ID });
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
    if (home !== undefined) await rm(home, { recursive: true, force: true });
    delete process.env.SELF_LEARN_HOME;
  });

  beforeEach(() => {
    delete process.env.ASSET_FILES_ENABLED;
  });

  it("streams a stored video whole, with the player's headers, while the file switch is off", async () => {
    const response = await call(FILE, "file", VIDEO_ID);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-length")).toBe(String(VIDEO.length));
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="demo.mp4"');
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await response.arrayBuffer()).equals(VIDEO)).toBe(true);
  });

  it("answers a Range request with 206 and exactly that slice", async () => {
    const response = await call(FILE, "file", VIDEO_ID, { range: "bytes=100-199" });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe(`bytes 100-199/${VIDEO.length}`);
    expect(response.headers.get("content-length")).toBe("100");
    expect(Buffer.from(await response.arrayBuffer()).equals(VIDEO.subarray(100, 200))).toBe(true);
  });

  it("answers an open-ended and a suffix range the way a seeking player asks", async () => {
    const tail = await call(FILE, "file", VIDEO_ID, { range: "bytes=2990-" });
    expect(tail.status).toBe(206);
    expect(tail.headers.get("content-range")).toBe(`bytes 2990-2999/${VIDEO.length}`);
    expect(Buffer.from(await tail.arrayBuffer()).equals(VIDEO.subarray(2990))).toBe(true);

    const suffix = await call(FILE, "file", VIDEO_ID, { range: "bytes=-5" });
    expect(suffix.status).toBe(206);
    expect(Buffer.from(await suffix.arrayBuffer()).equals(VIDEO.subarray(VIDEO.length - 5))).toBe(true);
  });

  it("answers a range past the end with 416 and the real length", async () => {
    const response = await call(FILE, "file", VIDEO_ID, { range: "bytes=5000-6000" });
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe(`bytes */${VIDEO.length}`);
  });

  it("answers a pending blob with 404 not-uploaded, not a 500 and not the legacy file", async () => {
    process.env.ASSET_FILES_ENABLED = "1";
    const response = await call(FILE, "file", PENDING_ID);
    expect(response.status).toBe(404);
    expect(await codeOf(response)).toBe("not-uploaded");
    const status = await call(STATUS, "status", PENDING_ID);
    expect(status.status).toBe(404);
    expect(await status.json()).toEqual({ ok: false, code: "not-uploaded" });
  });

  it("answers a present row whose object the store lost with not-uploaded too", async () => {
    const response = await call(FILE, "file", LOST_ID);
    expect(response.status).toBe(404);
    expect(await codeOf(response)).toBe("not-uploaded");
  });

  it("still gates the legacy branch on the switch", async () => {
    const response = await call(FILE, "file", LEGACY_ID);
    expect(response.status).toBe(404);
    expect(await codeOf(response)).toBe("files-off");
  });

  it("reports a stored asset as fine to the page and the status route alike", async () => {
    expect(await (await call(STATUS, "status", VIDEO_ID)).json()).toEqual({ ok: true });
    const problems = await library.readFileProblems([VIDEO_ID, PENDING_ID, LEGACY_ID]);
    expect(Object.fromEntries(problems)).toEqual({
      [VIDEO_ID]: null,
      [PENDING_ID]: "not-uploaded",
      [LEGACY_ID]: "files-off",
    });
  });

  it("serves a stored poster, tagged by its hash, without looking for ffmpeg", async () => {
    const previousPath = process.env.PATH;
    process.env.PATH = "";
    try {
      const response = await call(POSTER, "poster", VIDEO_ID);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/jpeg");
      expect(response.headers.get("etag")).toBe(`"${sha256(JPEG)}"`);
      expect(response.headers.get("content-disposition")).toBe('inline; filename="demo.jpg"');
      expect(Buffer.from(await response.arrayBuffer()).equals(JPEG)).toBe(true);

      const again = await call(POSTER, "poster", VIDEO_ID, { "if-none-match": `W/"${sha256(JPEG)}"` });
      expect(again.status).toBe(304);

      expect(await (await call(STATUS, "status?for=poster", VIDEO_ID)).json()).toEqual({ ok: true });
    } finally {
      process.env.PATH = previousPath;
    }
  });

  it("serves the poster asset itself through the file route, as an image", async () => {
    const response = await call(FILE, "file", POSTER_ID);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await response.arrayBuffer()).equals(JPEG)).toBe(true);
  });

  it("falls back to the switch for a video with no stored poster", async () => {
    const response = await call(POSTER, "poster", LEGACY_ID);
    expect(response.status).toBe(404);
    expect(await codeOf(response)).toBe("files-off");
  });

  it("answers blob-store-unavailable when SELF_LEARN_HOME cannot be a store", async () => {
    const previous = process.env.SELF_LEARN_HOME;
    process.env.SELF_LEARN_HOME = "relative/path";
    try {
      const response = await call(FILE, "file", VIDEO_ID);
      expect(response.status).toBe(503);
      expect(await codeOf(response)).toBe("blob-store-unavailable");
    } finally {
      process.env.SELF_LEARN_HOME = previous;
    }
  });

  it("reads a stored transcript's text for the page", async () => {
    const text = Buffer.from('{"cues":[{"text":"hello"}]}');
    const key = await stored(text, "json");
    await scratch.db.insert(asset).values({
      id: "manimkc:out/algorithms/demo/demo.transcript.json",
      kind: "transcript",
      path: "out/algorithms/demo/demo.transcript.json",
      url: null,
      contentHash: sha256(text),
      bytes: text.length,
      title: "Demo (transcript)",
      sourceRepo: "manimkc",
      blobKey: key,
    });
    const read = await library.readAssetText(scratch.db, "manimkc:out/algorithms/demo/demo.transcript.json");
    expect(read).toBe(text.toString("utf8"));
    await scratch.db.delete(asset).where(eq(asset.id, "manimkc:out/algorithms/demo/demo.transcript.json"));
  });
});
