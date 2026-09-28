import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { asset, indexRun } from "@self-learn/schema";

import type { RouteProblemCode } from "@/lib/asset-problems";

import { applyMigrations } from "../../../../../../services/catalog/src/migrations";
import { BEFORE_BLOB_CONTRACT, partialMigrations } from "../../../../../../services/catalog/test/partial-migrations";
import {
  createScratchDatabase,
  probe,
  type Scratch,
} from "../../../../../../services/catalog/test/scratch-database";

/**
 * `GET /api/assets/<id>/file`, against a scratch database and a scratch data
 * root.
 *
 * The route reads files off the filesystem from an identifier in a URL, so the
 * interesting assertions are the refusals. Four of them are here and nowhere
 * else: an id that tries to climb out of the tree finds no row, a stored path
 * that climbs out is refused on the resolved path rather than on a string
 * prefix, a symlink inside the tree that points out of it is caught after
 * `realpath`, and an extension nobody has declared is refused instead of
 * guessed at.
 *
 * The manimkc data root is a temporary directory, which is also what makes the
 * fifth case testable: the root moving and nobody re-indexing is the state the
 * real database was found in, and it has to read as "re-run the indexer"
 * rather than as "the video is gone".
 *
 * `DATABASE_URL` and `ASSET_FILES_ENABLED` are both set before the route is
 * imported: the store opens one pool per process on first use, and the gate is
 * read per request but the module is not worth importing twice.
 */

const reachable = await probe();

/** 1 kB of recognisable bytes, so a slice can be checked against its offset. */
const VIDEO = Buffer.from(
  Array.from({ length: 1_000 }, (_, i) => (i % 251) + 1),
);

const VIDEO_ID = "manimkc:out/algorithms/demo/demo.mp4";
const ORIGIN = "http://localhost:3000";

type Handler = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;

/** The machine-readable reason a refusal carries, which is what a page switches on. */
const codeOf = async (response: Response): Promise<unknown> =>
  ((await response.clone().json()) as { code?: unknown }).code;

