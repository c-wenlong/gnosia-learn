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
 * which the agent may write anything into, so what is served is checked on
 * the open file itself, not on the names that led to it:
 *
 * - The file is opened once, with `O_NOFOLLOW` on its last component, and
 *   that handle is what gets streamed; nothing opens the path a second time.
 * - `O_NOFOLLOW` says nothing about the directories above the file, so a
 *   subdirectory (or `scratch` itself) swapped for a symlink between the
 *   listing and the open could still lead it outside. The opened handle is
 *   therefore checked against the tree *after* the open: its device and inode
 *   must be what `lstat` finds at the same path with every directory on the
 *   way, `scratch` included, a real directory rather than a link, and `scratch`
 *   must still be the directory the listing started from. A file reached
 *   through a swapped link has an inode that is not at that path once the link
 *   is swapped back, and fails.
 * - The one way to have the same inode at both places is a second name for it:
 *   a hard link. A file with more than one link is refused, so an outside file
 *   cannot be hard-linked into scratch and served. What remains possible is a
 *   file the agent itself could already move into scratch, which it could
 *   write there anyway.
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

/** A `LiveShot` with the handle it was verified on, which the caller streams and closes. */
export interface OpenShot extends LiveShot {
  handle: FileHandle;
}

/**
 * The newest complete PNG under `scratch`, opened and verified, or null when
 * there is none yet. The caller owns the handle and must close it (streaming
 * it with `createReadStream` does).
 *
 * Newest by modification time, and by name among files written in the same
 * millisecond, so the answer is stable between two polls of an unchanged
 * directory.
 */
export async function openNewestShot(scratch: string): Promise<OpenShot | null> {
  // Inode numbers as bigints: a filesystem is allowed ones past 2^53.
  const root = await lstat(scratch, { bigint: true }).catch(() => null);
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
    const handle = await openNoFollow(candidate.file);
    if (handle === null) continue;
    let keep = false;
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size !== candidate.size) continue;
      if (!(await inside(scratch, root, candidate.name, handle))) continue;
      if (!(await complete(handle, info.size))) continue;
      keep = true;
      return { ...candidate, etag: etagOf(candidate), handle };
    } finally {
      if (!keep) await handle.close();
    }
  }
  return null;
}

/** The newest picture's facts, with its handle closed: for a test, or a caller that serves nothing. */
export async function newestShot(scratch: string): Promise<LiveShot | null> {
  const shot = await openNewestShot(scratch);
  if (shot === null) return null;
  const { handle, ...facts } = shot;
  await handle.close();
  return facts;
}

/**
 * Whether an open handle is the file at `scratch/<name>`, reached through real
 * directories only, with no second name.
 *
 * Checked after the open, so it covers a directory swapped for a link and back
 * again around the open: the handle keeps the inode it opened, and the path is
 * read again now. `root` is `scratch` as the listing found it.
 */
export async function inside(
  scratch: string,
  root: { dev: bigint; ino: bigint },
  name: string,
  handle: FileHandle,
): Promise<boolean> {
  const opened = await handle.stat({ bigint: true }).catch(() => null);
  if (opened === null || !opened.isFile() || opened.nlink !== 1n) return false;

  const now = await lstat(scratch, { bigint: true }).catch(() => null);
  if (now === null || !now.isDirectory() || now.dev !== root.dev || now.ino !== root.ino) return false;

  const parts = name.split("/");
  if (parts.length > 2 || parts.some((part) => part === "" || part === "." || part === "..")) return false;
  if (parts.length === 2) {
    const sub = await lstat(path.join(scratch, parts[0] ?? ""), { bigint: true }).catch(() => null);
    if (sub === null || !sub.isDirectory()) return false;
  }
  const atPath = await lstat(path.join(scratch, ...parts), { bigint: true }).catch(() => null);
  return atPath !== null && atPath.isFile() && atPath.dev === opened.dev && atPath.ino === opened.ino;
}

async function openNoFollow(file: string): Promise<FileHandle | null> {
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
