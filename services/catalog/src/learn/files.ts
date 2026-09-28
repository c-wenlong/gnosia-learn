import fs from "node:fs/promises";
import path from "node:path";

import {
  parseFrontmatter,
  stringifyFrontmatter,
} from "../../../../scripts/learn/lib/markdown.mjs";
import { sha256 } from "../content/layout";
import { readContentSources } from "../content/ownership";
import {
  assertFrontmatter,
  commitNoteText as commitRows,
  noteRevision,
  noteText,
  readNoteRows,
  writeNoteRow,
  type NoteRow,
} from "../content/note-rows";
import { CLI_OWNER, cliScope } from "../content/scope";
import { ContentWriteError } from "../content/write";
import { writeThrough } from "../content/write-through";
import { NOTE_KEYS, type NoteFields } from "../content/notes";
import { appendLog, listLogIds, logPath } from "../content/session-logs";
import type { CatalogDatabase } from "../db";
import { sqlstate } from "../state/errors";
import { allDirs, conceptsDir, LEARN_ROOT_ENV, namedTree, rel, repoRoot, sessionsDir } from "./paths";

/**
 * Concept notes and session logs, for the `learn` CLI: the file half of the
 * old `scripts/learn/lib/store.mjs`, and since Track C of
 * docs/CONTENT-MIGRATION.md the same functions over rows.
 *
 * **Which one answers is the `content_source` row's call** (D18). While a
 * type is on files (no row, or `files`) every function here reads and writes
 * `learn/` exactly as it always has. Once `catalog flip concepts` or
 * `catalog flip sessions` says `db`, the same calls read and write rows through
 * the seam and no file under `learn/` is touched. The signatures do not
 * change, so the CLI does not branch; what the row side adds (a reason for
 * the revision, the session that made it) rides in the options.
 *
 * `bindCatalog` hands this module the CLI's lazily opened connection. Without
 * one (a test of the file half) everything is files. With one, a writer that
 * cannot reach the database refuses rather than guessing which side owns the
 * type: that is the offline change the plan accepts (`concept add`,
 * `check add` and `session log` need the database now). A reader falls back to
 * the files, as `selectSource` does, so `doctor` can still say what is wrong.
 */

type CatalogGetter = () => Promise<CatalogDatabase>;

let catalog: CatalogGetter | null = null;
let owned: Promise<ReadonlySet<string>> | null = null;

/** Bind the connection the row side uses, or unbind it with null. */
export function bindCatalog(get: CatalogGetter | null): void {
  catalog = get;
  owned = null;
}

/** The types the database owns, read once per process. A database before 0010 owns none. */
async function ownedTypes(db: CatalogDatabase): Promise<ReadonlySet<string>> {
  owned ??= readContentSources(db).then(
    (rows) => new Set([...rows.values()].filter((row) => row.source === "db").map((row) => row.type)),
    (error: unknown) => {
      owned = null;
      // `content_source` does not exist before migration 0010: nothing is flipped there.
      if (sqlstate(error) === "42P01") return new Set<string>();
      throw error;
    },
  );
  return owned;
}

/**
 * The connection that owns `type`, or null when the type is on files.
 * `write` says what an unreachable database means: a writer refuses, a
 * reader reads the files.
 */
async function ownerOf(
  type: "concepts" | "sessions" | "courses",
  write: boolean,
): Promise<{ db: CatalogDatabase | null; unreachable: unknown }> {
  if (catalog === null) return { db: null, unreachable: null };
  try {
    const db = await catalog();
    return { db: (await ownedTypes(db)).has(type) ? db : null, unreachable: null };
  } catch (error) {
    if (write) throw error;
    return { db: null, unreachable: error };
  }
}

/**
 * The connection to read or write `type` through, or null for the files of
 * the tree `LEARN_ROOT` names. With no tree named there are no files: the
 * repository has held none since the cut-over, and reading an absent folder
 * would answer "no notes" when the truth is a database that is down or has
 * not flipped the type. That is refused, saying which.
 */
