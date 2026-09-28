import { readFile } from "node:fs/promises";
import path from "node:path";

import { ContentError, COURSES_DIR, loadCourses } from "@self-learn/content";

import { withFileLock, writeAtomically } from "./file-lock";

/**
 * Listing one concept id on one curriculum item's `concepts:` in the course
 * file, without rewriting the file.
 *
 * The same shape the vocabulary splice had, for the same reason: a course file
 * is hand-written, with comments and a reading order, and a parse-mutate-
 * stringify round trip would turn "one concept joined one row" into a diff of
 * the whole file. So the edit is textual and the result is checked by the real
 * reader before it is kept.
 *
 * This is the other half of `concept add --topic`. The topic mapping makes a
 * note indexable; the item listing puts it on a course path, which is where a
 * learner meets it (docs/proposals/course-items-declare-concepts.md).
 */

/** A line-level failure that names the file and what it could not find. */
export class CourseEditError extends Error {}

/** `- id: foo`, at any indentation, with an optional trailing comment. */
const ROW = /^(\s*)-\s+id:\s*(?:"([^"]*)"|'([^']*)'|([^#\s]+))\s*(?:#.*)?$/;

/** `key:` with an optional inline value, at any indentation. */
const KEY = /^(\s*)([A-Za-z_][\w-]*):(.*)$/;

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function isBlank(line: string): boolean {
  return line.trim() === "" || line.trim().startsWith("#");
}

/**
 * The half-open line range `[start, end)` of the list entry whose `id:` is
 * `itemId`, and the indent of its dash. Modules are list entries with an
 * `id:` too, so a module id finds its module; the caller passes an item id.
 */
function rowRange(lines: string[], itemId: string): { start: number; end: number; indent: number } {
  let start = -1;
  let indent = 0;
  for (const [i, line] of lines.entries()) {
    const match = ROW.exec(line);
    if (match === null) continue;
    const found = match[2] ?? match[3] ?? match[4];
    if (found !== itemId) continue;
    if (start !== -1) {
      throw new CourseEditError(`id "${itemId}" appears twice, on lines ${start + 1} and ${i + 1}`);
    }
    start = i;
    indent = (match[1] ?? "").length;
  }
  if (start === -1) throw new CourseEditError(`no list entry with id "${itemId}"`);

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] as string;
    if (isBlank(line)) continue;
    if (indentOf(line) <= indent) {
      end = i;
      break;
    }
  }
  while (end > start + 1 && isBlank(lines[end - 1] as string)) end -= 1;
  return { start, end, indent };
}

/** The line of `key:` at exactly `indent` within `[start, end)`, or -1. */
function keyLine(lines: string[], start: number, end: number, indent: number, key: string): number {
  for (let i = start; i < end; i += 1) {
    const match = KEY.exec(lines[i] as string);
    if (match !== null && (match[1] ?? "").length === indent && match[2] === key) return i;
  }
  return -1;
}

/**
 * A flow list `[a, b]` starting on line `at`, which may close on a later line
 * within `[at, end)`: the items, the line the `]` is on, and its trailing
 * comment. Null when it never closes.
 */
