import { createHash } from "node:crypto";
import { constants, type Dirent } from "node:fs";
import { lstat, open, readdir, type FileHandle } from "node:fs/promises";
import path from "node:path";

/**
 * The newest picture the drawing agent took of its own work, for the grid's
 * live preview ("The job in the grid" in docs/STUDIO-CHAT-FIRST.md).
 *
 * The agent already screenshots every pass (`canvas run --shot
 * <scratch>/passN.png`) and the export it verifies (`verify -o
 * <scratch>/verify.png`), because its prompt tells it to look at each one. So
 * a preview costs no Chromium launch of its own: this reads the newest of
 * those files and nothing else. What the tile shows is what the agent last
 * looked at, which is the honest picture of where the drawing is.
 *
 * The directory is the job's own scratch, `$STUDIO_HOME/jobs/<id>/scratch/`,
 * which the agent may write anything into. So everything here is defensive
 * about what it finds:
 *
 * - Nothing is followed through a symlink. The scratch directory itself, a
 *   subdirectory and a file are each checked with `lstat`, and the file is
 *   opened with `O_NOFOLLOW`, so a link swapped in between the look and the
 *   open fails to open rather than serving whatever it points at.
 * - Only the scratch directory and its immediate subdirectories are read, and
 *   only regular files named `*.png`.
 * - A file must start with the PNG signature and end with the `IEND` chunk.
 *   The first is "this is a picture"; the second is "the tool finished writing
 *   it", since a poll can land in the middle of a screenshot being saved, and
 *   a half-written PNG is a broken image on the tile. An incomplete newest
 *   file falls back to the one before it.
 * - Anything over `MAX_BYTES` is skipped: a tile does not need it, and a
 *   poll should never stream tens of megabytes.
 */

/** The eight bytes every PNG starts with. */
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The last twelve bytes of every complete PNG: an empty `IEND` chunk and its CRC. */
const IEND = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

/** A canvas screenshot is a few hundred kilobytes; this is generous. */
export const MAX_BYTES = 16 * 1024 * 1024;

/** How many of the newest files are opened looking for a complete one. */
const TRIES = 4;

export interface LiveShot {
  /** Absolute, and inside the scratch directory it was found in. */
  file: string;
  /** The path under the scratch directory, for a test or a log line. */
  name: string;
  size: number;
  mtimeMs: number;
  /** Strong, from the name, the size and the time: a new picture is a new tag. */
  etag: string;
}

/**
 * The newest complete PNG under `scratch`, or null when there is none yet.
 *
 * Newest by modification time, and by name among files written in the same
 * millisecond, so the answer is stable between two polls of an unchanged
 * directory.
 */
export async function newestShot(scratch: string): Promise<LiveShot | null> {
  const root = await lstat(scratch).catch(() => null);
  if (root === null || !root.isDirectory()) return null;

  const found: { file: string; name: string; size: number; mtimeMs: number }[] = [];
  const consider = async (dir: string, entry: Dirent, prefix: string): Promise<void> => {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".png")) return;
    const file = path.join(dir, entry.name);
    const info = await lstat(file).catch(() => null);
    if (info === null || !info.isFile()) return;
    if (info.size < SIGNATURE.length + IEND.length || info.size > MAX_BYTES) return;
    found.push({ file, name: path.posix.join(prefix, entry.name), size: info.size, mtimeMs: info.mtimeMs });
  };

  for (const entry of await readdir(scratch, { withFileTypes: true }).catch(() => [] as Dirent[])) {
    // `Dirent` reports a symlink as a symlink, never as what it points at, so
    // a link to a directory elsewhere is skipped here and never listed.
    if (entry.isDirectory()) {
      const sub = path.join(scratch, entry.name);
      for (const inner of await readdir(sub, { withFileTypes: true }).catch(() => [] as Dirent[])) {
        await consider(sub, inner, entry.name);
      }
    } else {
      await consider(scratch, entry, "");
    }
  }

  found.sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name));
  for (const candidate of found.slice(0, TRIES)) {
    const handle = await openShot(candidate.file);
    if (handle === null) continue;
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size !== candidate.size) continue;
      if (!(await complete(handle, info.size))) continue;
      return { ...candidate, etag: etagOf(candidate) };
    } finally {
      await handle.close();
    }
  }
  return null;
}

/**
 * Open a file for reading without following a symlink at its last component.
 *
 * Exported for the route, which opens the file a second time to stream it and
 * must not be the place a link swapped in after `newestShot` gets followed.
 */
export async function openShot(file: string): Promise<FileHandle | null> {
  try {
    return await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    return null;
  }
}

/** Starts as a PNG and ends as one, so it is a whole picture. */
async function complete(handle: FileHandle, size: number): Promise<boolean> {
  const head = Buffer.alloc(SIGNATURE.length);
  const tail = Buffer.alloc(IEND.length);
  await handle.read(head, 0, head.length, 0);
  await handle.read(tail, 0, tail.length, size - IEND.length);
  return head.equals(SIGNATURE) && tail.equals(IEND);
}

function etagOf(shot: { name: string; size: number; mtimeMs: number }): string {
  const digest = createHash("sha256")
    .update(`${shot.name}\0${shot.size}\0${shot.mtimeMs}`)
    .digest("base64url")
    .slice(0, 16);
  return `"live-${digest}"`;
}

/** Whether an `If-None-Match` header names this tag. `*` and a list both count. */
export function matchesTag(header: string | string[] | undefined, etag: string): boolean {
  if (header === undefined) return false;
  const values = (Array.isArray(header) ? header.join(",") : header).split(",").map((value) => value.trim());
  return values.some((value) => value === "*" || value === etag || value === `W/${etag}`);
}