async function rowsFor(type: "concepts" | "sessions" | "courses", write: boolean): Promise<CatalogDatabase | null> {
  const { db, unreachable } = await ownerOf(type, write);
  if (db !== null || namedTree() !== null) return db;
  if (unreachable !== null) {
    const message = unreachable instanceof Error ? unreachable.message : String(unreachable);
    throw new FilesGoneError(
      `the catalog database could not be read (${message}), and ${type} are rows in it: the repository has had ` +
        `no files for them since the cut-over. Start Postgres, or point DATABASE_URL at the catalog.`,
    );
  }
  throw new FilesGoneError(
    `this database does not own ${type} (no content_source row says db), and the repository has had no ` +
      `files for them since the cut-over. Import a tree and flip the type (\`npm run catalog -- import <dir>\`, ` +
      `then \`npm run catalog -- flip ${type}\`), or set ${LEARN_ROOT_ENV} to a tree to work on its files.`,
  );
}

/** A files read or write with no tree of files to go to. */
export class FilesGoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FilesGoneError";
  }
}

/**
 * Whether the database owns `type`, for a command that says so in its output
 * or picks its path by it. `courses` is asked by `concept add --item`, whose
 * listing goes through the course writer once the database owns courses.
 */
export async function ownedByDatabase(type: "concepts" | "sessions" | "courses"): Promise<boolean> {
  return (await ownerOf(type, true)).db !== null;
}

export interface ConceptNote {
  id: string;
  title?: string;
  summary?: string;
  requires?: unknown;
  assumes?: unknown;
  tags?: unknown;
  topics?: unknown;
  sources?: unknown;
  created?: string;
  /** The folder the note sits in. Read from the path, never from frontmatter. */
  domain: string | null;
  body: string;
  path: string;
  [key: string]: unknown;
}

/** A row as the note object a file read gives, keys as the rendered note writes them. */
function noteFromRow(row: NoteRow): ConceptNote {
  return {
    id: row.slug,
    title: row.title,
    ...(row.summary !== null ? { summary: row.summary } : {}),
    requires: row.requires,
    ...(row.assumes.length > 0 ? { assumes: row.assumes } : {}),
    tags: row.tags,
    sources: row.sources,
    ...(row.created !== null ? { created: row.created.toISOString() } : {}),
    domain: row.domain,
    body: row.body ?? "",
    path: path.join(repoRoot(), row.path),
  };
}

/** The folders of a named tree (`LEARN_ROOT`); never the repository's, which the cut-over removed. */
export async function ensureDirs(): Promise<void> {
  if (namedTree() === null) return;
  for (const dir of allDirs()) await fs.mkdir(dir, { recursive: true });
}

/**
 * Concepts live one folder deep, grouped by domain:
 *
 *   concepts/algorithms/big-o-witness-definition.md
 *
 * The folder is presentation only. **The id stays the bare slug**, because ids
 * appear in every `requires:` edge, every `[[wikilink]]`, and now in
 * `event.concept_slug`, `mastery.concept_slug` and `review.concept_slug`.
 * Folding the folder into the id would break all of them, and moving a note
 * between domains would orphan its history — which, now that the history is a
 * foreign key, would be a constraint error rather than a silent loss.
 */
interface Scan {
  index: Map<string, { file: string; domain: string | null }>;
  collisions: { id: string; kept: string; ignored: string }[];
}

async function scanConcepts(): Promise<Scan> {
  const index = new Map<string, { file: string; domain: string | null }>();
  const collisions: Scan["collisions"] = [];

  async function scanDir(dir: string, domain: string | null): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      // One level only. Deeper nesting is a filing system, not a shelf.
      if (entry.isDirectory() && domain === null && !entry.name.startsWith(".")) {
        await scanDir(full, entry.name);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

      const id = entry.name.replace(/\.md$/, "");
      const existing = index.get(id);
      if (existing !== undefined) {
        collisions.push({ id, kept: existing.file, ignored: full });
        continue;
      }
      index.set(id, { file: full, domain });
    }
  }

  await scanDir(conceptsDir(), null);
  return { index, collisions };
}

