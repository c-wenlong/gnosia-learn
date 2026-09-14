import "server-only";

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as FS } from "node:fs";
import { access, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { CatalogDatabase } from "@self-learn/catalog/state";

import { resolveAssetFile, safeFilename, type AssetFileProblem } from "@/lib/asset-files";

/**
 * A still frame from a video asset, for the library's cards.
 *
 * Thirty video cards in `/library` show a grey "No poster" placeholder because
 * nothing has ever extracted a frame, and nothing can: a poster is not a thing
 * manimkc writes, so there is no row in the catalog to point at. The frame has
 * to be made here, from the `.mp4` the file route already knows how to find.
 *
 * **Everything about *which file* is `@/lib/asset-files`, unchanged.**
 * `resolveAssetFile` does the id lookup, the root selection, the containment
 * check on both sides of `realpath` and the closed content-type list. This
 * module never resolves a path and never sees the URL's id as anything but a
 * primary key to hand that function. There is one path resolver in this app and
 * it is not this file.
 *
 * **ffmpeg is spawned with an argument array and no shell.** `spawn(file, args)`
 * with `shell: false` (the default, written out below anyway) passes each
 * argument to `execve` as one string: there is no word splitting, no globbing
 * and no metacharacter for a filename to smuggle a second command through. The
 * only caller-influenced value in that array is the absolute path
 * `resolveAssetFile` returned, and the id never reaches it at all.
 *
 * **Every step is bounded.** One frame, one timeout, a cap on how many bytes
 * ffmpeg may hand back, a cap on how many extractions may run at once, and a
 * cache with a size limit that is pruned after every write. A corrupt file that
 * makes ffmpeg spin is killed; one that makes it emit forever is killed sooner.
 */

/* -------------------------------------------------------------------------- */
/* The recipe                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Where to seek, in order, until one of them yields a frame.
 *
 * **Not the first frame.** A manimkc render opens on a fade-in and then a title
 * card, so frame 0 of `inverse_kinematics.mp4` is 1.5 kB of flat #333 — a
 * thumbnail that is strictly worse than the placeholder it replaces, because it
 * looks like a working image of nothing. Fifteen seconds in, the same video is
 * a tracked hand beside a two-link arm: a picture that says what the video is
 * about, which is the entire job of a card in a grid.
 *
 * **Not the title card either, at ~3 seconds.** It is legible, but the card
 * already prints the title above the image, so thirty title cards would be
 * thirty near-identical dark rectangles restating text the reader can read.
 * Content frames are what tell one card from another.
 *
 * Fifteen seconds rather than a fraction of the duration because a fraction
 * needs the duration, and asking for it means `ffprobe`: a second binary that
 * can be absent independently of the first, doubling the "the tool is missing"
 * surface for a number that only chooses between 13% and 25% of the way in. The
 * thirty indexed videos run 9s to 20 minutes, median 115s, so 15s is past the
 * title card on all but the shortest and well short of the end on every one.
 *
 * The shortest are what the fallbacks are for. Seeking past the end of a file
 * makes ffmpeg write no frame at all, which is detected and retried closer to
 * the start; three seconds catches a short clip's title card, and zero catches
 * anything at all. Worst case is three spawns for a file that is only a few
 * seconds long, and the common case is one.
 */
export const POSTER_OFFSETS_SECONDS = [15, 3, 0] as const;

/**
 * How wide the poster is, and what it is encoded as.
 *
 * The cards are a grid: roughly 320 CSS pixels across at desktop widths, less
 * on a phone. 640 is that at 2x, and nothing on the page can use more. The
 * source is 1920x1080, so this is a 9x reduction in pixels before any encoder
 * sees it, and `-2` keeps the aspect ratio while landing on an even height,
 * which every JPEG chroma subsampler needs.
 *
 * JPEG rather than PNG: a 1920x1080 PNG of a frame of animation is megabytes,
 * and thirty of them on one page would be a worse experience than the grey box
 * this replaces. A 640px q5 JPEG of the same frame measures 8 kB. PNG would win
 * on flat-colour manim frames if the size were equal, but it is not, and at
 * this scale the text in a frame is unreadable either way, so the compression
 * artefacts nobody can see cost nothing.
 *
 * WebP or AVIF would be smaller again and are deliberately not used: they
 * depend on encoders a given ffmpeg build may not carry, and this is a feature
 * whose whole point is to degrade quietly. mjpeg is built into every ffmpeg.
 */
export const POSTER_WIDTH = 640;
export const POSTER_QUALITY = 5;
export const POSTER_CONTENT_TYPE = "image/jpeg";
export const POSTER_EXTENSION = ".jpg";

/**
 * Bumped whenever anything above changes the picture.
 *
 * It is part of the cache key, so changing the offset, the width or the encoder
 * invalidates every cached poster instead of serving yesterday's recipe until
 * each video is re-rendered.
 */
const RECIPE_VERSION = "v1";

/** Content types this module will hand to ffmpeg. Everything else is a 404. */
export const POSTER_SOURCE_TYPES: ReadonlySet<string> = new Set(["video/mp4"]);

/* -------------------------------------------------------------------------- */
/* The bounds                                                                  */
/* -------------------------------------------------------------------------- */

/** How long one ffmpeg run may take before it is killed. */
export const POSTER_TIMEOUT_MS = 15_000;

/**
 * How much ffmpeg may write to its stdout before it is killed.
 *
 * `-frames:v 1` should end it at one image, and a 640px JPEG is tens of
 * kilobytes, so this is three orders of magnitude of headroom and exists only
 * so that a file which somehow makes ffmpeg stream does not fill the heap while
 * the timeout runs down.
 */
export const POSTER_MAX_BYTES = 2 * 1024 * 1024;

/**
 * How many ffmpeg processes may run at once, across every request.
 *
 * Ten cards render at once on a cold load, which is ten *different* videos and
 * so ten legitimate extractions; the per-video dedupe below is what stops ten
 * for one video. This is the other half: spawning ten decoders at once on a
 * laptop makes all ten slow. Four keeps the machine busy without taking it
 * over, and each run measures about 0.12s wall, so a burst of thirty clears in
 * about a second.
 */
export const POSTER_MAX_CONCURRENT = 4;

/**
 * Where posters are cached, and the two bounds on how big that may get.
 *
 * **Outside the repository, always.** AGENTS.md records a repo relayout
 * deleting 25 rendered videos because git does not carry ignored files across a
 * move, and generated data has been kept out of the tree ever since. A poster
 * is generated data in the purest sense: it is a pure function of a video, a
 * `.gitignore` entry away from being committed by accident, and worth nothing
 * if it is lost. So the default is a directory under the system temp root,
 * which no `git clean -xdf`, no branch switch and no relayout can touch,
 * and which needs no `.gitignore` entry because it is not in the tree to
 * ignore. `node_modules/.cache` was the other candidate and `npm ci` deletes
 * it, which is the same failure with a different command.
 *
 * `ASSET_POSTER_CACHE_DIR` moves it, for a machine that would rather keep
 * posters across a reboot. It must be absolute: a relative one would resolve
 * against whatever directory the server happened to start in, and this
 * directory is one the pruner deletes files from.
 *
 * The bounds are belt and braces. Bytes is the real one — 64 MB is around two
 * thousand posters, where the catalog holds thirty videos — and the count stops
 * a pathological run from filling it with a few enormous files. Both are
 * enforced after every write, oldest first.
 */
export const POSTER_CACHE_ENV = "ASSET_POSTER_CACHE_DIR";
export const POSTER_CACHE_BYTES = 64 * 1024 * 1024;
export const POSTER_CACHE_ENTRIES = 1_024;

/** Where to find ffmpeg when it is not on `PATH`. Absolute paths only. */
export const FFMPEG_ENV = "FFMPEG_PATH";

/**
 * The one name pattern the pruner will delete.
 *
 * Every cached file is `<40 hex>.jpg`, so an operator who points
 * `ASSET_POSTER_CACHE_DIR` at a directory that already holds something loses
 * nothing: a name this does not match is never unlinked, and is not counted
 * against the bounds either, since it is not ours to bound.
 */
const CACHE_NAME = /^[0-9a-f]{40}\.jpg$/;

/* -------------------------------------------------------------------------- */
/* Finding ffmpeg                                                              */
/* -------------------------------------------------------------------------- */

/** A path that exists, is a regular file, and is executable by this process. */
async function isExecutableFile(file: string): Promise<boolean> {
  try {
    const stats = await stat(file);
    if (!stats.isFile()) return false;
    await access(file, FS.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Memoised on the inputs rather than on nothing, so a test that changes
 * `FFMPEG_PATH` gets a fresh answer while thirty cards in one page load share
 * one lookup. The value is a path, not a handle, so caching it cannot hold
 * anything open.
 */
let ffmpegMemo: { signature: string; result: string | null } | null = null;

/**
 * Where ffmpeg is, or `null`.
 *
 * Resolved, never hard-coded: it is at `/opt/homebrew/bin/ffmpeg` on one
 * machine, `/usr/bin/ffmpeg` on CI and absent in production, and a constant
 * would be wrong on two of those three. `PATH` is the normal answer and
 * `FFMPEG_PATH` is the escape hatch for a server started without a login
 * shell's `PATH`, which is how a GUI-launched process loses Homebrew.
 *
 * `null` is an ordinary answer, not an error. A machine with no ffmpeg is the
 * common case for this repo (production has neither ffmpeg nor the videos), and
 * what it costs is a placeholder on a card.
 */
export async function resolveFfmpeg(
  env: Record<string, string | undefined> = process.env,
): Promise<string | null> {
  const override = (env[FFMPEG_ENV] ?? "").trim();
  const search = env.PATH ?? "";
  const signature = `${override} ${search}`;
  if (ffmpegMemo !== null && ffmpegMemo.signature === signature) return ffmpegMemo.result;

  const result = await lookUpFfmpeg(override, search);
  ffmpegMemo = { signature, result };
  return result;
}

async function lookUpFfmpeg(override: string, search: string): Promise<string | null> {
  if (override !== "") {
    if (!path.isAbsolute(override)) {
      // A relative override resolves against the process's working directory,
      // which is not a directory this app chose and can be changed underneath
      // it. Refusing is the only answer that cannot end up executing whatever
      // `./ffmpeg` happens to be.
      console.warn(`asset poster: ignoring ${FFMPEG_ENV}, it is not an absolute path`);
      return null;
    }
    return (await isExecutableFile(override)) ? override : null;
  }

  for (const dir of search.split(path.delimiter)) {
    // An empty entry in PATH means the working directory on some shells. Same
    // objection as above, so it is skipped rather than searched.
    if (dir === "" || !path.isAbsolute(dir)) continue;
    const candidate = path.join(dir, "ffmpeg");
    if (await isExecutableFile(candidate)) return candidate;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* The cache                                                                   */
/* -------------------------------------------------------------------------- */

/** The directory posters are cached in on this machine. */
export function posterCacheDir(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = (env[POSTER_CACHE_ENV] ?? "").trim();
  if (configured !== "" && path.isAbsolute(configured)) return configured;
  if (configured !== "") {
    console.warn(`asset poster: ignoring ${POSTER_CACHE_ENV}, it is not an absolute path`);
  }
  return path.join(os.tmpdir(), "self-learn-posters");
}

/**
 * The cache key for one video, as 40 hex characters.
 *
 * It covers the resolved path, the size and the modification time, so a
 * re-render of the same video under the same name is a different key and the
 * old poster is never served for the new file. The recipe version is in there
 * too, so changing the frame rule invalidates everything rather than leaving a
 * mix of two recipes on one page. The asset id is *not* in it: two rows
 * pointing at one file should share one poster, and the id is not what makes
 * the picture.
 */
export function posterKey(file: string, bytes: number, modifiedMs: number): string {
  return createHash("sha256")
    .update([RECIPE_VERSION, file, String(bytes), String(Math.trunc(modifiedMs))].join(" "))
    .digest("hex")
    .slice(0, 40);
}

/**
 * Keep the cache under both bounds, oldest first.
 *
 * Runs after a write, which is the only moment the cache grows, and only ever
 * unlinks a name this module could have written. A failure here is logged and
 * swallowed: an un-pruned cache is a disk-space problem for later, while a
 * throw would turn a served poster into a 503.
 */
async function prune(dir: string): Promise<void> {
  try {
    const names = (await readdir(dir)).filter((name) => CACHE_NAME.test(name));
    const entries = await Promise.all(
      names.map(async (name) => {
        const file = path.join(dir, name);
        try {
          const stats = await stat(file);
          return { file, bytes: stats.size, at: stats.mtimeMs };
        } catch {
          return null;
        }
      }),
    );

    const present = entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    let total = present.reduce((sum, entry) => sum + entry.bytes, 0);
    let count = present.length;
    if (total <= POSTER_CACHE_BYTES && count <= POSTER_CACHE_ENTRIES) return;

    present.sort((a, b) => a.at - b.at);
    for (const entry of present) {
      if (total <= POSTER_CACHE_BYTES && count <= POSTER_CACHE_ENTRIES) break;
      await rm(entry.file, { force: true });
      total -= entry.bytes;
      count -= 1;
    }
  } catch (error) {
    console.warn(`asset poster: could not prune the cache: ${describe(error)}`);
  }
}

/**
 * Write a poster into the cache so that nothing can ever read a half-written
 * one: a temporary name in the same directory, then `rename`, which is atomic
 * within a filesystem. Two processes extracting the same video at the same
 * moment both write, both rename, and the loser's bytes are simply replaced by
 * an identical picture.
 *
 * A failure to cache is not a failure to answer. The buffer is already in hand
 * and gets served; the next request pays for another extraction.
 */
async function store(dir: string, key: string, body: Buffer): Promise<void> {
  const temporary = path.join(dir, `.${randomUUID()}.tmp`);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(temporary, body, { mode: 0o600 });
    await rename(temporary, path.join(dir, `${key}${POSTER_EXTENSION}`));
  } catch (error) {
    console.warn(`asset poster: could not cache ${key}: ${describe(error)}`);
    await rm(temporary, { force: true }).catch(() => {});
    return;
  }
  await prune(dir);
}

/* -------------------------------------------------------------------------- */
/* Running ffmpeg                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The argument array, built from constants and one absolute path.
 *
 * Nothing here is a string that was concatenated from anything a request chose:
 * the offset, the width and the quality are the constants above, and `file` is
 * what `resolveAssetFile` proved to be inside its root. It is passed as its own
 * element of the array, so a filename containing a space, a quote or a
 * semicolon is one argument either way.
 *
 * `-ss` before `-i` is input seeking, which jumps by keyframe instead of
 * decoding from the start: it is the difference between 0.12s and several
 * seconds on a twenty-minute file. `thumbnail=n=60` then reads about two
 * seconds of frames and keeps the one least like the average of them, which is
 * what stops a poster landing on a cross-fade or a frame that is briefly blank.
 * `format=yuvj420p` is not decoration: without it the mjpeg encoder refuses a
 * limited-range source outright ("Non full-range YUV is non-standard") and
 * writes nothing at all.
 */
export function ffmpegArgs(file: string, offsetSeconds: number): string[] {
  return [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    String(offsetSeconds),
    "-i",
    file,
    "-map",
    "0:v:0",
    "-an",
    "-sn",
    "-dn",
    "-frames:v",
    "1",
    "-vf",
    `thumbnail=n=60,scale=${POSTER_WIDTH}:-2,format=yuvj420p`,
    "-f",
    "image2pipe",
    "-vcodec",
    "mjpeg",
    "-q:v",
    String(POSTER_QUALITY),
    "-",
  ];
}

/**
 * One ffmpeg run. Resolves with the JPEG, or with `null` for every way it can
 * fail to produce one — a seek past the end, a corrupt file, a timeout, a
 * binary that turned out not to be ffmpeg. It never rejects, because every one
 * of those is the same answer to the caller: try the next offset, then give up
 * politely.
 */
export async function extractFrame(
  ffmpeg: string,
  file: string,
  offsetSeconds: number,
): Promise<Buffer | null> {
  return new Promise<Buffer | null>((resolve) => {
    const child = spawn(ffmpeg, ffmpegArgs(file, offsetSeconds), {
      // Written out rather than left to the default. This is the line that
      // decides whether a filename can ever become a command.
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const chunks: Buffer[] = [];
    let size = 0;
    let stderr = "";
    let settled = false;

    const finish = (value: Buffer | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => {
      // SIGKILL rather than SIGTERM: the point of the timeout is that this
      // process is not behaving, and a handler that ignores a polite signal is
      // exactly the case being defended against.
      child.kill("SIGKILL");
      console.warn(`asset poster: ffmpeg timed out after ${POSTER_TIMEOUT_MS}ms on ${file}`);
      finish(null);
    }, POSTER_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > POSTER_MAX_BYTES) {
        child.kill("SIGKILL");
        console.warn(`asset poster: ffmpeg wrote more than ${POSTER_MAX_BYTES} bytes for ${file}`);
        finish(null);
        return;
      }
      chunks.push(chunk);
    });

    // Kept only to name the reason in a log line, and bounded so a chatty
    // failure cannot be the thing that fills memory.
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 4_000) stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      // ENOENT or EACCES: the binary went away or was never one.
      console.warn(`asset poster: could not run ${ffmpeg}: ${describe(error)}`);
      finish(null);
    });

    child.on("close", (code) => {
      if (code === 0 && size > 0) {
        finish(Buffer.concat(chunks));
        return;
      }
      // A seek past the end of a short file lands here, which is why this is a
      // warning about one attempt rather than about the poster.
      console.warn(
        `asset poster: ffmpeg exit ${String(code)} at ${offsetSeconds}s for ${file}` +
          (stderr.trim() === "" ? "" : `: ${stderr.trim().split("\n")[0]}`),
      );
      finish(null);
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Concurrency                                                                 */
/* -------------------------------------------------------------------------- */

/** Extractions running now, and the requests waiting for a slot. */
let running = 0;
const waiting: (() => void)[] = [];

async function acquire(): Promise<void> {
  if (running < POSTER_MAX_CONCURRENT) {
    running += 1;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
}

/**
 * Hand the slot to whoever is next rather than decrementing and letting them
 * race for it. `running` is unchanged when the slot is transferred, which is
 * what keeps the count honest under a burst.
 */
function release(): void {
  const next = waiting.shift();
  if (next === undefined) {
    running -= 1;
    return;
  }
  next();
}

/**
 * Extractions in flight, keyed by cache key.
 *
 * This is the answer to "ten cards render at once". Ten cards are ten videos
 * and ten keys, so they do not collide; what does collide is the same video
 * asked for twice before the first answer lands — a second tab, a reload, a
 * page that shows a video in two sections. Without this each of those is its
 * own ffmpeg process doing identical work and its own write of the same file.
 * With it they await one promise.
 *
 * The entry is dropped once it settles, so the next request re-reads the cache
 * file the settled one just wrote rather than inheriting a stale buffer.
 */
const inFlight = new Map<string, Promise<Buffer | null>>();

async function extractOnce(
  key: string,
  ffmpeg: string,
  file: string,
  dir: string,
): Promise<Buffer | null> {
  const existing = inFlight.get(key);
  if (existing !== undefined) return existing;

  const task = (async (): Promise<Buffer | null> => {
    await acquire();
    try {
      for (const offset of POSTER_OFFSETS_SECONDS) {
        const body = await extractFrame(ffmpeg, file, offset);
        if (body !== null) {
          await store(dir, key, body);
          return body;
        }
      }
      return null;
    } finally {
      release();
    }
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, task);
  return task;
}

/* -------------------------------------------------------------------------- */
/* The two steps a route takes                                                 */
/* -------------------------------------------------------------------------- */

/** Which video this is, and what its poster would be called. */
export interface PosterTarget {
  ok: true;
  /** The video, absolute and already proven to be inside its root. */
  file: string;
  /** The cache key, which is also the entity tag. */
  key: string;
  /** Where the cached poster lives, or would. */
  cacheFile: string;
  /** A safe basename for `Content-Disposition`. */
  filename: string;
}

export type PosterTargetResult = PosterTarget | AssetFileProblem;

/** A poster, from the cache or freshly made. */
export interface PosterBody {
  ok: true;
  body: Buffer;
  /** True when no ffmpeg ran to answer this request. */
  cached: boolean;
}

export type PosterBodyResult = PosterBody | AssetFileProblem;

/**
 * Step one: the id to a video and a cache key, with no ffmpeg and no cache read.
 *
 * Separate from step two so a conditional request can be answered from the key
 * alone. A browser that already holds the poster sends its entity tag back, and
 * the honest reply is a 304 that touches neither the cache nor a decoder.
 *
 * Everything before the kind check is `resolveAssetFile`'s, including its 404s
 * for a missing row, a `link` with no file, a path that climbs out of its root,
 * and its 503s for a manimkc index that predates the run recording its data
 * root. They are passed straight through, so the two routes cannot answer the
 * same broken state two different ways.
 */
export async function posterTarget(
  db: CatalogDatabase,
  id: string,
): Promise<PosterTargetResult> {
  const resolved = await resolveAssetFile(db, id);
  if (resolved.ok === false) return resolved;

  if (!POSTER_SOURCE_TYPES.has(resolved.contentType)) {
    // A note, a transcript, a caption track or a diagram. Refused here rather
    // than discovered by ffmpeg, so nothing that is not a video is ever handed
    // to a decoder at all.
    return {
      ok: false,
      status: 404,
      error: "No such asset poster.",
      detail: `Asset ${id} is ${resolved.contentType}, and only a video has a poster.`,
    };
  }

  const stats = await stat(resolved.file);
  const key = posterKey(resolved.file, stats.size, stats.mtimeMs);
  const base = safeFilename(resolved.file).replace(/\.[^.]+$/, "");
  return {
    ok: true,
    file: resolved.file,
    key,
    cacheFile: path.join(posterCacheDir(), `${key}${POSTER_EXTENSION}`),
    filename: `${base === "" ? "poster" : base}${POSTER_EXTENSION}`,
  };
}

/**
 * Step two: the bytes, from the cache when it has them and from ffmpeg when it
 * does not.
 *
 * A cold cache is correct, not merely slow: the miss path extracts, writes
 * through a rename so no reader can see a partial file, and returns the buffer
 * it already holds rather than reading back what it just wrote.
 *
 * A missing ffmpeg is a 503 that names the variable to set, and it is an
 * ordinary state rather than an error: production has no ffmpeg and no videos,
 * a fresh clone has neither, and what either costs is the placeholder the card
 * was already showing.
 */
export async function posterBody(target: PosterTarget): Promise<PosterBodyResult> {
  try {
    const cached = await readFile(target.cacheFile);
    if (cached.length > 0) return { ok: true, body: cached, cached: true };
  } catch {
    // Not cached yet, or the cache directory is gone. Both mean "extract".
  }

  const ffmpeg = await resolveFfmpeg();
  if (ffmpeg === null) {
    return {
      ok: false,
      status: 503,
      error: "No poster can be made on this server.",
      detail:
        `ffmpeg is not on PATH, so no frame can be extracted. Install it, or set ` +
        `${FFMPEG_ENV} to its absolute path.`,
    };
  }

  const body = await extractOnce(target.key, ffmpeg, target.file, posterCacheDir());
  if (body === null) {
    return {
      ok: false,
      status: 503,
      error: "No poster could be made for this video.",
      detail: `ffmpeg produced no frame for ${target.filename}; the file may be unreadable.`,
    };
  }
  return { ok: true, body, cached: false };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
