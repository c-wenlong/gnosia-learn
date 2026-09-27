import path from "node:path";

import { stringifyFrontmatter } from "../../../../scripts/learn/lib/markdown.mjs";
import { parseFrontmatter, readList, readText, type Frontmatter } from "../index/frontmatter";

/**
 * A concept note as the database holds it (Track C of
 * docs/CONTENT-MIGRATION.md): the frontmatter as columns, the markdown after
 * it as `concept.body`, and the one rule that turns the two back into a file.
 *
 * Three callers share this module so they cannot disagree about a note: the
 * concepts indexer reads a file into these fields, the export and the database
 * reader render the fields back into a file, and the writers behind
 * `learn concept` build the fields from a command. Parity compares a note in
 * the same normalised form, `noteParityForm`.
 *
 * **What a row can hold.** The eight keys the notes use (`id`, `title`,
 * `summary`, `requires`, `assumes`, `tags`, `sources`, `created`), and the body
 * byte for byte. What it cannot hold is the frontmatter's layout: the order of
 * the keys and whether an empty `assumes:` was written out. So the file a row
 * renders puts the keys in one order (`learn concept add`'s) and writes
 * `assumes` only when the list has something in it; the body, which is the
 * owner's writing, is never touched. On the 32 notes of 2026-09-28 that
 * reproduces 27 files byte for byte, and changes one line in each of the
 * other five (four drop an empty `assumes: []`, one has `assumes` written
 * above `tags` instead of below `created`), which is why parity compares a
 * note's fields and body rather than its frontmatter's bytes.
 *
 * A key outside the eight has no column, so a note carrying one is refused by
 * name rather than imported without it. `topics:` has its own refusal in the
 * indexer, because it means something specific.
 */

/** The frontmatter keys a note may carry, in the order a rendered note writes them. */
export const NOTE_KEYS = ["id", "title", "summary", "requires", "assumes", "tags", "sources", "created"] as const;

export interface NoteFields {
  slug: string;
  title: string;
  summary: string | null;
  requires: string[];
  assumes: string[];
  tags: string[];
  sources: string[];
  /** `created:` as an instant; null when the note does not say. */
  created: Date | null;
  /** The markdown after the frontmatter, exactly as written. */
  body: string;
}

export class NoteError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(problems.join("\n"));
    this.name = "NoteError";
  }
}

/**
 * Read a note's text into the fields a row holds. `where` names the note in a
 * refusal; `stem` is its file name without `.md`, the id when the frontmatter
 * gives none (the indexer's rule since bundle 5).
 *
 * Refuses, listing every problem at once: a key with no column, a `created`
 * that is not a date, and a title or summary the dialect cannot write back as
 * it was read (a value with an escaped quote in it grows a backslash on every
 * write, so its note would never match its own export).
 */
export function readNote(text: string, where: string, stem: string): NoteFields {
  const { data, body } = parseFrontmatter(text);
  const problems: string[] = [];
  const extra = Object.keys(data).filter((key) => !(NOTE_KEYS as readonly string[]).includes(key) && key !== "topics");
  if (extra.length > 0) {
    problems.push(
      `${where}: frontmatter ${extra.length === 1 ? "key" : "keys"} ${extra.map((k) => `"${k}"`).join(", ")} ` +
        `${extra.length === 1 ? "has" : "have"} no column in the catalog, so the database would drop ` +
        `${extra.length === 1 ? "it" : "them"}. A note carries ${NOTE_KEYS.join(", ")}; move the rest into the body.`,
    );
  }
  const slug = readText(data, "id") ?? stem;
  const createdText = readText(data, "created");
  let created: Date | null = null;
  if (createdText !== null) {
    const parsed = new Date(createdText);
    if (Number.isNaN(parsed.getTime())) {
      problems.push(`${where}: created: "${createdText}" is not a date. Write it as ${new Date(0).toISOString()} does.`);
    } else {
      created = parsed;
    }
  }
  if (problems.length > 0) throw new NoteError(problems);
  const fields: NoteFields = {
    slug,
    title: readText(data, "title") ?? slug,
    summary: readText(data, "summary"),
    requires: readList(data, "requires"),
    assumes: readList(data, "assumes"),
    tags: readList(data, "tags"),
    sources: readList(data, "sources"),
    created,
    body,
  };
  assertRenderable(fields, where);
  return fields;
}

