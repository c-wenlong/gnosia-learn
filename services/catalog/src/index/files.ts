import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

/**
 * Reading files, the two ways every indexer needs: "what is in this directory"
 * and "how big is this and what does it hash to".
 */

export interface FileFacts {
  /** sha256 of the bytes, lowercase hex. */
  contentHash: string;
  bytes: number;
}

/**
 * Hash and size in one pass, streaming. A mp4 deliverable is tens of megabytes
 * and there are two dozen of them, so `readFile` into a Buffer just to hash it
 * would hold the whole catalogue's video bytes in memory across one index run.
 */
export async function fileFacts(absolutePath: string): Promise<FileFacts> {
  const hash = createHash("sha256");
  const { size } = await stat(absolutePath);
  await pipeline(createReadStream(absolutePath), hash);
  return { contentHash: hash.digest("hex"), bytes: size };
}

/**
 * Files directly inside `directory` whose name ends in one of `extensions`,
 * sorted by name so an index run is reproducible. A missing directory is an
 * empty list: a repo with no `learn/sessions/` yet is not an error, it is a
 * repo with no sessions.
 */
export async function filesIn(
  directory: string,
  extensions: readonly string[],
): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((e) => e.isFile() && extensions.some((ext) => e.name.endsWith(ext)))
    .map((e) => path.join(directory, e.name))
    .sort();
}

/** Immediate subdirectories of `directory`, sorted. Missing directory: empty. */
export async function directoriesIn(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => path.join(directory, e.name))
    .sort();
}

/**
 * A path as the catalog stores it: relative to the root it belongs to, with
 * forward slashes. Windows is not a target, but `path.relative` is the only
 * thing in this file that would produce backslashes and normalising here costs
 * nothing.
 */
export function relativeTo(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}