describe.skipIf(!reachable.ok)("asset file route", () => {
  let scratch: Scratch;
  let GET: Handler;
  let STATUS: Handler;
  /** manimkc's data root for this run: the base every `out/…` path resolves against. */
  let dataRoot: string;
  /** A directory beside it, standing in for anything the route must not reach. */
  let outside: string;
  /** The temporary tree holding both, removed at the end of the run. */
  let base: string;

  const call = async (id: string, headers: Record<string, string> = {}) =>
    GET(new Request(`${ORIGIN}/api/assets/${encodeURIComponent(id)}/file`, { headers }), {
      params: Promise.resolve({ id }),
    });

  /** `GET /api/assets/<id>/status`, the probe a failed element makes. */
  const status = async (id: string) =>
    STATUS(new Request(`${ORIGIN}/api/assets/${encodeURIComponent(id)}/status`), {
      params: Promise.resolve({ id }),
    });

  /** The file route and the status route answer one broken state the same way. */
  const expectRefusal = async (id: string, httpStatus: number, code: RouteProblemCode) => {
    const file = await call(id);
    expect(file.status, id).toBe(httpStatus);
    expect(await codeOf(file), id).toBe(code);

    const probe = await status(id);
    expect(probe.status, id).toBe(httpStatus);
    expect(await probe.json(), id).toEqual({ ok: false, code });
  };

  const seed = async (row: {
    id: string;
    kind: string;
    path?: string;
    url?: string;
    sourceRepo: string;
  }) => {
    await scratch.db
      .insert(asset)
      .values({
        id: row.id,
        kind: row.kind,
        path: row.path ?? null,
        url: row.url ?? null,
        sourceRepo: row.sourceRepo,
      })
      .onConflictDoNothing();
  };

  /** The `index_run` row the route reads the manimkc data root out of. */
  const recordRun = async (metadata: Record<string, unknown>) => {
    const now = new Date();
    await scratch.db
      .insert(indexRun)
      .values({
        source: "manimkc",
        // Deliberately not the data root: this is the checkout the CLI read,
        // which is exactly the distinction the route has to get right.
        sourceRoot: path.join(outside, "checkout"),
        startedAt: now,
        finishedAt: now,
        metadata,
      })
      .onConflictDoUpdate({ target: indexRun.source, set: { metadata } });
  };

  beforeAll(async () => {
    base = await mkdtemp(path.join(tmpdir(), "asset-files-"));
    dataRoot = path.join(base, "manimkc-home");
    outside = path.join(base, "outside");
    await mkdir(path.join(dataRoot, "out", "algorithms", "demo"), { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(path.join(dataRoot, "out", "algorithms", "demo", "demo.mp4"), VIDEO);
    await writeFile(path.join(dataRoot, "out", "empty.mp4"), "");
    await writeFile(path.join(outside, "secret.mp4"), "not yours");
    await symlink(
      path.join(outside, "secret.mp4"),
      path.join(dataRoot, "out", "algorithms", "demo", "link.mp4"),
    );

    scratch = await createScratchDatabase();
    // At 0012: these rows carry a path and no blob, which the contract (0013)
    // forbids; p2/readers-db-only rewrites the suite for the contract.
    await applyMigrations(scratch.db, { folder: await partialMigrations(BEFORE_BLOB_CONTRACT) });
    process.env.DATABASE_URL = scratch.url;
    process.env.ASSET_FILES_ENABLED = "1";
    ({ GET } = (await import("./[id]/file/route")) as { GET: Handler });
    ({ GET: STATUS } = (await import("./[id]/status/route")) as { GET: Handler });

    await seed({ id: VIDEO_ID, kind: "video", path: "out/algorithms/demo/demo.mp4", sourceRepo: "manimkc" });
    await seed({ id: "manimkc:out/empty.mp4", kind: "video", path: "out/empty.mp4", sourceRepo: "manimkc" });
    await seed({ id: "manimkc:out/gone.mp4", kind: "video", path: "out/gone.mp4", sourceRepo: "manimkc" });
    await seed({
      id: "manimkc:climb",
      kind: "video",
      path: "out/../../outside/secret.mp4",
      sourceRepo: "manimkc",
    });
    await seed({
      id: "manimkc:out/algorithms/demo/link.mp4",
      kind: "video",
      path: "out/algorithms/demo/link.mp4",
      sourceRepo: "manimkc",
    });
    await seed({
      id: "diagram:dot-product",
      kind: "diagram_svg",
      path: "learn/assets/dot-product.svg",
      sourceRepo: "self-learn",
    });
    await seed({
      id: "diagram:dot-product.tldr",
      kind: "diagram_source",
      path: "learn/assets/dot-product.tldr",
      sourceRepo: "self-learn",
    });
    await seed({
      id: "link:cs3230-notes",
      kind: "link",
      url: "https://example.com/notes",
      sourceRepo: "self-learn",
    });
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
    if (base !== undefined) await rm(base, { recursive: true, force: true });
    delete process.env.ASSET_FILES_ENABLED;
  });

  beforeEach(async () => {
    process.env.ASSET_FILES_ENABLED = "1";
    await recordRun({ outRoot: dataRoot });
  });

  it("serves a whole file with the headers a player needs", async () => {
    const response = await call(VIDEO_ID);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-length")).toBe("1000");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="demo.mp4"');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(VIDEO);
  });

  it("refuses to let a stored file execute as script in this origin", async () => {
    const response = await call("diagram:dot-product");
    expect(response.status).toBe(200);
    // An SVG is a document, so the type is right and the sandbox is what makes
    // it safe. nosniff keeps everything else from being re-read as one.
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");

    const csp = response.headers.get("content-security-policy") ?? "";
    // Script off, in both the way that stops it and the way that says so.
    expect(csp).toContain("sandbox");
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("default-src 'none'");
    // And the three a tldrawkc export needs, or the diagram comes back 200 and
    // unstyled: it writes its CSS inline and embeds its fonts as data URLs.
    // Whether that actually renders is not a thing jsdom can answer, so it is
    // verified by opening one in a browser; this pins the header.
    expect(csp).toContain("style-src 'unsafe-inline'");
    expect(csp).toContain("font-src data:");
    expect(csp).toContain("img-src data:");
  });

  it("answers a range with a 206 and the slice that was asked for", async () => {
    const response = await call(VIDEO_ID, { range: "bytes=10-19" });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 10-19/1000");
    expect(response.headers.get("content-length")).toBe("10");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(VIDEO.subarray(10, 20));
  });

  it("reads an open range and a suffix range to the end of the file", async () => {
    const open = await call(VIDEO_ID, { range: "bytes=990-" });
    expect(open.headers.get("content-range")).toBe("bytes 990-999/1000");
    expect(Buffer.from(await open.arrayBuffer())).toEqual(VIDEO.subarray(990));

    const suffix = await call(VIDEO_ID, { range: "bytes=-10" });
    expect(suffix.headers.get("content-range")).toBe("bytes 990-999/1000");
    expect(Buffer.from(await suffix.arrayBuffer())).toEqual(VIDEO.subarray(990));
  });

  it("answers 416 with the real length when the range is past the end", async () => {
    const response = await call(VIDEO_ID, { range: "bytes=5000-6000" });
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */1000");
    expect(await response.text()).toBe("");

    // An empty file can satisfy no range at all.
    const empty = await call("manimkc:out/empty.mp4", { range: "bytes=0-" });
    expect(empty.status).toBe(416);
    expect(empty.headers.get("content-range")).toBe("bytes */0");
  });

  it("sends the whole file when the range header is one it does not speak", async () => {
    // RFC 9110 lets a server ignore a Range it cannot honour, and a multipart
    // response is work no browser needs to scrub a video.
    for (const range of ["frames=1-2", "bytes=abc", "bytes=0-9,20-29", ""]) {
      const response = await call(VIDEO_ID, { range });
      expect(response.status, range).toBe(200);
      expect(response.headers.get("content-length"), range).toBe("1000");
    }
  });

  it("404s an id the catalog does not have", async () => {
    await expectRefusal("manimkc:out/nothing-like-this.mp4", 404, "not-in-catalog");
  });

  it("404s a row whose file is not on disk, and one that has no file at all", async () => {
    await expectRefusal("manimkc:out/gone.mp4", 404, "file-missing");
    // A link asset is a url and nothing else.
    await expectRefusal("link:cs3230-notes", 404, "no-file");
  });

  it("never joins the id onto a path", async () => {
    // The traversal that a naive route would fall for: it is not a path here,
    // it is a primary key, and no row has this one.
    const response = await call("manimkc:out/../../../../etc/passwd");
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("root:");
  });

  it("refuses a stored path that climbs out of its root", async () => {
    const response = await call("manimkc:climb");
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("not yours");
    await expectRefusal("manimkc:climb", 404, "refused");
  });

  it("refuses a symlink inside the root that points out of it", async () => {
    const response = await call("manimkc:out/algorithms/demo/link.mp4");
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("not yours");
    await expectRefusal("manimkc:out/algorithms/demo/link.mp4", 404, "refused");
  });

  it("refuses an extension it has no declared type for", async () => {
    // A real committed file, so this is the refusal and not a missing file.
    await expectRefusal("diagram:dot-product.tldr", 404, "unsupported-type");
  });

  it("says the index is stale rather than pretending the file is gone", async () => {
    await recordRun({});
    const response = await call(VIDEO_ID);
    expect(response.status).toBe(503);
    const body = (await response.json()) as { detail: string };
    expect(body.detail).toContain("npm run catalog -- index --only manimkc");
    await expectRefusal(VIDEO_ID, 503, "manimkc-stale");
  });

  it("says so when manimkc has never been indexed here", async () => {
    await scratch.db.delete(indexRun);
    const response = await call(VIDEO_ID);
    expect(response.status).toBe(503);
    const body = (await response.json()) as { detail: string };
    expect(body.detail).toContain("never been indexed");
    await expectRefusal(VIDEO_ID, 503, "manimkc-unindexed");
  });

  it("serves nothing at all when the deployment has not opted in", async () => {
    delete process.env.ASSET_FILES_ENABLED;
    const response = await call(VIDEO_ID);
    expect(response.status).toBe(404);
    await expectRefusal(VIDEO_ID, 404, "files-off");

    process.env.ASSET_FILES_ENABLED = "false";
    expect((await call(VIDEO_ID)).status).toBe(404);
  });

  describe("the status route", () => {
    it("answers ok for a file the route would serve, and sends none of it", async () => {
      const response = await status(VIDEO_ID);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const text = await response.text();
      expect(JSON.parse(text)).toEqual({ ok: true });
      // A few bytes of JSON, never the 1 kB file.
      expect(text.length).toBeLessThan(40);
    });

    it("never carries a stored path, only the category", async () => {
      const response = await status("manimkc:out/gone.mp4");
      const text = await response.text();
      expect(text).not.toContain("out/gone.mp4");
      expect(text).not.toContain(dataRoot);
      expect(Object.keys(JSON.parse(text) as object).sort()).toEqual(["code", "ok"]);
    });

    it("adds the poster route's refusals when asked about a poster", async () => {
      const poster = async (id: string) =>
        STATUS(
          new Request(`${ORIGIN}/api/assets/${encodeURIComponent(id)}/status?for=poster`),
          { params: Promise.resolve({ id }) },
        );

      const notVideo = await poster("diagram:dot-product");
      expect(notVideo.status).toBe(404);
      expect(await notVideo.json()).toEqual({ ok: false, code: "not-a-video" });

      const previous = process.env.FFMPEG_PATH;
      process.env.FFMPEG_PATH = path.join(base, "no-ffmpeg-here");
      try {
        const noFfmpeg = await poster(VIDEO_ID);
        expect(noFfmpeg.status).toBe(503);
        expect(await noFfmpeg.json()).toEqual({ ok: false, code: "no-ffmpeg" });
      } finally {
        if (previous === undefined) delete process.env.FFMPEG_PATH;
        else process.env.FFMPEG_PATH = previous;
      }
    });
  });
});
