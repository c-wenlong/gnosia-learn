import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { fsStore, key as blobKey } from "@gnosia/blob";
import { asset, assetDerivation, blobObject } from "@gnosia/schema";
import { eq } from "drizzle-orm";

import { applyMigrations } from "../../../../../../services/catalog/src/migrations";
import {
  createScratchDatabase,
  probe,
  type Scratch,
  withoutConstraint,
} from "../../../../../../services/catalog/test/scratch-database";

// A signed-in request, so the owner seam (`@/lib/owner`) resolves `local`.
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));

/**
 * The asset routes serving from the blob store (docs/CONTENT-MIGRATION.md,
 * Track E), through the streaming path the `fs` adapter takes because its
 * `signedUrl` is null. The redirect path, which a cloud store takes, is in
 * `asset-blob-redirect.test.ts` with a store that signs local URLs.
 *
 * No file exists for any of these rows on disk, and the routes read none
 * since phase 2 took the legacy file branch out, so a 200 can only have come
 * from the store.
 */

const reachable = await probe();

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

const VIDEO = Buffer.from(Array.from({ length: 3_000 }, (_, i) => (i % 253) + 1));
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7, 0xff, 0xd9]);
const VIDEO_ID = "manimkc:out/algorithms/demo/demo.mp4";
const POSTER_ID = `poster:${VIDEO_ID}`;
const PENDING_ID = "manimkc:out/algorithms/demo/pending.mp4";
const LOST_ID = "manimkc:out/algorithms/demo/lost.mp4";
const SVG_ID = "tldrawkc:learn/assets/demo-diagram.svg";
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
    // The diagram SVG with no blob, whose not-uploaded hint this checks, is
    // a row the contract forbids — in the SQLite schema a CHECK constraint
    // from 0000 on, so the table is rebuilt without it rather than the
    // migrations stopped before it. Every other row here carries a blob and
    // would pass it.
    await applyMigrations(scratch.db);
    await withoutConstraint(scratch.db, "asset", "asset_stored_blob_check");
    home = await mkdtemp(path.join(tmpdir(), "asset-blob-"));
    process.env.DATABASE_URL = scratch.url;
    process.env.GNOSIA_HOME = home;
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
      {
        id: SVG_ID,
        kind: "diagram_svg",
        path: "learn/assets/demo-diagram.svg",
        url: null,
        contentHash: sha256(Buffer.from("<svg/>")),
        bytes: 6,
        title: "Demo diagram",
        sourceRepo: "gnosia",
        blobKey: null,
      },
      {
        id: POSTER_ID,
        kind: "poster",
        path: null,
        url: null,
        contentHash: sha256(JPEG),
        bytes: JPEG.length,
        title: "Demo (poster)",
        sourceRepo: "gnosia",
        blobKey: posterKey,
      },
    ]);
    await scratch.db.insert(assetDerivation).values({ assetId: POSTER_ID, sourceAssetId: VIDEO_ID });
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
    if (home !== undefined) await rm(home, { recursive: true, force: true });
    delete process.env.GNOSIA_HOME;
  });

  it("streams a stored video whole, with the player's headers", async () => {
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

  it("saves the file under its title with ?download=1, the bytes and the other headers unchanged", async () => {
    const response = await FILE(
      new Request(`${ORIGIN}/api/assets/${encodeURIComponent(VIDEO_ID)}/file?download=1`),
      { params: Promise.resolve({ id: VIDEO_ID }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="Demo.mp4"');
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    expect(Buffer.from(await response.arrayBuffer()).equals(VIDEO)).toBe(true);

    // Anything but 1 is the inline answer every embed relies on.
    const inline = await FILE(
      new Request(`${ORIGIN}/api/assets/${encodeURIComponent(VIDEO_ID)}/file?download=yes`),
      { params: Promise.resolve({ id: VIDEO_ID }) },
    );
    expect(inline.headers.get("content-disposition")).toBe('inline; filename="demo.mp4"');
  });

  it("keeps the attachment on a Range request for a download", async () => {
    const response = await FILE(
      new Request(`${ORIGIN}/api/assets/${encodeURIComponent(VIDEO_ID)}/file?download=1`, { headers: { range: "bytes=0-9" } }),
      { params: Promise.resolve({ id: VIDEO_ID }) },
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="Demo.mp4"');
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

  it("names the diagram writer, not the manimkc upload, for a diagram SVG with no stored copy", async () => {
    const response = await call(FILE, "file", SVG_ID);
    expect(response.status).toBe(404);
    const body = (await response.json()) as { code?: string; detail?: string };
    expect(body.code).toBe("not-uploaded");
    expect(body.detail).toContain("catalog -- diagram put --slug demo-diagram");
    expect(body.detail).not.toContain("manimkc");
  });

  it("answers a pending blob with 404 not-uploaded, not a 500", async () => {
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

  it("reports a stored asset as fine to the page and the status route alike", async () => {
    expect(await (await call(STATUS, "status", VIDEO_ID)).json()).toEqual({ ok: true });
    const problems = await library.readFileProblems([VIDEO_ID, PENDING_ID, LOST_ID]);
    expect(Object.fromEntries(problems)).toEqual({
      [VIDEO_ID]: null,
      [PENDING_ID]: "not-uploaded",
      [LOST_ID]: "not-uploaded",
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

  it("answers not-uploaded for a video with no stored poster, and cuts none", async () => {
    const response = await call(POSTER, "poster", PENDING_ID);
    expect(response.status).toBe(404);
    expect(await codeOf(response)).toBe("not-uploaded");
    expect(await (await call(STATUS, "status?for=poster", PENDING_ID)).json()).toEqual({
      ok: false,
      code: "not-uploaded",
    });
  });

  it("answers not-a-video for a poster of anything else, and not-in-catalog for no row", async () => {
    const notVideo = await call(POSTER, "poster", POSTER_ID);
    expect(notVideo.status).toBe(404);
    expect(await codeOf(notVideo)).toBe("not-a-video");
    const none = await call(POSTER, "poster", "manimkc:out/nothing.mp4");
    expect(none.status).toBe(404);
    expect(await codeOf(none)).toBe("not-in-catalog");
  });

  it("answers blob-store-unavailable when GNOSIA_HOME cannot be a store", async () => {
    const previous = process.env.GNOSIA_HOME;
    process.env.GNOSIA_HOME = "relative/path";
    try {
      const response = await call(FILE, "file", VIDEO_ID);
      expect(response.status).toBe(503);
      expect(await codeOf(response)).toBe("blob-store-unavailable");
    } finally {
      process.env.GNOSIA_HOME = previous;
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
