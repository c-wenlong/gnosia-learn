import { appendFile, mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { asset, indexRun } from "@self-learn/schema";

import { POSTER_FAILURE_TTL_MS, resolveFfmpeg } from "@/lib/asset-posters";

import { applyMigrations } from "../../../../../../services/catalog/src/migrations";
import {
  createScratchDatabase,
  probe,
  type Scratch,
} from "../../../../../../services/catalog/test/scratch-database";

/**
 * `GET /api/assets/<id>/poster`, against a scratch database, a scratch data
 * root and a scratch ffmpeg.
 *
 * **ffmpeg is faked, deliberately.** Almost every assertion here is about what
 * the route does *around* the extraction — how many processes it starts, what
 * it does on the second request, what it refuses before starting one at all —
 * and none of that can be counted through the real binary. The fake is a shell
 * script that appends a line to a counter file, sleeps long enough for a burst
 * to overlap, and writes fixed bytes, so "did this request run ffmpeg?" is a
 * number on disk rather than an inference from timing.
 *
 * `FFMPEG_PATH` is what points at it, which is also this suite's answer to "a
 * machine with no ffmpeg": one test points that variable at a path that does not
 * exist and asserts the route says so rather than hanging or throwing.
 *
 * One test does use the real binary, skipping itself when there is none. It
 * renders a short clip, asks for its poster, and checks that what comes back is
 * a JPEG of the declared width. That is the only way the argument array is
 * proved to be one ffmpeg accepts; everything else would pass just as well
 * against a typo.
 */

const reachable = await probe();

/** Recognisable bytes with a JPEG's start and end markers around them. */
const FAKE_JPEG = Buffer.from("ffd8ff4641404b452d504f53544552ffd9", "hex");

const VIDEO_ID = "manimkc:out/algorithms/demo/demo.mp4";
const ORIGIN = "http://localhost:3000";

type Handler = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;

/** The real ffmpeg, if this machine has one. Resolved off PATH, never hard-coded. */
const realFfmpeg = await resolveFfmpeg({ PATH: process.env.PATH });

/** The machine-readable reason a refusal carries, which is what a card switches on. */
const codeOf = async (response: Response): Promise<unknown> =>
  ((await response.clone().json()) as { code?: unknown }).code;

describe.skipIf(!reachable.ok)("asset poster route", () => {
  let scratch: Scratch;
  let GET: Handler;
  let STATUS: Handler;
  /** The temporary tree holding everything this suite writes. */
  let base: string;
  /** manimkc's data root for this run. */
  let dataRoot: string;
  /** Where posters are cached, emptied between tests that care. */
  let cacheDir: string;
  /** The fake ffmpeg, and the file it counts its own runs in. */
  let fakeFfmpeg: string;
  let counter: string;

  const call = async (id: string, headers: Record<string, string> = {}) =>
    GET(new Request(`${ORIGIN}/api/assets/${encodeURIComponent(id)}/poster`, { headers }), {
      params: Promise.resolve({ id }),
    });

  /** `GET /api/assets/<id>/status?for=poster`, what a card asks after its poster fails. */
  const posterStatus = async (id: string) =>
    STATUS(new Request(`${ORIGIN}/api/assets/${encodeURIComponent(id)}/status?for=poster`), {
      params: Promise.resolve({ id }),
    });

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

  /** How many times the fake ffmpeg has been run since the counter was reset. */
  const runs = async (): Promise<number> => {
    const text = await readFile(counter, "utf8").catch(() => "");
    return text.split("\n").filter((line) => line !== "").length;
  };

  const resetRuns = async (): Promise<void> => {
    await writeFile(counter, "");
  };

  const emptyCache = async (): Promise<void> => {
    await rm(cacheDir, { recursive: true, force: true });
    await mkdir(cacheDir, { recursive: true });
  };

  beforeAll(async () => {
    base = await mkdtemp(path.join(tmpdir(), "asset-posters-"));
    dataRoot = path.join(base, "manimkc-home");
    cacheDir = path.join(base, "cache");
    counter = path.join(base, "ffmpeg-runs");
    const demo = path.join(dataRoot, "out", "algorithms", "demo");
    await mkdir(demo, { recursive: true });
    await mkdir(cacheDir, { recursive: true });
    await resetRuns();

    // The bytes do not have to be a real video: nothing in this suite decodes
    // them except the one test that renders its own clip with the real binary.
    await writeFile(path.join(demo, "demo.mp4"), "not really an mp4, and never decoded");
    await writeFile(path.join(demo, "demo.vtt"), "WEBVTT\n");
    await writeFile(path.join(demo, "demo.transcript.json"), "{}");

    fakeFfmpeg = path.join(base, "fake-ffmpeg");
    const payload = path.join(base, "payload.jpg");
    await writeFile(payload, FAKE_JPEG);
    await writeFile(
      fakeFfmpeg,
      // The sleep is what makes the burst test mean something: without it the
      // first extraction can finish before the tenth request reaches the
      // in-flight map, and a dedupe that never had to dedupe would pass.
      `#!/bin/sh\necho run >> ${JSON.stringify(counter)}\nsleep 0.25\ncat ${JSON.stringify(payload)}\n`,
      { mode: 0o755 },
    );

    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    process.env.DATABASE_URL = scratch.url;
    process.env.ASSET_FILES_ENABLED = "1";
    process.env.ASSET_POSTER_CACHE_DIR = cacheDir;
    process.env.FFMPEG_PATH = fakeFfmpeg;
    ({ GET } = (await import("./[id]/poster/route")) as { GET: Handler });
    ({ GET: STATUS } = (await import("./[id]/status/route")) as { GET: Handler });

    const now = new Date();
    await scratch.db.insert(indexRun).values({
      source: "manimkc",
      sourceRoot: path.join(base, "checkout"),
      startedAt: now,
      finishedAt: now,
      metadata: { outRoot: dataRoot },
    });

    await seed({
      id: VIDEO_ID,
      kind: "video",
      path: "out/algorithms/demo/demo.mp4",
      sourceRepo: "manimkc",
    });
    await seed({
      id: "manimkc:out/algorithms/demo/demo.vtt",
      kind: "captions",
      path: "out/algorithms/demo/demo.vtt",
      sourceRepo: "manimkc",
    });
    await seed({
      id: "manimkc:out/algorithms/demo/demo.transcript.json",
      kind: "transcript",
      path: "out/algorithms/demo/demo.transcript.json",
      sourceRepo: "manimkc",
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
    delete process.env.ASSET_POSTER_CACHE_DIR;
    delete process.env.FFMPEG_PATH;
  });

  beforeEach(async () => {
    process.env.ASSET_FILES_ENABLED = "1";
    process.env.ASSET_POSTER_CACHE_DIR = cacheDir;
    process.env.FFMPEG_PATH = fakeFfmpeg;
    await emptyCache();
    await resetRuns();
  });

  it("extracts a frame and serves it as a JPEG", async () => {
    const response = await call(VIDEO_ID);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="demo.jpg"');
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    expect(response.headers.get("etag")).toMatch(/^"[0-9a-f]{40}"$/);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(FAKE_JPEG);
    expect(await runs()).toBe(1);
  });

  it("serves the second request from the cache without running ffmpeg again", async () => {
    const first = await call(VIDEO_ID);
    expect(first.status).toBe(200);
    expect(await runs()).toBe(1);

    // One file on disk, named by the key the first response advertised.
    const cached = (await readdir(cacheDir)).filter((name) => name.endsWith(".jpg"));
    expect(cached).toHaveLength(1);
    expect(`"${cached[0].replace(/\.jpg$/, "")}"`).toBe(first.headers.get("etag"));

    const second = await call(VIDEO_ID);
    expect(second.status).toBe(200);
    expect(Buffer.from(await second.arrayBuffer())).toEqual(FAKE_JPEG);
    // The assertion the cache exists for: no second process.
    expect(await runs()).toBe(1);
    expect(second.headers.get("etag")).toBe(first.headers.get("etag"));
  });

  it("answers 304 for a client that already holds the poster", async () => {
    const first = await call(VIDEO_ID);
    const etag = first.headers.get("etag") ?? "";

    const revalidated = await call(VIDEO_ID, { "if-none-match": etag });
    expect(revalidated.status).toBe(304);
    expect(await revalidated.text()).toBe("");

    // A weak validator and a list are both things a browser really sends.
    const weak = await call(VIDEO_ID, { "if-none-match": `W/${etag}, "other"` });
    expect(weak.status).toBe(304);

    // A tag for a different file is not a match.
    const stale = await call(VIDEO_ID, { "if-none-match": '"0000000000"' });
    expect(stale.status).toBe(200);
  });

  it("never hands a non-video to ffmpeg", async () => {
    for (const id of [
      "manimkc:out/algorithms/demo/demo.vtt",
      "manimkc:out/algorithms/demo/demo.transcript.json",
      "link:cs3230-notes",
    ]) {
      const response = await call(id);
      expect(response.status, id).toBe(404);
      expect(await codeOf(response), id).toBe(id.startsWith("link:") ? "no-file" : "not-a-video");
    }
    // A row the catalog does not have, for good measure: the id is a key here
    // as it is in the file route, never a path.
    expect((await call("manimkc:out/../../../../etc/passwd")).status).toBe(404);
    expect(await runs()).toBe(0);
  });

  it("says so plainly when the machine has no ffmpeg", async () => {
    process.env.FFMPEG_PATH = path.join(base, "no-ffmpeg-here");
    const response = await call(VIDEO_ID);
    expect(response.status).toBe(503);
    const body = (await response.json()) as { detail: string; code: string };
    expect(body.detail).toContain("FFMPEG_PATH");
    expect(body.code).toBe("no-ffmpeg");
    expect(await runs()).toBe(0);
  });

  /** An ffmpeg that runs, counts itself, and exits cleanly with no frame. */
  const useSilentFfmpeg = async () => {
    const silent = path.join(base, "silent-ffmpeg");
    await writeFile(silent, `#!/bin/sh\necho run >> ${JSON.stringify(counter)}\nexit 0\n`, {
      mode: 0o755,
    });
    process.env.FFMPEG_PATH = silent;
  };

  const markers = async () =>
    (await readdir(cacheDir)).filter((name) => /^[0-9a-f]{40}\.fail$/.test(name));

  it("records a genuine no-frame result, and says poster-failed from the record", async () => {
    await useSilentFfmpeg();
    const response = await call(VIDEO_ID);
    expect(response.status).toBe(503);
    expect(await codeOf(response)).toBe("poster-failed");
    // One run per offset, then a marker beside where the poster would be.
    expect(await runs()).toBe(3);
    expect(await markers()).toHaveLength(1);

    // Believed: neither a second request nor the card's probe runs ffmpeg.
    await resetRuns();
    expect(await codeOf(await call(VIDEO_ID))).toBe("poster-failed");
    const probe = await posterStatus(VIDEO_ID);
    expect(probe.status).toBe(503);
    expect(await probe.json()).toEqual({ ok: false, code: "poster-failed" });
    expect(await runs()).toBe(0);
  });

  it("drops a verdict once FFMPEG_PATH points at a different binary, and tries again", async () => {
    await useSilentFfmpeg();
    await call(VIDEO_ID);
    expect(await markers()).toHaveLength(1);

    // The broken build was the problem, not the video.
    process.env.FFMPEG_PATH = fakeFfmpeg;
    await resetRuns();
    expect(await posterStatus(VIDEO_ID).then((r) => r.json())).toEqual({
      ok: false,
      code: "poster-not-made",
    });
    const response = await call(VIDEO_ID);
    expect(response.status).toBe(200);
    expect(await runs()).toBe(1);
  });

  it("drops a verdict once the binary is replaced at the same path", async () => {
    await useSilentFfmpeg();
    await call(VIDEO_ID);
    const silent = process.env.FFMPEG_PATH as string;

    // Same path, rebuilt: now it produces a frame.
    await writeFile(
      silent,
      `#!/bin/sh\necho run >> ${JSON.stringify(counter)}\ncat ${JSON.stringify(path.join(base, "payload.jpg"))}\n`,
      { mode: 0o755 },
    );
    const later = new Date(Date.now() + 5_000);
    await utimes(silent, later, later);

    expect(await posterStatus(VIDEO_ID).then((r) => r.json())).toEqual({
      ok: false,
      code: "poster-not-made",
    });
    const response = await call(VIDEO_ID);
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(FAKE_JPEG);
  });

  it("answers the retryable poster-not-made for an empty cache with no marker", async () => {
    // Nothing has been attempted, so absence is not a verdict about the video.
    const probe = await posterStatus(VIDEO_ID);
    expect(probe.status).toBe(503);
    expect(await probe.json()).toEqual({ ok: false, code: "poster-not-made" });
    expect(await runs()).toBe(0);
  });

  it("stops believing a marker once it expires", async () => {
    await useSilentFfmpeg();
    await call(VIDEO_ID);
    const [marker] = await markers();
    const stale = new Date(Date.now() - POSTER_FAILURE_TTL_MS - 60_000);
    await utimes(path.join(cacheDir, marker), stale, stale);

    expect(await posterStatus(VIDEO_ID).then((r) => r.json())).toEqual({
      ok: false,
      code: "poster-not-made",
    });
  });

  it("ignores an old marker once the video changes, and makes the poster", async () => {
    await useSilentFfmpeg();
    await call(VIDEO_ID);
    expect(await markers()).toHaveLength(1);

    // A re-render: new bytes, so a new size and mtime, so a new cache key.
    const file = path.join(dataRoot, "out", "algorithms", "demo", "demo.mp4");
    await appendFile(file, " re-rendered");
    try {
      expect(await posterStatus(VIDEO_ID).then((r) => r.json())).toEqual({
        ok: false,
        code: "poster-not-made",
      });
      process.env.FFMPEG_PATH = fakeFfmpeg;
      const response = await call(VIDEO_ID);
      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(FAKE_JPEG);
    } finally {
      await writeFile(file, "not really an mp4, and never decoded");
    }
  });

  it("answers ok for a poster that was made, so a failed image reads as not shown", async () => {
    expect((await call(VIDEO_ID)).status).toBe(200);
    const before = await runs();
    const probe = await posterStatus(VIDEO_ID);
    expect(await probe.json()).toEqual({ ok: true });
    expect(await runs()).toBe(before);
  });

  it("refuses a relative FFMPEG_PATH rather than running whatever is beside it", async () => {
    process.env.FFMPEG_PATH = "./ffmpeg";
    const response = await call(VIDEO_ID);
    expect(response.status).toBe(503);
    expect(await runs()).toBe(0);
  });

  it("serves nothing at all when the deployment has not opted in", async () => {
    delete process.env.ASSET_FILES_ENABLED;
    const off = await call(VIDEO_ID);
    expect(off.status).toBe(404);
    expect(await codeOf(off)).toBe("files-off");

    process.env.ASSET_FILES_ENABLED = "false";
    expect((await call(VIDEO_ID)).status).toBe(404);
    expect(await runs()).toBe(0);
  });

  it("runs one ffmpeg for a burst of requests for the same video", async () => {
    const burst = await Promise.all(Array.from({ length: 10 }, () => call(VIDEO_ID)));
    for (const response of burst) {
      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(FAKE_JPEG);
    }
    // Ten cards, one decoder. Without the in-flight map this is ten.
    expect(await runs()).toBe(1);
    expect((await readdir(cacheDir)).filter((name) => name.endsWith(".jpg"))).toHaveLength(1);
  });

  it.skipIf(realFfmpeg === null)(
    "produces a real JPEG of the declared width with the real binary",
    async () => {
      // A clip of its own rather than one of the indexed videos: this suite
      // must pass on a machine that has never rendered anything.
      const clip = path.join(dataRoot, "out", "algorithms", "demo", "real.mp4");
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      await promisify(execFile)(realFfmpeg as string, [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc=duration=5:size=640x360:rate=30",
        "-pix_fmt",
        "yuv420p",
        "-y",
        clip,
      ]);
      await seed({
        id: "manimkc:out/algorithms/demo/real.mp4",
        kind: "video",
        path: "out/algorithms/demo/real.mp4",
        sourceRepo: "manimkc",
      });

      process.env.FFMPEG_PATH = realFfmpeg as string;
      const response = await call("manimkc:out/algorithms/demo/real.mp4");
      expect(response.status).toBe(200);

      const body = Buffer.from(await response.arrayBuffer());
      // SOI and EOI: this is a JPEG, not an error page with a JPEG's headers.
      expect(body.subarray(0, 2).toString("hex")).toBe("ffd8");
      expect(body.subarray(-2).toString("hex")).toBe("ffd9");
      expect(body.length).toBeGreaterThan(1_000);
      expect(jpegWidth(body)).toBe(640);
    },
    60_000,
  );
});

/**
 * The width out of a JPEG's first start-of-frame marker.
 *
 * Written out rather than pulled in as a dependency: it is a walk over
 * two-byte segment lengths until an SFn marker, and the alternative is an image
 * library in `devDependencies` to read four bytes.
 */
function jpegWidth(body: Buffer): number {
  let at = 2;
  while (at + 9 < body.length) {
    if (body[at] !== 0xff) return -1;
    const marker = body[at + 1];
    const length = body.readUInt16BE(at + 2);
    // SOF0 through SOF3 and SOF9 through SOF11; the marker holds height then
    // width as 16-bit values after a one-byte sample precision.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return body.readUInt16BE(at + 7);
    }
    at += 2 + length;
  }
  return -1;
}
