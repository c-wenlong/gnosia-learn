import { createHash } from "node:crypto";
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";

// The catalog's pure limits module, reached by path as gate.ts reaches its poster recipe.
import { VIDEO_SOURCE_BYTES_MAX, VIDEO_SOURCE_FILES_MAX } from "../../../catalog/src/content/video-source-limits";
import { safeRead } from "./copy";

/**
 * A TypeScript tool's video source (D77, D79 of docs/STUDIO-VIDEO-TOOLS.md):
 * the topic folder's scene file (revideokc's `scene.tsx`, remotionkc's
 * `composition.tsx`), its `narration.json`, and any `.ts` or `.tsx` the agent
 * adds beside them, one level deep, plus the runner's `topic.yml`.
 *
 * A manimkc source is one scene file, so the wrapper records that file's
 * sha256 on every call and the gate holds the build to it. Here a build is
 * of several files, so the same `sceneSha256` field carries one hash over
 * all of them (`combinedHash`): an edit to any file after the last build
 * shows as a build of another source. The wrapper computes it in its own
 * process (`hashJs`, compiled into the program it writes), and the runner
 * here; each tool's tests hold the two equal.
 */

/** A file of the source besides `topic.yml`: the scene, the narration, and TypeScript beside them. */
export const SOURCE_FILE = /^(?:narration\.json|[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}\.tsx?)$/;

/** Every file a change starts from: the source and `topic.yml`. The catalog's own rule for these tools' topics is the same. */
export const SOURCE_PATTERN = /^(?:narration\.json|topic\.yml|[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}\.tsx?)$/;

/** The most source files a topic folder may hold beside `topic.yml`: the catalog's limit, less that file. */
export const SOURCE_FILES_MAX = VIDEO_SOURCE_FILES_MAX - 1;

/**
 * The most bytes the source may hold together, `topic.yml` included: the
 * catalog's own limit (`video put` refuses more), so a source the gate passes
 * is one Accept can store. One file can be no more than all of it.
 */
export const SOURCE_BYTES_MAX = VIDEO_SOURCE_BYTES_MAX;

/** One hash over a set of files: each name and its sha256, sorted by name, one line each. */
export function combinedHash(entries: readonly { name: string; sha256: string }[]): string {
  const lines = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).map((entry) => `${entry.name}\u0000${entry.sha256}\n`);
  return createHash("sha256").update(lines.join("")).digest("hex");
}

/**
 * The same hash, as plain JavaScript for a wrapper: a function of the topic
 * folder that reads each source file without following a link and returns
 * null when there is no `scene` file or a file is not a plain regular one.
 */
export function hashJs(scene: string): string {
  if (!SOURCE_FILE.test(scene) || scene === "narration.json") throw new Error(`${scene} cannot be a scene file`);
  return String.raw`
function sourceHash(dir) {
  const PATTERN = ${SOURCE_FILE.toString()};
  let names;
  try { names = fs.readdirSync(dir).filter((name) => PATTERN.test(name)).sort(); } catch { return null; }
  if (!names.includes(${JSON.stringify(scene)})) return null;
  const lines = [];
  for (const name of names) {
    let fd;
    try { fd = fs.openSync(dir + "/" + name, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); } catch { return null; }
    try {
      const st = fs.fstatSync(fd);
      if (!st.isFile() || st.nlink !== 1) return null;
      const hash = crypto.createHash("sha256");
      const buffer = Buffer.alloc(1 << 16);
      for (;;) {
        const n = fs.readSync(fd, buffer, 0, buffer.length, null);
        if (n === 0) break;
        hash.update(buffer.subarray(0, n));
      }
      lines.push(name + "\u0000" + hash.digest("hex") + "\n");
    } finally { fs.closeSync(fd); }
  }
  return crypto.createHash("sha256").update(lines.join("")).digest("hex");
}
`;
}

export interface SourceFile {
  name: string;
  path: string;
  body: Buffer;
  sha256: string;
}

export class SourceRefused extends Error {}

/**
 * Read every source file of a topic folder, the gate's careful way (a link,
 * a hard link or anything but a regular file refused), sorted by name.
 * Throws `SourceRefused` naming what is wrong.
 */
export async function readSources(topicDir: string): Promise<SourceFile[]> {
  const names = (await readdir(topicDir)).filter((name) => SOURCE_FILE.test(name)).sort();
  if (names.length > SOURCE_FILES_MAX) throw new SourceRefused(`the topic folder holds ${names.length} source files; at most ${SOURCE_FILES_MAX} are kept`);
  const out: SourceFile[] = [];
  for (const name of names) {
    const file = path.join(topicDir, name);
    let body: Buffer;
    try {
      body = await safeRead(file, SOURCE_BYTES_MAX);
    } catch (error) {
      throw new SourceRefused(`${name} could not be read: ${(error as Error).message}`);
    }
    out.push({ name, path: file, body, sha256: createHash("sha256").update(body).digest("hex") });
  }
  return out;
}

/** The combined hash of the source as it is now, or null when there is no scene file or a file is refused: what the wrapper would record. */
export async function currentSourceHash(topicDir: string, scene: string): Promise<string | null> {
  if ((await lstat(path.join(topicDir, scene)).catch(() => null)) === null) return null;
  try {
    return combinedHash(await readSources(topicDir));
  } catch {
    return null;
  }
}

/** The source files present now, `topic.yml` included: what `source/` keeps. */
export async function sourceFilePaths(topicDir: string): Promise<string[]> {
  const names = await readdir(topicDir).catch(() => [] as string[]);
  return names
    .filter((name) => SOURCE_PATTERN.test(name))
    .sort()
    .map((name) => path.join(topicDir, name));
}