function flowList(
  lines: string[],
  at: number,
  end: number,
): { items: string[]; closeLine: number; comment: string } | null {
  const first = lines[at] as string;
  let text = first.slice(first.indexOf("[") + 1);
  for (let i = at; i < end; i += 1) {
    const line = i === at ? text : (lines[i] as string);
    const close = line.indexOf("]");
    if (close === -1) {
      if (i > at) text += `\n${line}`;
      continue;
    }
    const body = i === at ? line.slice(0, close) : `${text}\n${line.slice(0, close)}`;
    // Comments are not items, whichever line they sit on.
    const items = body
      .split("\n")
      .map((l) => l.replace(/\s+#.*$/, "").replace(/^\s*#.*$/, ""))
      .join("\n")
      .split(/[,\n]/)
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter((s) => s !== "");
    return { items, closeLine: i, comment: line.slice(close + 1).trim() };
  }
  return null;
}

/**
 * The course file text with `conceptId` appended to `itemId`'s `concepts:`.
 *
 * Idempotent: an id already listed leaves the text unchanged. The flow form
 * (`concepts: [a, b]`), the block form (`- a` on its own lines, which is what
 * the files use) and a row with no `concepts:` key at all are handled; the
 * key is added after `title:` in that last case, where the files put it.
 */
export function addConceptToItem(text: string, itemId: string, conceptId: string): string {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const row = rowRange(lines, itemId);
  const propertyIndent = row.indent + 2;
  const pad = " ".repeat(propertyIndent);

  const concepts = keyLine(lines, row.start + 1, row.end, propertyIndent, "concepts");
  if (concepts === -1) {
    const title = keyLine(lines, row.start + 1, row.end, propertyIndent, "title");
    const at = title === -1 ? row.start + 1 : title + 1;
    lines.splice(at, 0, `${pad}concepts: [${conceptId}]`);
    return lines.join(newline);
  }

  const line = lines[concepts] as string;
  const value = (KEY.exec(line)?.[3] ?? "").trim();

  if (value.startsWith("[")) {
    const flow = flowList(lines, concepts, row.end);
    if (flow === null) {
      throw new CourseEditError(`item "${itemId}" has a concepts list that never closes`);
    }
    if (flow.items.includes(conceptId)) return text;
    const trailer = flow.comment === "" ? "" : `  ${flow.comment}`;
    if (flow.closeLine === concepts) {
      lines[concepts] = `${pad}concepts: [${[...flow.items, conceptId].join(", ")}]${trailer}`;
      return lines.join(newline);
    }
    // Spread over several lines. The new id joins the last item's line, or
    // the closing line when the bracket shares it with an item, so every line
    // an author wrote stays as they wrote it.
    const closing = lines[flow.closeLine] as string;
    const head = closing.slice(0, closing.indexOf("]")).replace(/\s+$/, "");
    if (head.trim() !== "") {
      // `delta]` or `delta,]`: one separator either way.
      lines[flow.closeLine] = `${head.replace(/,$/, "")}, ${conceptId}]${trailer}`;
      return lines.join(newline);
    }
    let last = flow.closeLine - 1;
    while (last > concepts && isBlank(lines[last] as string)) last -= 1;
    if (last === concepts) {
      // `[` alone on the key's line and `]` alone on the next: nothing between.
      lines[concepts] = `${line.replace(/\s+$/, "")}${conceptId}`;
      return lines.join(newline);
    }
    // The last item's line, which may carry its own `# comment`: the new id
    // goes ahead of that, or it would be part of the comment.
    const itemLine = lines[last] as string;
    const comment = /\s+#/.exec(itemLine);
    const code = (comment === null ? itemLine : itemLine.slice(0, comment.index)).replace(/\s+$/, "");
    const rest = comment === null ? "" : itemLine.slice(comment.index);
    lines[last] = `${code.replace(/,$/, "")}, ${conceptId}${rest}`;
    return lines.join(newline);
  }

  if (value !== "" && !value.startsWith("#")) {
    throw new CourseEditError(
      `item "${itemId}" has a concepts: that is neither a flow list nor a block list; edit it by hand`,
    );
  }

  let last = -1;
  let itemIndent = propertyIndent + 2;
  for (let i = concepts + 1; i < row.end; i += 1) {
    const candidate = lines[i] as string;
    if (isBlank(candidate)) continue;
    const indent = indentOf(candidate);
    if (indent <= propertyIndent) break;
    const item = candidate.trimStart();
    if (!item.startsWith("- ")) break;
    if (item.slice(2).trim().replace(/^["']|["']$/g, "") === conceptId) return text;
    last = i;
    itemIndent = indent;
  }
  if (last === -1) {
    // `concepts:` with nothing under it, which the reader refuses. Filling it
    // is the smaller change; the inline comment, if any, stays.
    const comment = value === "" ? "" : `  ${value}`;
    lines[concepts] = `${pad}concepts: [${conceptId}]${comment}`;
    return lines.join(newline);
  }
  lines.splice(last + 1, 0, `${" ".repeat(itemIndent)}- ${conceptId}`);
  return lines.join(newline);
}

export interface ItemCheck {
  /** The course the row is in. */
  course: string;
  /** Repo-relative path of the course file the row is in. */
  file: string;
  /** The vocabulary topic of the row's module, which the concept must be mapped to. */
  moduleTopic: string;
  /** True when the row already lists the concept. */
  already: boolean;
}

/**
 * Which file holds this row, what topic its module names, and whether the
 * concept is already on it. Separate from the write so `concept add` can
 * refuse an unknown row before it creates a note.
 */
export function checkItem(repoRoot: string, itemId: string, conceptId: string): ItemCheck {
  for (const course of loadCourses({ root: repoRoot })) {
    for (const mod of course.modules) {
      const row = mod.topics.find((t) => t.id === itemId);
      if (row === undefined) continue;
      return {
        course: course.id,
        file: path.posix.join(COURSES_DIR, `${course.code.toLowerCase()}.yaml`),
        moduleTopic: mod.topic,
        already: row.concepts.includes(conceptId),
      };
    }
  }
  throw new CourseEditError(
    `no curriculum item "${itemId}" in ${COURSES_DIR}. Item ids are the \`topics[].id\` ` +
      `values in a course file, e.g. cp4284-m1-t1.`,
  );
}

/**
 * List `conceptId` on `itemId` in its course file, under a lock, and check
 * the result through the real reader before keeping it. The reader is what
 * refuses a concept its module's topic does not map, so the topic mapping has
 * to be in place before this runs; `concept add` orders the two that way.
 */
export async function listConceptOnItem(
  repoRoot: string,
  itemId: string,
  conceptId: string,
): Promise<{ changed: boolean; file: string }> {
  const check = checkItem(repoRoot, itemId, conceptId);
  const file = path.join(repoRoot, check.file);

  return withFileLock(file, check.file, async () => {
    if (checkItem(repoRoot, itemId, conceptId).already) return { changed: false, file: check.file };

    const original = await readFile(file, "utf8");
    const updated = addConceptToItem(original, itemId, conceptId);
    await writeAtomically(file, updated);

    try {
      const landed = checkItem(repoRoot, itemId, conceptId);
      if (!landed.already) {
        throw new CourseEditError(
          `editing ${check.file} did not put "${conceptId}" on "${itemId}". ` +
            `The file has been left as it was; add it by hand.`,
        );
      }
    } catch (error) {
      await writeAtomically(file, original);
      if (error instanceof ContentError) {
        throw new CourseEditError(
          `${check.file} would not read back after listing "${conceptId}" on "${itemId}", ` +
            `so it has been left as it was: ${error.message}`,
        );
      }
      throw error;
    }

    return { changed: true, file: check.file };
  });
}
