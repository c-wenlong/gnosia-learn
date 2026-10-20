import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { studioHome } from "../paths";

/**
 * The last content the studio read successfully, kept so it can still work
 * when the source cannot answer (D13 of docs/CONTENT-MIGRATION.md).
 *
 * The studio promises browsing and drawing with Postgres down (U3 of
 * docs/TLDRAWKC-INTEGRATION.md). While the vocabulary is a file that promise
 * is free; once it is rows, a database outage would take the topic list with
 * it. So every successful read through the seam is written to
 * `$STUDIO_HOME/cache/<type>.json`, and a read that throws is answered from
 * that copy instead, marked stale and carrying the time it was read, so the
 * screen can say "stale since" rather than pretend it is current.
 *
 * With no copy on disk a failed read throws its own error unchanged: a cache
 * that invented an empty vocabulary would let every brief fail as "no such
 * topic", which is a worse sentence than the real one.
 */

export interface CachedRead<T> {
  value: T;
  /** When `value` was read from the source, as an ISO instant. */
  readAt: string;
  /** True when the source threw and `value` is the copy from `readAt`. */
  stale: boolean;
  /** Why the source could not be read, when `stale`. */
  error?: string;
}

interface CacheFile<T> {
  version: 1;
  type: string;
  readAt: string;
  value: T;
}

// A plain word, or a word and one owner id after a dot (`diagrams.<owner>`):
// never a slash, and never a second dot, so no name can leave the directory.
const TYPE_PATTERN = /^[a-z]+(\.[A-Za-z0-9_-]+)?$/;

/** `$STUDIO_HOME/cache/`. Beside the job workspaces, and gitignored with them. */
export function cacheDir(): string {
  return path.join(studioHome(), "cache");
}

export function cachePath(type: string): string {
  // The type becomes a file name, so it is a plain word, or one owner's copy of one.
  if (!TYPE_PATTERN.test(type)) throw new Error(`"${type}" is not a content type name`);
  return path.join(cacheDir(), `${type}.json`);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

let writes = 0;

/**
 * One queue of writes per type.
 *
 * A job being posted and a health poll can read the vocabulary at the same
 * moment, and two renames in flight finish in whatever order the filesystem
 * likes, so the older read could land last and become the copy an outage
 * falls back on. `readThrough` queues its write as soon as its read returns,
 * with no await in between, so queue order is read order and the newest read
 * is always the last one written.
 */
const queues = new Map<string, Promise<void>>();

function writeCache<T>(type: string, readAt: string, value: T): Promise<void> {
  const previous = queues.get(type) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => writeNow(type, readAt, value));
  queues.set(type, next);
  // The map holds the tail only while it is the tail, so an idle type keeps nothing.
  void next.finally(() => {
    if (queues.get(type) === next) queues.delete(type);
  }).catch(() => undefined);
  return next;
}

async function writeNow<T>(type: string, readAt: string, value: T): Promise<void> {
  const file = cachePath(type);
  await mkdir(path.dirname(file), { recursive: true });
  const body: CacheFile<T> = { version: 1, type, readAt, value };
  // A sibling temp file and a rename, as `store.ts` writes job.json: a reader
  // sees the old copy or the new one, never half of either, and two writes in
  // flight never share a temp name.
  writes += 1;
  const temporary = `${file}.${process.pid}.${writes}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(body)}\n`, "utf8");
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

/**
 * The copy on disk, or null when there is none or it cannot be read as one.
 *
 * `isValue` is the caller's check on the stored value: a file that parses as
 * JSON but holds the wrong shape (hand-edited, or written by an older build)
 * is no copy, rather than a value that breaks whatever iterates it.
 */
export async function readCache<T>(
  type: string,
  isValue?: (value: unknown) => value is T,
): Promise<{ readAt: string; value: T } | null> {
  let text: string;
  try {
    text = await readFile(cachePath(type), "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as Partial<CacheFile<T>>;
    if (parsed.version !== 1 || parsed.type !== type || typeof parsed.readAt !== "string" || !("value" in parsed)) {
      return null;
    }
    if (isValue !== undefined && !isValue(parsed.value)) return null;
    return { readAt: parsed.readAt, value: parsed.value as T };
  } catch {
    return null;
  }
}

/**
 * `read()`, remembered on success and stood in for on failure.
 *
 * A cache that cannot be written costs the fallback, not the read: the value
 * is returned either way and the reason is logged.
 */
export async function readThrough<T>(
  type: string,
  read: () => Promise<T>,
  options: { now?: () => Date; isValue?: (value: unknown) => value is T } = {},
): Promise<CachedRead<T>> {
  const now = options.now ?? (() => new Date());
  let value: T;
  try {
    value = await read();
  } catch (error) {
    const cached = await readCache<T>(type, options.isValue);
    if (cached === null) throw error;
    return { value: cached.value, readAt: cached.readAt, stale: true, error: messageOf(error) };
  }
  const readAt = now().toISOString();
  try {
    await writeCache(type, readAt, value);
  } catch (error) {
    console.warn(`studio: could not cache ${type} under ${cacheDir()}, ${messageOf(error)}`);
  }
  return { value, readAt, stale: false };
}