/** Where a concept file lives, or where a new one should go. */
export async function conceptPath(id: string, domain?: string | null): Promise<string> {
  if (domain !== undefined) {
    return domain !== null && domain !== ""
      ? path.join(conceptsDir(), domain, `${id}.md`)
      : path.join(conceptsDir(), `${id}.md`);
  }
  const { index } = await scanConcepts();
  return index.get(id)?.file ?? path.join(conceptsDir(), `${id}.md`);
}

/**
 * Filenames must be unique across domains, since the id is the filename and
 * Obsidian resolves `[[wikilinks]]` the same way. Reported by `doctor`.
 */
export async function conceptCollisions(): Promise<Scan["collisions"]> {
  // Rows cannot collide: the slug is the primary key.
  if ((await rowsFor("concepts", false)) !== null) return [];
  return (await scanConcepts()).collisions;
}

async function readConceptAt(
  id: string,
  file: string,
  domain: string | null,
): Promise<ConceptNote | null> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const { data, body } = parseFrontmatter(raw) as {
      data: Record<string, unknown>;
      body: string;
    };
    return { ...data, id, domain, body, path: file };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function readConcept(id: string): Promise<ConceptNote | null> {
  const db = await rowsFor("concepts", false);
  if (db !== null) {
    const [row] = await readNoteRows(db, [id], cliScope().readable);
    return row === undefined ? null : noteFromRow(row);
  }
  const { index } = await scanConcepts();
  const entry = index.get(id);
  if (entry === undefined) return null;
  return readConceptAt(id, entry.file, entry.domain);
}

/** A note and the revision it was read at, for a writer that changes what it read. */
export interface ConceptRead {
  note: ConceptNote;
  /** The concept's latest revision in the same snapshot as `note`; null on files, and for a note with none. */
  base: number | null;
}

/**
 * `readConcept`, with the revision the note was read at. On rows both come
 * from one snapshot: read apart, a commit landing between them would pair old
 * fields with the new revision, and a write of those fields would pass the
 * base check and undo the commit.
 */
