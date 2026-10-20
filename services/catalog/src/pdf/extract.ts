import { spawn } from "node:child_process";

import { ffmpegPageArgs } from "./recipe";

/**
 * The frames a video's PDF pages are cut from, for `catalog asset upload`
 * and `catalog video put`.
 *
 * One ffmpeg spawn per page, exactly as `../poster/extract.ts` runs one per
 * poster: this runs once per video from a command a person started, so it
 * keeps only the bounds that stop a bad file from hanging or flooding the
 * command — a timeout per frame and a cap on what one frame may be.
 */

/** One frame at this size or larger is a bug or an encoder gone wrong, not a page. */
export const PDF_FRAME_MAX_BYTES = 4 * 1024 * 1024;
export const PDF_FRAME_TIMEOUT_MS = 30_000;

/** One frame of `file` at `atSeconds`, or null when the seek lands past the end. */
function frameAt(ffmpeg: string, file: string, atSeconds: number, timeoutMs: number): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ffmpegPageArgs(file, atSeconds), { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let size = 0;
    let failure: Error | null = null;
    const timer = setTimeout(() => {
      failure = new Error(`ffmpeg took longer than ${timeoutMs}ms at ${atSeconds}s`);
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > PDF_FRAME_MAX_BYTES) {
        failure = new Error(`ffmpeg wrote more than ${PDF_FRAME_MAX_BYTES} bytes at ${atSeconds}s`);
        child.kill("SIGKILL");
        return;
      }
      chunks.push(chunk);
    });
    // Drained so a chatty ffmpeg never blocks on a full pipe; `-loglevel
    // error` keeps it short.
    child.stderr.resume();
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (failure !== null) return reject(failure);
      if (code === 0 && size > 0) return resolve(Buffer.concat(chunks));
      // No bytes, or a non-zero exit, at a timestamp past the end is how
      // ffmpeg says "no frame there".
      resolve(null);
    });
  });
}

/**
 * A JPEG of `file` at `atSeconds`, then a step earlier, then the very start:
 * a segment's midpoint can land past the end on a render cut short, and the
 * title card beats an empty page. `ok: false` says why none yielded a frame.
 */
export async function extractPageFrame(
  ffmpeg: string,
  file: string,
  atSeconds: number,
  timeoutMs: number = PDF_FRAME_TIMEOUT_MS,
): Promise<{ ok: true; body: Buffer } | { ok: false; reason: string }> {
  for (const at of [atSeconds, Math.max(0, atSeconds / 2), 0]) {
    let body: Buffer | null;
    try {
      body = await frameAt(ffmpeg, file, at, timeoutMs);
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
    if (body !== null) return { ok: true, body };
  }
  return { ok: false, reason: `ffmpeg produced no frame at ${atSeconds}s or earlier` };
}

/**
 * `Duration: 00:01:16.63` from `ffmpeg -i`'s stderr — the length a silent
 * cut's fixed cadence is spread over, without asking ffprobe, a second
 * binary that can be absent independently of the first (the poster recipe
 * makes the same call). Null when ffmpeg prints none.
 */
export async function probeDuration(ffmpeg: string, file: string, timeoutMs = 15_000): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ["-nostdin", "-hide_banner", "-i", file], { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`ffmpeg took longer than ${timeoutMs}ms probing duration`));
    }, timeoutMs);
    child.stdout.resume();
    child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", () => {
      clearTimeout(timer);
      const match = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(Buffer.concat(chunks).toString("utf8"));
      if (match === null) return resolve(null);
      const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
      resolve(Number.isFinite(seconds) && seconds > 0 ? seconds : null);
    });
  });
}
