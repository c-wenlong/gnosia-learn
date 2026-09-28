import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fsStore, key as blobKey } from "@self-learn/blob";
import { asset, blobObject, indexRun } from "@self-learn/schema";

import type { RouteProblemCode } from "@/lib/asset-problems";

import { applyMigrations } from "../../../../../../services/catalog/src/migrations";
import { partialMigrations } from "../../../../../../services/catalog/test/partial-migrations";
import {
  createScratchDatabase,
  probe,
  type Scratch,
} from "../../../../../../services/catalog/test/scratch-database";

/**
 * `GET /api/assets/<id>/file` and its status route, against a scratch database
 * and a scratch blob store: the refusals and the headers. The streaming and
 * Range answers for a stored video are in `asset-blob.test.ts`, row text in
 * `asset-rows.test.ts`.
 *
 * The one property this file adds since phase 2: **the route reads no file
 * off this machine's disk.** A video's bytes sit under a data root the
 * catalog recorded, exactly where the legacy branch used to find them, and
 * the answer is still `not-uploaded`, with `ASSET_FILES_ENABLED` set to the
 * value that used to switch that branch on. If the branch ever comes back,
 * this is the test that says so.
 *
 * The scratch database stops at 0012 on purpose. A video row with no
 * `blob_key` is the state the legacy branch served, and the phase 2 contract
 * migration forbids it; before that migration such rows are exactly what an
 * unflipped database holds, so this is the schema the property has to be
 * proved on.
 */

/** 0000 through 0012: the schema before the phase 2 contract migration. */
const THROUGH_0012 = 13;

const reachable = await probe();

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