export async function readConceptForWrite(id: string): Promise<ConceptRead | null> {
  const db = await rowsFor("concepts", true);
  if (db === null) {
    const note = await readConcept(id);
    return note === null ? null : { note, base: null };
  }
  return db.transaction(
    async (tx) => {
      const [row] = await readNoteRows(tx, [id], cliScope().readable);
      return row === undefined ? null : { note: noteFromRow(row), base: await noteRevision(tx, id) };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/**
 * Read a note, change it, write it back against the revision it was read at.
 * `change` returns the note to write, or null to write nothing. A commit that
 * lands between the read and the write refuses the write with
 * `MovedBaseError` (edge case 16), and with `attempts` above one the note is
 * read again and `change` applied to what is there now: right for a change
 * that is the same whatever the note holds (an appended check, a link back to
 * a session), wrong for one that replaces what the caller saw, which keeps
 * the default of one and refuses. Null when there is no such note.
 */
export async function updateConcept(
  id: string,
  change: (
    note: ConceptNote,
  ) => (Record<string, unknown> & { id: string }) | null | Promise<(Record<string, unknown> & { id: string }) | null>,
  options: Omit<WriteOptions, "base"> & { attempts?: number },
): Promise<{ written: Written | null; note: ConceptNote } | null> {
  const attempts = Math.max(1, options.attempts ?? 1);
  for (let attempt = 1; ; attempt += 1) {
    const read = await readConceptForWrite(id);
    if (read === null) return null;
    const next = await change(read.note);
    if (next === null) return { written: null, note: read.note };
    try {
      return { written: await writeConceptNote(next, { ...options, base: read.base }), note: read.note };
    } catch (error) {
      if (!(error instanceof MovedBaseError) || attempt >= attempts) throw error;
    }
  }
}

export async function listConcepts(): Promise<ConceptNote[]> {
  const db = await rowsFor("concepts", false);
  if (db !== null) {
    return (await readNoteRows(db, undefined, cliScope().readable)).map(noteFromRow).sort((a, b) => a.id.localeCompare(b.id));
  }
  const { index } = await scanConcepts();
  const concepts: ConceptNote[] = [];
  for (const [id, { file, domain }] of [...index].sort((a, b) => a[0].localeCompare(b[0]))) {
    const note = await readConceptAt(id, file, domain);
    if (note !== null) concepts.push(note);
  }
  return concepts;
}

/** Every domain folder currently in use, with its concept count. */
export async function listDomains(): Promise<{ domain: string | null; count: number }[]> {
  const db = await rowsFor("concepts", false);
  const domains =
    db !== null
      ? (await readNoteRows(db, undefined, cliScope().readable)).map((row) => ({ domain: row.domain }))
      : [...(await scanConcepts()).index.values()];
  const counts = new Map<string, number>();
  for (const { domain } of domains) {
    const key = domain ?? "";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([domain, count]) => ({ domain: domain || null, count }));
}

/** Keys that are derived, not frontmatter, and must never be serialised. */
const NON_FRONTMATTER = new Set(["body", "path", "id", "domain"]);

export interface WriteOptions {
  /** The folder to file the note under. On files it moves the note; on rows a new note needs it and a move is refused. */
  domain?: string | null;
  /** The topic a new note is filed under, on rows (`concept.topic_slug`). */
  topic?: string;
  /** The revision's reason, on rows. */
  reason?: string;
  /**
   * On rows, the revision the note was read at (`readConceptForWrite`), or
   * null for a note that has none yet; a note that moved since is refused
   * with `MovedBaseError`. Ignored on files.
   */
  base: number | null;
  /** The tutoring session the write came from, on rows. */
  session?: string;
}

/** What `writeConcept` wrote. `revision` is null on files, where there is none. */
export interface Written {
  path: string;
  revision: number | null;
  changed: boolean;
  /** sha256 of the note as written: the file's bytes, or the text its revision renders. */
  hash: string;
}

/**
 * The note object `writeConcept` takes, as the fields a row holds. Refuses a
 * key no column holds rather than dropping it on the way in.
 */
function fieldsOf(note: Record<string, unknown> & { id: string }): NoteFields {
  const extra = Object.keys(note).filter(
    (key) => !(NOTE_KEYS as readonly string[]).includes(key) && !NON_FRONTMATTER.has(key),
  );
  if (extra.length > 0) {
    throw new Error(`${note.id}: ${extra.join(", ")} ${extra.length === 1 ? "has" : "have"} no column in the catalog`);
  }
  const text = (value: unknown) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);
  const list = (value: unknown) =>
    (Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value])
      .map((item) => String(item).trim())
      .filter((item) => item !== "");
  const created = text(note["created"]);
  if (created !== null && Number.isNaN(new Date(created).getTime())) {
    throw new Error(`${note.id}: created "${created}" is not a date`);
  }
  return {
    slug: note.id,
    title: text(note["title"]) ?? note.id,
    summary: text(note["summary"]),
    requires: list(note["requires"]),
    assumes: list(note["assumes"]),
    tags: list(note["tags"]),
    sources: list(note["sources"]),
    created: created === null ? null : new Date(created),
    body: typeof note["body"] === "string" ? note["body"] : "",
  };
}

/**
 * Write a concept, as a file or as rows. Returns the note's path (absolute,
 * logical on rows, D11). Passing `domain` moves a file; omitting it keeps the
 * note wherever it already lives.
 */
export async function writeConcept(
  note: Record<string, unknown> & { id: string },
  options: WriteOptions,
): Promise<string> {
  return (await writeConceptNote(note, options)).path;
}

/** `writeConcept`, saying which revision it wrote and whether anything changed. */
export async function writeConceptNote(
  note: Record<string, unknown> & { id: string },
  options: WriteOptions,
): Promise<Written> {
  const db = await rowsFor("concepts", true);
  if (db !== null) {
    const input = {
      fields: fieldsOf(note),
      ...(options.domain !== undefined ? { domain: options.domain } : {}),
      ...(options.topic !== undefined ? { topicSlug: options.topic } : {}),
      base: options.base,
      reason: options.reason ?? `learn: write ${note.id}`,
      sessionId: options.session,
    };
    // A new note joins its topic's `maps.concepts`, which is in
    // content/topics.yaml, so that file is rewritten from the rows in the
    // same transaction (D17, `writeThrough`). An existing note keeps its
    // topic, and nothing in topics.yaml moves.
    const isNew = (await readNoteRows(db, [note.id], cliScope().readable)).length === 0;
    try {
      const written = isNew
        ? (await writeThrough(db, ["topics"], (tx) => writeNoteRow(tx, input))).value
        : await writeNoteRow(db, input);
      return {
        path: path.join(repoRoot(), written.path),
        revision: written.revision,
        changed: written.changed,
        hash: written.hash,
      };
    } catch (error) {
      if (error instanceof ContentWriteError && error.code === "stale-base") throw new MovedBaseError(error.message);
      throw error;
    }
  }
  const file = await writeConceptFile(note, options);
  return { path: file, revision: null, changed: true, hash: sha256(await fs.readFile(file, "utf8")) };
}

async function writeConceptFile(
  note: Record<string, unknown> & { id: string },
  options: { domain?: string | null } = {},
): Promise<string> {
  const body = typeof note.body === "string" ? note.body : "";
  const id = note.id;
  const data = Object.fromEntries(
    Object.entries(note).filter(([key]) => !NON_FRONTMATTER.has(key)),
  );

  const { index } = await scanConcepts();
  const existing = index.get(id);
  const domain =
    options.domain !== undefined ? options.domain : (existing?.domain ?? null);

  const file = await conceptPath(id, domain);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, stringifyFrontmatter({ id, ...data }, body), "utf8");

  // A move leaves the old file behind unless it is cleared explicitly.
  if (existing !== undefined && existing.file !== file) {
    await fs.rm(existing.file, { force: true });
  }
  return file;
}

