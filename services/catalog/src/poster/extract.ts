import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";

import { ffmpegArgs, POSTER_OFFSETS_SECONDS } from "./recipe";

/**
 * Making one poster on the laptop, for `catalog asset upload`.
 *
 * The web app's fallback (`apps/web/src/lib/asset-posters.ts`) does the same
 * with a cache, a concurrency cap and failure markers, because it runs inside
 * a request. This runs once per video from a command a person started, one at
 * a time, so it keeps only the bounds that stop a bad file from hanging or
 * flooding the command: a timeout and a cap on what ffmpeg may write.
 */

/** Same variable the web app reads, with the same rule: absolute, or ignored. */
export const FFMPEG_ENV = "FFMPEG_PATH";

export const POSTER_TIMEOUT_MS = 30_000;
export const POSTER_MAX_BYTES = 2 * 1024 * 1024;

async function executable(file: string): Promise<boolean> {
  try {
    if (!(await stat(file)).isFile()) return false;
    await access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** `$FFMPEG_PATH` when it is an absolute executable, else the first `ffmpeg` on `PATH`, else null. */
export async function findFfmpeg(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const override = (env[FFMPEG_ENV] ?? "").trim();
  if (override !== "") return path.isAbsolute(override) && (await executable(override)) ? override : null;
  for (const dir of (env.PATH ?? "").split(path.delimiter)) {
    if (dir === "" || !path.isAbsolute(dir)) continue;
    const candidate = path.join(dir, "ffmpeg");
    if (await executable(candidate)) return candidate;
  }
  return null;
}

export type FrameResult = { ok: true; body: Buffer; offset: number } | { ok: false; reason: string };

/** One attempt at one offset. No frame (a seek past the end) is `null`, anything else is an error. */
function attempt(ffmpeg: string, file: string, offset: number, timeoutMs: number): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ffmpegArgs(file, offset), { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let size = 0;
    let failure: Error | null = null;
    const timer = setTimeout(() => {
      failure = new Error(`ffmpeg took longer than ${timeoutMs}ms at ${offset}s`);
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > POSTER_MAX_BYTES) {
        failure = new Error(`ffmpeg wrote more than ${POSTER_MAX_BYTES} bytes at ${offset}s`);
        child.kill("SIGKILL");
        return;
      }
      chunks.push(chunk);
    });
    // Drained so a chatty ffmpeg never blocks on a full pipe; `-loglevel
    // error` keeps it short, and a seek past the end is the only error an
    // ordinary video produces.
    child.stderr.resume();
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (failure !== null) return reject(failure);
      if (code === 0 && size > 0) return resolve(Buffer.concat(chunks));
      // No bytes, or a non-zero exit, at an offset past the end is how ffmpeg
      // says "no frame there"; the next, earlier offset is the retry.
      resolve(null);
    });
  });
}

/**
 * A JPEG still of `file`, trying each offset in `POSTER_OFFSETS_SECONDS` until
 * one yields a frame. `ok: false` says why none did.
 */
export async function extractPoster(
  ffmpeg: string,
  file: string,
  timeoutMs: number = POSTER_TIMEOUT_MS,
): Promise<FrameResult> {
  for (const offset of POSTER_OFFSETS_SECONDS) {
    let body: Buffer | null;
    try {
      body = await attempt(ffmpeg, file, offset, timeoutMs);
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
    if (body !== null) return { ok: true, body, offset };
  }
  return { ok: false, reason: `ffmpeg produced no frame at ${POSTER_OFFSETS_SECONDS.join("s, ")}s` };
}