const VIDEO = Buffer.from(Array.from({ length: 1_000 }, (_, i) => (i % 251) + 1));
const SVG = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><title>dot</title></svg>`);
const EMPTY = Buffer.alloc(0);
const ODD = Buffer.from("a kind nobody declared");

const ON_DISK_ID = "manimkc:out/algorithms/demo/demo.mp4";
const SVG_ID = "diagram:learn/assets/dot-product.svg";
const EMPTY_ID = "manimkc:out/empty.mp4";
const ODD_ID = "manimkc:out/odd.bin";
const LINK_ID = "link:cs3230-notes";
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
  /** The temporary tree: a manimkc data root, and the blob store's home. */
  let base: string;
  let dataRoot: string;
  const saved: Record<string, string | undefined> = {};

  const call = async (id: string, headers: Record<string, string> = {}) =>
    GET(new Request(`${ORIGIN}/api/assets/${encodeURIComponent(id)}/file`, { headers }), {
      params: Promise.resolve({ id }),
    });

  /** `GET /api/assets/<id>/status`, the probe a failed element makes. */
  const status = async (id: string, query = "") =>
    STATUS(new Request(`${ORIGIN}/api/assets/${encodeURIComponent(id)}/status${query}`), {
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

  /** Stores `bytes` and writes the `blob_object` row, as an upload leaves them. */
  const stored = async (bytes: Buffer, ext: string) => {
    const key = blobKey("local", sha256(bytes), ext);
    const file = path.join(base, `upload.${ext}`);
    await writeFile(file, bytes);
    await fsStore(path.join(base, "home", "blobs")).put(key, createReadStream(file), {
      sha256: sha256(bytes),
      bytes: bytes.length,
      mime: "application/octet-stream",
    });
    await scratch.db
      .insert(blobObject)
      .values({
        key,
        sha256: sha256(bytes),
        bytes: bytes.length,
        mime: "application/octet-stream",
        provider: "fs",
        state: "present",
        confirmedAt: new Date(),
      })
      .onConflictDoNothing();
    return key;
  };

  const row = (id: string, kind: string, file: string | null, key: string | null, sourceRepo = "manimkc") => ({
    id,
    kind,
    path: file,
    url: file === null ? "https://example.com/notes" : null,
    sourceRepo,
    blobKey: key,
  });

  beforeAll(async () => {
    for (const key of ["DATABASE_URL", "SELF_LEARN_HOME", "ASSET_FILES_ENABLED"]) saved[key] = process.env[key];
    base = await mkdtemp(path.join(tmpdir(), "asset-files-"));
    dataRoot = path.join(base, "manimkc-home");
    await mkdir(path.join(dataRoot, "out", "algorithms", "demo"), { recursive: true });
    await writeFile(path.join(dataRoot, "out", "algorithms", "demo", "demo.mp4"), VIDEO);

    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db, { folder: await partialMigrations(THROUGH_0012) });
    process.env.DATABASE_URL = scratch.url;
    process.env.SELF_LEARN_HOME = path.join(base, "home");
    // The value that used to turn the legacy branch on. Nothing reads it now.
    process.env.ASSET_FILES_ENABLED = "1";
    ({ GET } = (await import("./[id]/file/route")) as { GET: Handler });
    ({ GET: STATUS } = (await import("./[id]/status/route")) as { GET: Handler });

    await scratch.db.insert(asset).values([
      row(ON_DISK_ID, "video", "out/algorithms/demo/demo.mp4", null),
      row(SVG_ID, "diagram_svg", "learn/assets/dot-product.svg", await stored(SVG, "svg"), "self-learn"),
      row(EMPTY_ID, "video", "out/empty.mp4", await stored(EMPTY, "mp4")),
      row(ODD_ID, "video", "out/odd.bin", await stored(ODD, "bin")),
      row(LINK_ID, "link", null, null, "self-learn"),
    ]);
    // Where manimkc's `out/…` paths resolved, as the indexer records it: the
    // legacy branch's root, and the reason the video above is findable on disk.
    const now = new Date();
    await scratch.db.insert(indexRun).values({
      source: "manimkc",
      sourceRoot: path.join(base, "checkout"),
      startedAt: now,
      finishedAt: now,
      metadata: { outRoot: dataRoot },
    });
  }, 60_000);

  afterAll(async () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await scratch?.drop();
    if (base !== undefined) await rm(base, { recursive: true, force: true });
  });

  it("reads no file off the disk, even one sitting under the recorded data root", async () => {
    await expectRefusal(ON_DISK_ID, 404, "not-uploaded");
    const response = await call(ON_DISK_ID);
    const text = await response.text();
    expect(text).toContain("catalog -- asset upload");
    // Not one byte of the file that is right there.
    expect(Buffer.from(text).includes(VIDEO.subarray(0, 32))).toBe(false);
  });

  it("refuses to let a stored file execute as script in this origin", async () => {
    const response = await call(SVG_ID);
    expect(response.status).toBe(200);
    // An SVG is a document, so the type is right and the sandbox is what makes
    // it safe. nosniff keeps everything else from being re-read as one.
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer()).equals(SVG)).toBe(true);

    const csp = response.headers.get("content-security-policy") ?? "";
    // Script off, in both the way that stops it and the way that says so.
    expect(csp).toContain("sandbox");
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("default-src 'none'");
    // And the three a tldrawkc export needs, or the diagram comes back 200 and
    // unstyled: it writes its CSS inline and embeds its fonts as data URLs.
    expect(csp).toContain("style-src 'unsafe-inline'");
    expect(csp).toContain("font-src data:");
    expect(csp).toContain("img-src data:");
  });

  it("answers any range against an empty object with 416", async () => {
    const empty = await call(EMPTY_ID, { range: "bytes=0-" });
    expect(empty.status).toBe(416);
    expect(empty.headers.get("content-range")).toBe("bytes */0");
  });

  it("sends the whole object when the range header is one it does not speak", async () => {
    // RFC 9110 lets a server ignore a Range it cannot honour, and a multipart
    // response is work no browser needs to scrub a video.
    for (const range of ["frames=1-2", "bytes=abc", "bytes=0-9,20-29", ""]) {
      const response = await call(SVG_ID, { range });
      expect(response.status, range).toBe(200);
      expect(response.headers.get("content-length"), range).toBe(String(SVG.length));
    }
  });

  it("404s an id the catalog does not have, and a link that has no file", async () => {
    await expectRefusal("manimkc:out/nothing-like-this.mp4", 404, "not-in-catalog");
    await expectRefusal(LINK_ID, 404, "no-file");
  });

  it("never joins the id onto a path", async () => {
    // The traversal that a naive route would fall for: it is not a path here,
    // it is a primary key, and no row has this one.
    const response = await call("manimkc:out/../../../../etc/passwd");
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("root:");
  });

  it("refuses a stored object whose extension nobody declared", async () => {
    await expectRefusal(ODD_ID, 404, "unsupported-type");
  });

  describe("the status route", () => {
    it("answers ok for an asset the route would serve, and sends none of it", async () => {
      const response = await status(SVG_ID);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const text = await response.text();
      expect(JSON.parse(text)).toEqual({ ok: true });
      expect(text.length).toBeLessThan(40);
    });

    it("never carries a stored path, only the category", async () => {
      const text = await (await status(ON_DISK_ID)).text();
      expect(text).not.toContain("out/algorithms");
      expect(text).not.toContain(dataRoot);
      expect(Object.keys(JSON.parse(text) as object).sort()).toEqual(["code", "ok"]);
    });

    it("gives the poster route's answers when asked about a poster", async () => {
      const notVideo = await status(SVG_ID, "?for=poster");
      expect(notVideo.status).toBe(404);
      expect(await notVideo.json()).toEqual({ ok: false, code: "not-a-video" });

      const noPoster = await status(ON_DISK_ID, "?for=poster");
      expect(noPoster.status).toBe(404);
      expect(await noPoster.json()).toEqual({ ok: false, code: "not-uploaded" });
    });
  });
});