/** The frontmatter object a row renders, in `NOTE_KEYS` order, empty `assumes` left out. */
function frontmatterOf(fields: NoteFields): Record<string, unknown> {
  const data: Record<string, unknown> = { id: fields.slug, title: fields.title };
  if (fields.summary !== null) data["summary"] = fields.summary;
  data["requires"] = fields.requires;
  if (fields.assumes.length > 0) data["assumes"] = fields.assumes;
  data["tags"] = fields.tags;
  data["sources"] = fields.sources;
  if (fields.created !== null) data["created"] = fields.created.toISOString();
  return data;
}

/** The note file a row renders: `learn concept add`'s frontmatter, then the body as stored. */
export function renderNote(fields: NoteFields): string {
  return stringifyFrontmatter(frontmatterOf(fields), fields.body) as string;
}

/**
 * Refuse fields whose rendered file would read back as something else. The
 * dialect has no escapes: a list item with a comma in it becomes two items,
 * and a quoted value keeps any backslash it was given. A row that cannot
 * survive its own export is refused at the write, not found out at parity.
 */
export function assertRenderable(fields: NoteFields, where: string): void {
  const again = readNoteFields(renderNote(fields), fields.slug);
  const problems: string[] = [];
  for (const key of ["slug", "title", "summary", "body"] as const) {
    if (again[key] !== fields[key]) {
      problems.push(`${where}: ${key === "slug" ? "id" : key} ${JSON.stringify(fields[key])} does not survive being written as frontmatter`);
    }
  }
  for (const key of ["requires", "assumes", "tags", "sources"] as const) {
    if (JSON.stringify(again[key]) !== JSON.stringify(fields[key])) {
      problems.push(
        `${where}: ${key} ${JSON.stringify(fields[key])} does not survive being written as frontmatter ` +
          `(an item may not contain a comma or be empty)`,
      );
    }
  }
  if (problems.length > 0) throw new NoteError(problems);
}

/** `readNote` without the refusals, for the round-trip check itself. */
function readNoteFields(text: string, stem: string): Omit<NoteFields, "created"> {
  const { data, body } = parseFrontmatter(text);
  const slug = readText(data, "id") ?? stem;
  return {
    slug,
    title: readText(data, "title") ?? slug,
    summary: readText(data, "summary"),
    requires: readList(data, "requires"),
    assumes: readList(data, "assumes"),
    tags: readList(data, "tags"),
    sources: readList(data, "sources"),
    body,
  };
}

/**
 * A note in the form parity compares: the fields a row holds, normalised the
 * way a row normalises them, and the body byte for byte. A key a row cannot
 * hold is kept as written, so a directory note carrying one is a mismatch
 * rather than an equal.
 */
export function noteParityForm(text: string, file: string): unknown {
  const { data } = parseFrontmatter(text);
  const fields = readNoteFields(text, path.posix.basename(file, ".md"));
  const createdText = readText(data, "created");
  const created = createdText === null ? null : new Date(createdText);
  const extra: Frontmatter = {};
  for (const [key, value] of Object.entries(data)) {
    if (!(NOTE_KEYS as readonly string[]).includes(key)) extra[key] = value;
  }
  return {
    ...fields,
    created: created === null ? null : Number.isNaN(created.getTime()) ? createdText : created.toISOString(),
    ...(Object.keys(extra).length > 0 ? { unheld: extra } : {}),
  };
}

/** `learn/concepts/<domain>/<slug>.md`, the path a new note is filed at. */
export function notePath(domain: string, slug: string): string {
  return `learn/concepts/${domain}/${slug}.md`;
}
