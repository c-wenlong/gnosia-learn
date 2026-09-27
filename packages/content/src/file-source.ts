import { readdirSync, statSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { COURSES_DIR, loadCourses } from "./courses";
import { ContentError } from "./errors";
import type { ConceptNoteSource, ContentSource, DiagramSource, SessionLogSource } from "./source";
import { loadTags, TAGS_FILE } from "./tags";
import { loadTopics, TOPICS_FILE } from "./topics";

/**
 * The file implementation of `ContentSource`: today's layout under one root.
 *
 * `topics`, `tags` and `courses` call the same synchronous parsers the catalog
 * indexers call, so a file this refuses is a file `catalog index` refuses, with
 * the same sentence. Nothing about validation lives here.
 *
 * **Parsed once per change, not once per call.** The web app used to parse at
 * module load, once per server process. Behind the seam it asks per request,
 * and parsing every course file on every request costs about 18 ms (*measured*
 * on the owner's laptop, 2026-09-28) for nothing. So each of the three keeps
 * its last result keyed on the size, times and inode of every file it
 * read, which costs a `stat` per file, and a course file edited while the
 * server runs is picked up on the next request instead of at the next restart.
 * The result is shared between callers exactly as the module-level constants
 * were, so a caller must not mutate what it gets.
 */

export const NOTES_DIR = "learn/concepts";
export const SESSIONS_DIR = "learn/sessions";
export const DIAGRAMS_DIR = "learn/assets";

export function fileSource(root: string): ContentSource {
  const topics = memoOnFiles(
    () => [path.join(root, TOPICS_FILE)],
    () => loadTopics({ root }),
  );
  const tags = memoOnFiles(
    () => [path.join(root, TAGS_FILE)],
    () => loadTags({ root }),
  );
  const courses = memoOnFiles(
    () => [path.join(root, TOPICS_FILE), path.join(root, TAGS_FILE), ...courseFiles(root)],
    () => loadCourses({ root }),
  );

  return {
    topics: async () => topics(),
    tags: async () => tags(),
    courses: async () => courses(),
    concept: (slug) => readConcept(root, slug),
    sessionLog: (id) => readSessionLog(root, id),
    diagram: (slug) => readDiagram(root, slug),
  };
}

/**
 * The course directory's YAML files, as `loadCourses` will find them.
 *
 * A missing directory is an empty list here rather than an error: the parser
 * reports it in its own words on the miss that follows, and a signature that
 * threw would replace that sentence with a bare `ENOENT`.
 */
function courseFiles(root: string): string[] {
  const directory = path.join(root, COURSES_DIR);
  try {
    return readdirSync(directory)
      .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
      .sort()
      .map((name) => path.join(directory, name));
  } catch {
    return [];
  }
}

/**
 * `path size mtime ctime inode` for each file, or `path missing`. Two equal
 * strings mean nothing changed.
 *
 * Size and mtime alone miss two ordinary edits: a same-length rewrite within
 * the filesystem's mtime granularity, and a file replaced by a rename (how
 * editors and `git checkout` save) whose mtime was preserved or set back, as
 * `cp -p`, `touch -r` and archive extraction do. The inode changes on a rename
 * and the ctime on any write or metadata change, and neither can be set by a
 * caller, so together they catch what the first two let through.
 */
function signatureOf(files: readonly string[]): string {
  return files
    .map((file) => {
      try {
        const facts = statSync(file);
        return `${file} ${facts.size} ${facts.mtimeMs} ${facts.ctimeMs} ${facts.ino}`;
      } catch {
        return `${file} missing`;
      }
    })
    .join("\n");
}

/**
 * `read()`'s last result, reused while `files()` stat the same.
 *
 * A read that throws is not kept, so a broken file is reported on every call
 * until it is fixed, never masked by an older good parse.
 */
function memoOnFiles<T>(files: () => string[], read: () => T): () => T {
  let last: { signature: string; value: T } | null = null;
  return () => {
    const signature = signatureOf(files());
    if (last !== null && last.signature === signature) return last.value;
    const value = read();
    last = { signature, value };
    return value;
  };
}

function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

async function readOrNull(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

// The frontmatter fence and line shapes of the notes' own dialect
// (`services/catalog/src/index/frontmatter.ts`), read only as far as the
// `id:` key: the id, not the filename, is what a note's primary key is. Line
// by line, as the dialect reads, so no pattern can run past the end of a line.
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const BLOCK_ITEM_RE = /^\s*-\s+(.*)$/;
const PAIR_RE = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/;

/**
 * The concept id a note declares, falling back to its filename stem exactly as
 * the concepts indexer does (`readText(data, "id") ?? basename`).
 *
 * The dialect's rules for that one key, which `services/catalog/test/`
 * holds this function to on the same inputs: the last `id:` line wins; an
 * empty value, `null`, `~`, an inline list, or a block list (`- a` lines
 * under it) is no id; quotes are stripped; a number is read as a number, so
 * `007` is `7`; blank and `#` lines are skipped without ending a list.
 */
export function noteId(markdown: string, stem: string): string {
  const block = FRONTMATTER_RE.exec(markdown)?.[1];
  if (block === undefined || block === "") return stem;
  let current: string | null = null;
  /** The id's raw text, or null for no id (absent, empty, or a list). */
  let raw: string | null = null;
  for (const line of block.split(/\r?\n/)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (BLOCK_ITEM_RE.test(line) && current !== null) {
      if (current === "id") raw = null;
      continue;
    }
    const pair = PAIR_RE.exec(line);
    if (pair === null) continue;
    current = pair[1] as string;
    if (current !== "id") continue;
    const value = (pair[2] as string).trim();
    raw = value === "" || value.startsWith("[") ? null : value;
  }
  if (raw === null || raw === "null" || raw === "~") return stem;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return String(Number(raw));
  const quoted =
    raw.length >= 2 &&
    ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")));
  const value = (quoted ? raw.slice(1, -1) : raw).trim();
  return value === "" ? stem : value;
}

async function domainsOf(root: string): Promise<string[]> {
  try {
    const entries = await readdir(path.join(root, NOTES_DIR), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

/**
 * Can `name` be used as one file name under a content directory?
 *
 * The ids themselves are not required to be kebab-case (the concepts indexer
 * takes any declared id), so this checks what matters for a path instead: one
 * segment, not hidden, no separator. An id that fails it can still be found by
 * the scan, which compares ids and never builds a path from one.
 */
function isFileName(name: string): boolean {
  return name !== "" && !name.startsWith(".") && !/[\\/\0]/.test(name);
}

/**
 * The note whose id is `slug`.
 *
 * `<domain>/<slug>.md` is tried first because every note today is named after
 * its id; a file of that name declaring another id is not this concept. Only
 * when no filename answers are the notes scanned for the id, which is the rule
 * the indexer applies and the slow path nobody takes today.
 */
async function readConcept(root: string, slug: string): Promise<ConceptNoteSource | null> {
  if (slug.trim() === "") return null;
  const domains = await domainsOf(root);

  for (const domain of isFileName(slug) ? domains : []) {
    const relative = path.posix.join(NOTES_DIR, domain, `${slug}.md`);
    const markdown = await readOrNull(path.join(root, relative));
    if (markdown !== null && noteId(markdown, slug) === slug) {
      return { slug, domain, path: relative, markdown };
    }
  }

  for (const domain of domains) {
    const directory = path.join(root, NOTES_DIR, domain);
    const names = (await readdir(directory)).filter((name) => name.endsWith(".md")).sort();
    for (const name of names) {
      const relative = path.posix.join(NOTES_DIR, domain, name);
      const markdown = await readOrNull(path.join(root, relative));
      if (markdown !== null && noteId(markdown, path.basename(name, ".md")) === slug) {
        return { slug, domain, path: relative, markdown };
      }
    }
  }
  return null;
}

async function readSessionLog(root: string, id: string): Promise<SessionLogSource | null> {
  // A session log's id is its file stem, so a name that cannot be a file names no log.
  if (!isFileName(id)) return null;
  const relative = path.posix.join(SESSIONS_DIR, `${id}.md`);
  const markdown = await readOrNull(path.join(root, relative));
  return markdown === null ? null : { id, path: relative, markdown };
}

async function readDiagram(root: string, slug: string): Promise<DiagramSource | null> {
  if (!isFileName(slug)) return null;
  const relative = path.posix.join(DIAGRAMS_DIR, `${slug}.tldr`);
  const text = await readOrNull(path.join(root, relative));
  if (text === null) return null;
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch (error) {
    throw new ContentError(`${relative} is not a JSON document: ${(error as Error).message}`);
  }
  const svg = path.posix.join(DIAGRAMS_DIR, `${slug}.svg`);
  const svgPath = (await isFile(path.join(root, svg))) ? svg : null;
  return { slug, path: relative, document, svgPath };
}
