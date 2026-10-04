import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { fsStore, key as blobKey, type BlobStore } from "@self-learn/blob";
import { asset, assetDerivation, blobObject } from "@self-learn/schema";

import {
  migratedScratchDatabase,
  probe,
  type Scratch,
} from "../../../../../../services/catalog/test/scratch-database";

// A signed-in request, so the owner seam (`@/lib/owner`) resolves `local`.
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));

/**
 * The redirect path (docs/CONTENT-MIGRATION.md, Track E; edge case 10): a store
 * that can sign URLs is never streamed through the route. The store here is the
 * `fs` adapter with `signedUrl` answering a URL on a local HTTP server that
 * serves the object with Range support, which is what a cloud store's signed
 * URL does. The route must hand the browser that URL and nothing of the
 * asset's own path, and the browser's Range requests must then work against
 * the store directly.
 */

const reachable = await probe();

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

const VIDEO = Buffer.from(Array.from({ length: 2_000 }, (_, i) => (i * 3) % 255));
const JPEG = Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
const VIDEO_PATH = "out/secret-domain/demo/demo.mp4";
const VIDEO_ID = `manimkc:${VIDEO_PATH}`;
const POSTER_ID = `poster:${VIDEO_ID}`;
const TTLS: number[] = [];

/** Filled in by `beforeAll`, read by the mocked module on every call. */
const signing: { store: BlobStore | null; origin: string } = { store: null, origin: "" };

vi.mock("@/lib/blob-store", () => ({
  SIGNED_URL_TTL_SECONDS: 3600,
  assetBlobStore: (): BlobStore => {
    const inner = signing.store;
    if (inner === null) throw new Error("store not ready");
    return {
      ...inner,
      provider: inner.provider,
      signedUrl: async (key: string, ttl: number) => {
        TTLS.push(ttl);
        return `${signing.origin}/signed/${encodeURIComponent(key)}?expires=${ttl}`;
      },
    };
  },
}));

type Handler = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;

describe.skipIf(!reachable.ok)("asset routes redirecting to a signed URL", () => {
  let scratch: Scratch;
  let home: string;
  let server: Server;
  let FILE: Handler;
  let POSTER: Handler;

  const call = (handler: Handler, suffix: string, id: string) =>
    handler(new Request(`http://localhost:3000/api/assets/${encodeURIComponent(id)}/${suffix}`), {
      params: Promise.resolve({ id }),
    });

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    home = await mkdtemp(path.join(tmpdir(), "asset-redirect-"));
    const store = fsStore(path.join(home, "blobs"));
    signing.store = store;

    // Stands in for the store's own HTTP endpoint: Range in, 206 out.
    server = createServer((request, response) => {
      const key = decodeURIComponent((request.url ?? "").split("?")[0]?.replace("/signed/", "") ?? "");
      const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? "");
      const range = match ? { start: Number(match[1]), end: match[2] ? Number(match[2]) : Number.MAX_SAFE_INTEGER } : undefined;
      store.get(key, range).then(
        (read) => {
          response.writeHead(range ? 206 : 200, {
            "content-length": String(read.end - read.start + 1),
            ...(range ? { "content-range": `bytes ${read.start}-${read.end}/${read.size}` } : {}),
          });
          read.body.pipe(response);
        },
        () => {
          response.writeHead(404);
          response.end();
        },
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    signing.origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    process.env.DATABASE_URL = scratch.url;
    process.env.SELF_LEARN_HOME = home;
    ({ GET: FILE } = (await import("./[id]/file/route")) as { GET: Handler });
    ({ GET: POSTER } = (await import("./[id]/poster/route")) as { GET: Handler });

    const put = async (bytes: Buffer, ext: string) => {
      const key = blobKey("local", sha256(bytes), ext);
      const file = path.join(home, `upload.${ext}`);
      await writeFile(file, bytes);
      await store.put(key, createReadStream(file), { sha256: sha256(bytes), bytes: bytes.length, mime: "x/y" });
      await scratch.db.insert(blobObject).values({
        key,
        sha256: sha256(bytes),
        bytes: bytes.length,
        mime: "x/y",
        provider: "fs",
        state: "present",
        confirmedAt: new Date(),
      });
      return key;
    };
    const videoKey = await put(VIDEO, "mp4");
    const posterKey = await put(JPEG, "jpg");
    await scratch.db.insert(asset).values([
      {
        id: VIDEO_ID,
        kind: "video",
        path: VIDEO_PATH,
        contentHash: sha256(VIDEO),
        bytes: VIDEO.length,
        sourceRepo: "manimkc",
        blobKey: videoKey,
      },
      {
        id: POSTER_ID,
        kind: "poster",
        contentHash: sha256(JPEG),
        bytes: JPEG.length,
        sourceRepo: "self-learn",
        blobKey: posterKey,
      },
    ]);
    await scratch.db.insert(assetDerivation).values({ assetId: POSTER_ID, sourceAssetId: VIDEO_ID });
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    await scratch?.drop();
    if (home !== undefined) await rm(home, { recursive: true, force: true });
    delete process.env.SELF_LEARN_HOME;
  });

  it("redirects to the store's URL for an hour, carrying no path, and never caches the redirect", async () => {
    const response = await call(FILE, "file", VIDEO_ID);
    expect(response.status).toBe(302);
    const location = response.headers.get("location") ?? "";
    expect(location.startsWith(`${signing.origin}/signed/`)).toBe(true);
    expect(location).not.toContain("secret-domain");
    expect(location).not.toContain(encodeURIComponent("secret-domain"));
    expect(location).not.toContain(home);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(TTLS.at(-1)).toBe(3600);
    expect(await response.text()).toBe("");
  });

  it("leaves seeking to the store: a Range request at the signed URL returns 206", async () => {
    const location = (await call(FILE, "file", VIDEO_ID)).headers.get("location") as string;
    const slice = await fetch(location, { headers: { range: "bytes=500-599" } });
    expect(slice.status).toBe(206);
    expect(slice.headers.get("content-range")).toBe(`bytes 500-599/${VIDEO.length}`);
    expect(Buffer.from(await slice.arrayBuffer()).equals(VIDEO.subarray(500, 600))).toBe(true);
  });

  it("redirects the poster the same way", async () => {
    const response = await call(POSTER, "poster", VIDEO_ID);
    expect(response.status).toBe(302);
    const body = await fetch(response.headers.get("location") as string);
    expect(Buffer.from(await body.arrayBuffer()).equals(JPEG)).toBe(true);
  });
});
