import { open, readFile, rename, rm, writeFile, type FileHandle } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { loadTopics, TOPICS_FILE } from "@self-learn/content";

import { loadVocabulary } from "../index/vocabulary";

/**
 * Adding one concept slug to one topic's `maps.concepts`, in the file, without
 * rewriting the file.
 *
 * The obvious implementation is `parse`, mutate, `stringify`. It is also the
 * wrong one here: `content/topics.yaml` is 80 hand-written entries with section
 * banners, alignment and comments explaining what each `maps` key means, and a
 * round trip through a serialiser loses all of it and re-quotes half the
 * strings besides. The diff for "one concept joined one topic" would be the
 * whole file, which is unreviewable and would collide with every other edit.
 *
 * So the edit is textual: find the entry, find its `concepts:` key, splice the
 * slug in, leave every other byte alone. That is only safe because the result
 * is checked by the real parser before it is kept — see `mapConceptToTopic`.
 */

/** A line-level failure that names the file and what it could not find. */
export class VocabularyEditError extends Error {}

/** `- slug: foo`, at any indentation, with an optional trailing comment. */
const ENTRY = /^(\s*)-\s+slug:\s*(?:"([^"]*)"|'([^']*)'|([^#\s]+))\s*(?:#.*)?$/;

/** `key:` with an optional inline value, at any indentation. */
const KEY = /^(\s*)([A-Za-z_][\w-]*):(.*)$/;

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function isBlank(line: string): boolean {
  return line.trim() === "" || line.trim().startsWith("#");
}

/**
 * The half-open line range `[start, end)` of the topic entry with this slug.
 *
 * The entry ends at the next line that is a sibling list item or that is
 * outdented past the entry's own properties. Blank lines and comment lines are
 * not enough to end it: `topics.yaml` puts a `# ---- domain ----` banner
 * between entries, and treating that as the end would truncate the entry above.
 */
function entryRange(lines: string[], slug: string): { start: number; end: number; indent: number } {
  let start = -1;
  let indent = 0;
  for (const [i, line] of lines.entries()) {
    const match = ENTRY.exec(line);
    if (match === null) continue;
    const found = match[2] ?? match[3] ?? match[4];
    if (found !== slug) continue;
    if (start !== -1) {
      throw new VocabularyEditError(
        `${TOPICS_FILE}: topic "${slug}" appears twice, on lines ${start + 1} and ${i + 1}`,
      );
    }
    start = i;
    indent = match[1]?.length ?? 0;
  }
  if (start === -1) {
    throw new VocabularyEditError(`${TOPICS_FILE}: no topic entry with slug "${slug}"`);
  }

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] as string;
    if (isBlank(line)) continue;
    if (indentOf(line) <= indent) {
      end = i;
      break;
    }
  }
  // Give back the trailing blank and comment lines that belong to whatever
  // comes next, so an insertion lands inside the entry rather than after it.
  while (end > start + 1 && isBlank(lines[end - 1] as string)) end -= 1;
  return { start, end, indent };
}

/** The line index of `key:` directly inside `[start, end)` at exactly `indent`. */
function keyLine(
  lines: string[],
  range: { start: number; end: number },
  indent: number,
  key: string,
): number {
  for (let i = range.start; i < range.end; i += 1) {
    const match = KEY.exec(lines[i] as string);
    if (match === null) continue;
    if ((match[1]?.length ?? 0) !== indent) continue;
    if (match[2] === key) return i;
  }
  return -1;
}

/**
 * The items of a `[a, b]` flow sequence starting on `lines[at]`, unquoted.
 *
 * Only good enough to answer "is this slug already here", which is all it is
 * asked. Slugs are kebab-case, so nothing in a real list needs quoting or
 * escaping, and a comma inside a quoted item would be a file this module
 * refuses to touch anyway.
 */