/* ------------------------------------------------------------------ sessions */

export function sessionPath(id: string): string {
  return path.join(sessionsDir(), `${id}.md`);
}

export async function listSessions(): Promise<string[]> {
  const db = await rowsFor("sessions", false);
  if (db !== null) return (await listLogIds(db, CLI_OWNER)).map((id) => `${id}.md`);
  try {
    const files = await fs.readdir(sessionsDir());
    return files.filter((f) => f.endsWith(".md")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/**
 * Append markdown to a session log. This is the "MD log" primitive: the agent
 * narrates into a file the learner can keep open in Obsidian while the session
 * runs.
 */
export async function appendSession(
  id: string,
  markdown: string,
  options: { reason?: string } = {},
): Promise<string> {
  const chunk = `${markdown.replace(/\s+$/, "")}\n\n`;
  const db = await rowsFor("sessions", true);
  if (db !== null) {
    await appendLog(db, id, chunk, { reason: options.reason ?? `learn: append to the log of ${id}` });
    return path.join(repoRoot(), logPath(id));
  }
  const file = sessionPath(id);
  await fs.mkdir(sessionsDir(), { recursive: true });
  await fs.appendFile(file, chunk, "utf8");
  return file;
}

/**
 * Open a log with the header `session start` writes, unless it already has
 * one. As a file, the header is written only when there is no file; as rows,
 * it is the first entry, written only when there is none.
 */
export async function startSessionLog(id: string, header: string): Promise<string> {
  const db = await rowsFor("sessions", true);
  if (db !== null) {
    await appendLog(db, id, header, { reason: `learn session start ${id}` }, { ifEmpty: true });
    return path.join(repoRoot(), logPath(id));
  }
  await fs.mkdir(sessionsDir(), { recursive: true });
  const file = sessionPath(id);
  const existing = await fs.readFile(file, "utf8").catch(() => null);
  if (existing === null) await fs.writeFile(file, header, "utf8");
  return file;
}

/* ------------------------------------------------------------ note checkout */

/** A note's whole text as a checkout copies it, and what the copy is based on. */
export interface NoteSnapshot {
  text: string;
  /** The concept's revision on rows; null on files, where `hash` is the base. */
  revision: number | null;
  /** sha256 of the note file on files; of `text` on rows. */
  hash: string;
  owner: "files" | "db";
}

export async function readNoteText(id: string): Promise<NoteSnapshot | null> {
  const db = await rowsFor("concepts", true);
  if (db !== null) {
    const found = await noteText(db, id, cliScope().readable);
    return found === null ? null : { text: found.text, revision: found.revision, hash: sha256(found.text), owner: "db" };
  }
  const note = await readConcept(id);
  if (note === null) return null;
  const text = await fs.readFile(note.path, "utf8");
  return { text, revision: null, hash: sha256(text), owner: "files" };
}

/** A commit refused because the note moved past the checkout's base (edge case 16). */
export class MovedBaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MovedBaseError";
  }
}

/**
 * Write back a note's whole text against the base it was read at. On rows,
 * through the seam, which refuses a moved revision. On files, the note file is
 * replaced only while it still hashes to the base, so an edit made to it since
 * the checkout is not overwritten.
 */
export async function commitNoteText(
  id: string,
  text: string,
  base: Pick<NoteSnapshot, "revision" | "hash" | "owner">,
  options: { reason: string; session?: string; where?: string },
): Promise<Written> {
  // Before either branch: the file branch below would otherwise substitute
  // the id a damaged block lost and write the note without its frontmatter.
  assertFrontmatter(text, options.where ?? `the text of "${id}"`);
  const db = await rowsFor("concepts", true);
  const owner = db === null ? "files" : "db";
  if (owner !== base.owner) {
    throw new MovedBaseError(
      `${id} was checked out while the notes were ${base.owner === "db" ? "rows" : "files"}, and they are ` +
        `${owner === "db" ? "rows" : "files"} now. Check it out again and reapply the edit.`,
    );
  }
  if (db !== null) {
    try {
      const written = await commitRows(db, id, text, {
        base: base.revision,
        reason: options.reason,
        sessionId: options.session,
        ...(options.where === undefined ? {} : { where: options.where }),
      });
      return {
        path: path.join(repoRoot(), written.path),
        revision: written.revision,
        changed: written.changed,
        hash: written.hash,
      };
    } catch (error) {
      if (error instanceof ContentWriteError && error.code === "stale-base") throw new MovedBaseError(error.message);
      throw error;
    }
  }
  const note = await readConcept(id);
  if (note === null) throw new MovedBaseError(`${id} no longer exists as a note under ${rel(conceptsDir())}`);
  const current = await fs.readFile(note.path, "utf8");
  if (sha256(current) !== base.hash) {
    throw new MovedBaseError(
      `${rel(note.path)} has changed since it was checked out. Check it out again and reapply the edit; ` +
        `nothing was merged.`,
    );
  }
  const declared = parseFrontmatter(text) as { data: Record<string, unknown> };
  const declaredId = typeof declared.data["id"] === "string" ? declared.data["id"] : id;
  if (declaredId !== id) {
    throw new Error(`the checkout of "${id}" now says id: ${declaredId}; a note cannot be renamed by editing it`);
  }
  if (current === text) return { path: note.path, revision: null, changed: false, hash: sha256(text) };
  await fs.writeFile(note.path, text, "utf8");
  return { path: note.path, revision: null, changed: true, hash: sha256(text) };
}