function flowItems(lines: string[], at: number, stop: number): string[] {
  let text = "";
  for (let i = at; i < stop; i += 1) {
    const line = lines[i] as string;
    const close = line.lastIndexOf("]");
    text += close === -1 ? line : line.slice(0, close);
    if (close !== -1) break;
  }
  const open = text.indexOf("[");
  if (open === -1) return [];
  return text
    .slice(open + 1)
    .split(",")
    .map((item) => item.trim().replace(/^["']|["']$/g, ""))
    .filter((item) => item !== "");
}

/**
 * Insert `slug` into a `[a, b]` flow sequence that starts on `lines[at]`.
 *
 * The list may run over several lines, so the closing bracket is searched for
 * rather than assumed to be on the first one. Appending before the `]` keeps
 * the author's spacing, which is what makes the diff one line.
 */
function insertIntoFlow(lines: string[], at: number, stop: number, slug: string): boolean {
  for (let i = at; i < stop; i += 1) {
    const line = lines[i] as string;
    const close = line.lastIndexOf("]");
    if (close === -1) continue;
    const before = line.slice(0, close);
    const after = line.slice(close);
    const head = before.trimEnd();
    lines[i] = head.endsWith("[") ? `${head}${slug}${after}` : `${head}, ${slug}${after}`;
    return true;
  }
  return false;
}

/**
 * `topics.yaml` text with `conceptSlug` added to `topicSlug`'s `maps.concepts`.
 *
 * Idempotent: a slug already in the list is left alone and the text comes back
 * unchanged. Both the flow form (`concepts: [a, b]`, which is what the file
 * uses) and the block form (`- a` on its own lines) are handled, because a
 * human editing the file by hand may well switch to the block form once a list
 * gets long, and losing their entry would be the worst possible outcome here.
 */
export function addConceptToTopic(text: string, topicSlug: string, conceptSlug: string): string {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const range = entryRange(lines, topicSlug);

  const propertyIndent = range.indent + 2;
  const maps = keyLine(lines, range, propertyIndent, "maps");
  if (maps === -1) {
    throw new VocabularyEditError(
      `${TOPICS_FILE}: topic "${topicSlug}" has no maps: block to add a concept to`,
    );
  }

  // Where the maps: block stops. It is the last key in every entry today, so
  // this is usually the end of the entry, but a key added after it must not be
  // swept into the block.
  let mapsEnd = range.end;
  for (let i = maps + 1; i < range.end; i += 1) {
    const line = lines[i] as string;
    if (isBlank(line)) continue;
    if (indentOf(line) <= propertyIndent) {
      mapsEnd = i;
      break;
    }
  }
  while (mapsEnd > maps + 1 && isBlank(lines[mapsEnd - 1] as string)) mapsEnd -= 1;

  const mapsRange = { start: maps + 1, end: mapsEnd };
  const concepts = keyLine(lines, mapsRange, propertyIndent + 2, "concepts");
  if (concepts === -1) {
    // A `maps:` block with `manimkc` and `courses` but no `concepts`. Adding
    // the key is a smaller change than asking the author to.
    lines.splice(mapsRange.end, 0, `${" ".repeat(propertyIndent + 2)}concepts: [${conceptSlug}]`);
    return lines.join(newline);
  }

  const value = (KEY.exec(lines[concepts] as string)?.[3] ?? "").trim();

  if (value.startsWith("[")) {
    if (flowItems(lines, concepts, mapsEnd).includes(conceptSlug)) return text;
    if (!insertIntoFlow(lines, concepts, mapsEnd, conceptSlug)) {
      throw new VocabularyEditError(
        `${TOPICS_FILE}: topic "${topicSlug}" has a maps.concepts list that never closes`,
      );
    }
    return lines.join(newline);
  }

  if (value !== "" && !value.startsWith("#")) {
    throw new VocabularyEditError(
      `${TOPICS_FILE}: topic "${topicSlug}" has a maps.concepts that is neither a ` +
        `flow list nor a block list; edit it by hand`,
    );
  }

  // Block form, or an empty key. Find the last `- item` under it.
  let last = -1;
  let itemIndent = propertyIndent + 4;
  for (let i = concepts + 1; i < mapsEnd; i += 1) {
    const line = lines[i] as string;
    if (isBlank(line)) continue;
    const indent = indentOf(line);
    if (indent <= propertyIndent + 2) break;
    const item = line.trimStart();
    if (!item.startsWith("- ")) break;
    if (item.slice(2).trim().replace(/^["']|["']$/g, "") === conceptSlug) return text;
    last = i;
    itemIndent = indent;
  }
  if (last === -1) {
    // `concepts:` with nothing under it parses as null, which `stringList`
    // reads as the empty list. Write the flow form the rest of the file uses,
    // keeping any inline comment: those comments are what the file uses to
    // explain what each `maps` key holds, and losing one is churn in a
    // hand-maintained document.
    const comment = value === "" ? "" : `  ${value}`;
    lines[concepts] = `${" ".repeat(propertyIndent + 2)}concepts: [${conceptSlug}]${comment}`;
    return lines.join(newline);
  }
  lines.splice(last + 1, 0, `${" ".repeat(itemIndent)}- ${conceptSlug}`);
  return lines.join(newline);
}

export interface MapConceptResult {
  /** True when the file was written; false when the mapping was already there. */
  changed: boolean;
}

/** How long to wait for another process to finish its edit before giving up. */
const LOCK_TIMEOUT_MS = 10_000;
const LOCK_POLL_MS = 50;

/**
 * Hold an exclusive lock on the vocabulary for the length of one edit.
 *
 * The edit is a read, a splice and a write, so two of them running at once can
 * both read the same original and the second write drops the first mapping.
 * Neither would notice: each verifies only its own slug, so both report
 * success and one concept note is left orphaned, unindexable, and refused by
 * the next `observe`. That is precisely the failure `--topic` exists to
 * prevent, so it cannot be left to luck.
 *
 * `open(..., "wx")` is the lock: creating a file that must not already exist
 * is atomic on every filesystem this runs on, which a "read then write" check
 * is not. The lock file holds the pid, so a stale one names who to look for.
 */
async function withVocabularyLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const lockFile = `${file}.lock`;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  /** Blocks until the lock file is ours, and hands back the open handle. */
  async function acquire(): Promise<FileHandle> {
    for (;;) {
      try {
        return await open(lockFile, "wx");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (Date.now() >= deadline) {
          throw new VocabularyEditError(
            `another process has been editing ${TOPICS_FILE} for over ` +
              `${LOCK_TIMEOUT_MS / 1000}s. If nothing else is running, the lock is stale: ` +
              `delete ${path.basename(lockFile)} beside it.`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
      }
    }
  }

  const handle = await acquire();
  // From here the lock is held, so every exit has to give it back. A throw
  // between `open` and this `finally` would leave a file nobody owns, and the
  // next edit would wait the full timeout and then fail on it.
  try {
    try {
      await handle.writeFile(`${process.pid}\n`, "utf8");
    } finally {
      await handle.close();
    }
    return await fn();
  } finally {
    await rm(lockFile, { force: true });
  }
}

let temporaryCounter = 0;

/**
 * Replace a file's contents in one step.
 *
 * Write then rename, so a crash mid-write leaves the old vocabulary rather
 * than half of one. The temporary name carries the pid and a counter: the lock
 * already keeps two edits apart, and a name that could collide would turn a
 * missing lock into a confusing ENOENT on the rename rather than a clean
 * last-write-wins.
 */
async function writeAtomically(file: string, text: string): Promise<void> {
  temporaryCounter += 1;
  const temporary = `${file}.${process.pid}.${temporaryCounter}.tmp`;
  await writeFile(temporary, text, "utf8");
  await rename(temporary, file);
}

/**
 * Can this mapping be made, and does it already exist?
 *
 * Separate from the write so a caller can refuse an unknown slug before it
 * creates anything. `concept add --topic` does exactly that: a note written to
 * disk and then abandoned because the topic was misspelled is a note in no
 * topic, which is the state the flag exists to prevent.
 */
export function checkMapping(
  repoRoot: string,
  topicSlug: string,
  conceptSlug: string,
): { already: boolean } {
  const entries = loadTopics({ root: repoRoot });
  const entry = entries.find((e) => e.slug === topicSlug);
  if (entry === undefined) {
    throw new VocabularyEditError(
      `no topic "${topicSlug}" in ${TOPICS_FILE}. ` +
        `Find the right slug with \`npm run --silent catalog -- search <term> --json\`, ` +
        `or list a domain's topics with \`npm run --silent catalog -- ls <domain> --json\`.`,
    );
  }
  if (entry.maps.concepts.includes(conceptSlug)) return { already: true };

  const owner = entries.find((e) => e.maps.concepts.includes(conceptSlug));
  if (owner !== undefined) {
    throw new VocabularyEditError(
      `concept "${conceptSlug}" is already mapped to topic "${owner.slug}" in ${TOPICS_FILE}. ` +
        `Each concept belongs to exactly one topic; move the mapping by hand if "${topicSlug}" ` +
        `is the right one.`,
    );
  }
  return { already: false };
}

/**
 * Add `conceptSlug` to `topicSlug`'s `maps.concepts` in `content/topics.yaml`.
 *
 * Every refusal happens before the write, and the write is checked afterwards:
 * the file is re-read through the real parser, and if the slug did not land on
 * exactly the topic that was asked for, the original text goes back and the
 * command fails. A textual edit to a structured file is only as trustworthy as
 * what confirms it, and a vocabulary quietly pointing a concept at the wrong
 * subject is the kind of wrong that surfaces months later as a missing video.
 */
export async function mapConceptToTopic(
  repoRoot: string,
  topicSlug: string,
  conceptSlug: string,
): Promise<MapConceptResult> {
  const file = path.join(repoRoot, TOPICS_FILE);

  return withVocabularyLock(file, async () => {
    // Inside the lock, deliberately. Checking outside it would read a file
    // another edit is part-way through changing.
    if (checkMapping(repoRoot, topicSlug, conceptSlug).already) return { changed: false };

    const original = await readFile(file, "utf8");
    const updated = addConceptToTopic(original, topicSlug, conceptSlug);
    await writeAtomically(file, updated);

    try {
      const vocabulary = await loadVocabulary(repoRoot);
      const landed = vocabulary.byConcept.get(conceptSlug);
      if (landed !== topicSlug) {
        throw new VocabularyEditError(
          `editing ${TOPICS_FILE} put "${conceptSlug}" under ` +
            `${landed === undefined ? "no topic" : `"${landed}"`} rather than "${topicSlug}". ` +
            `The file has been left as it was; add the mapping by hand.`,
        );
      }
    } catch (error) {
      await writeAtomically(file, original);
      throw error;
    }

    return { changed: true };
  });
}
