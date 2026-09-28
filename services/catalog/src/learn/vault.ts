import { constants as fsConstants, readFileSync, realpathSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import type { BlobStore } from "@self-learn/blob";
import { sessionLogEntry } from "@self-learn/schema";
import { sql } from "drizzle-orm";

import { openBlobStore, readBlob } from "../content/blob";
import { databaseIdentity } from "../content/import-root";
import { andOwnedBy, CLI_OWNER, cliScope } from "../content/scope";
import { commitNoteText, noteText, NoteWriteError, readNoteRows } from "../content/note-rows";
import { NoteError, readNote, renderNote } from "../content/notes";
import { sha256 } from "../content/layout";
import { readContentSources } from "../content/ownership";
import { latestRevisions } from "../content/revisions";
import { ContentWriteError } from "../content/write";
import type { CatalogDatabase } from "../db";
import { blobRoot, REPO_ROOT } from "../env";
import { sqlstate } from "../state/errors";
import { withFileLock, writeAtomically } from "./file-lock";
import { repoRoot } from "./paths";

/**
 * `learn vault pull` and `learn vault push`: the notes and the session logs
 * as a folder of markdown Obsidian opens as a vault, once the database owns
 * both (the "Vault" item of phase 2 and edge case 4 in
 * docs/CONTENT-MIGRATION.md). Not a live sync: two commands, run by hand.
 *
 * Pull writes every live note as `concepts/<domain>/<slug>.md`, as its row
 * renders it, and every log as `sessions/<id>.md`, its entries concatenated.
 * `.vault.json` records, per file, what it was based on (the note's revision,
 * or the number of entries the log had) and the sha256 of what pull wrote.
 * Push commits each note whose bytes no longer hash to that record, against
 * that base, through `commitNoteText`: the pair `learn concept checkout|commit`
 * uses, here for a whole folder at once.
 *
 * The one rule both directions keep: **nothing a person wrote is
 * overwritten.** The database side keeps every write as a revision, so it can
 * always be recovered; an unpushed edit in the vault is the only copy there
 * is. So:
 *
 * - pull never replaces a file whose hash differs from what pull last wrote.
 *   When the database moved past that file's base, its version is written
 *   beside it as `<name>.incoming.md`, and the file is listed as edited here;
 * - push commits against the recorded base, and a note that moved since is
 *   refused, not merged, with the database's version written beside it as
 *   `<name>.conflict.md`;
 * - a side copy (`.incoming` or `.conflict`) is itself replaced or removed
 *   only while it still hashes to what was written into it, since a person
 *   may merge into it rather than into the note;
 * - no file is replaced or removed unread: the old one is moved aside in one
 *   rename and judged there, and the new text goes in only where nothing is,
 *   so an edit saved while the command runs is kept, not lost.
 *
 * Settling a side copy is deleting it. The copy is the database's version at
 * a newer base; whoever deletes it says they have merged what they wanted of
 * it into the note, so the note is based on that newer version from then on,
 * and push commits it. Deleting the copy without merging does overwrite the
 * database's newer version, which is still a revision `catalog revisions`
 * lists. That is the side that keeps history; the vault is not.
 *
 * Session logs are append-only entries (D20) with no revision to commit
 * against, so the vault treats them as read-only: push refuses an edited log
 * by name, and a pull never overwrites one. Deleting the edited copy and
 * pulling puts the database's back.
 *
 * Every live diagram's SVG is pulled too, as `assets/<slug>.svg`, from the
 * blob store, so the `![[<slug>.svg]]` embeds in notes and logs resolve in
 * Obsidian once `learn/assets/` is gone. They are read-only: push never looks
 * at them, and a pull replaces one only while it is what pull last wrote. A
 * diagram is changed through the studio or `catalog diagram put`.
 */

export class VaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultError";
  }
}

/** A file a side copy was written for, and what went into the copy. */
interface Pending {
  /** Vault-relative, `concepts/<domain>/<slug>.incoming.md` or `.conflict.md`. */
  path: string;
  /** The base the copy holds: a note's revision, or a log's entry count. */
  base: number | null;
  /** sha256 of what was written into the copy. */
  hash: string;
}

/** What `.vault.json` records for one file. */
interface Entry {
  kind: "note" | "log" | "readme" | "asset";
  /** The concept slug, the session id, or the diagram slug. */
  id: string;
  /**
   * What the file is based on: a note's concept revision, a log's number of
   * entries. Null when nothing is known, for a file that was already there
   * and differed at the first pull, and after a pull from another database.
   */
  base: number | null;
  /** sha256 of what pull (or push) last left in the file. Null when it never wrote it. */
  hash: string | null;
  pending?: Pending;
}

interface Manifest {
  version: 1;
  /** `databaseIdentity`: a copy made with `createdb -T` is a different database. */
  database: string;
  pulledAt: string;
  /** Keyed by the vault-relative path, with forward slashes. */
  files: Record<string, Entry>;
}

const MANIFEST = ".vault.json";
const README = "README.md";
const SIDE_COPY = /\.(incoming|conflict)\.md$/;
/** An edit `putBack` kept beside a file it could not put back over. */
const KEPT = /\.kept-\d+(?:-\d+)?\.md$/;

const README_TEXT = `# Notes vault

This folder is a copy of the notes and session logs in the self-learn database, made by \`npm run learn -- vault pull\`, for reading and editing in Obsidian.
\`vault pull\` brings it up to date and never overwrites a file you edited: when the database moved on, its version lands beside yours as \`<name>.incoming.md\`.
\`vault push\` writes your edited notes back, one revision each; a note that changed in the database since your pull is refused, with its current version left as \`<name>.conflict.md\`.
To settle an \`.incoming\` or \`.conflict\` copy, merge what you want of it into your note, delete the copy, and push.
Session logs are a record of what happened and are read-only here: a correction belongs in the note it touched.
The diagrams under \`assets/\` are there for the embeds and are read-only too: a diagram is changed in the studio, never here.
`;

const LOG_REFUSAL =
  "is a session log, which is a record of what happened and is not edited after the fact; " +
  "a correction belongs in the note it touched. Delete this copy and run learn vault pull to put the database's back.";

/**
 * `$SELF_LEARN_HOME/vault`, else `~/.self-learn/vault`: the same data root
 * the blob store reads, resolved by the same rules (a leading `~`, and a
 * relative value refused), so one variable moves both.
 */
export function defaultVaultDir(): string {
  let blobs: string;
  try {
    blobs = blobRoot();
  } catch (error) {
    throw new VaultError((error as Error).message);
  }
  return path.join(path.dirname(blobs), "vault");
}

/**
 * The folder `--out` names, or the default. A relative path is taken from
 * where `npm run` was typed (`INIT_CWD`), not from the repository root the
 * `learn` shim runs in. A folder inside the repository is refused: notes
 * written there are untracked files in the owner's `git status`, and a vault
 * pulled into `learn/` would be read by the next `catalog import`. The same
 * goes for any other checkout of this repository (a second clone, a
 * worktree), found by its root `package.json`, since its `learn/` is just as
 * much an import tree.
 */
export function resolveVaultDir(given: string | undefined): string {
  const dir =
    given === undefined || given.trim() === ""
      ? defaultVaultDir()
      : path.resolve(process.env["INIT_CWD"] ?? process.cwd(), given);
  const roots = new Set([REPO_ROOT, repoRoot()]);
  const other = checkoutAbove(real(dir));
  if (other !== null) roots.add(other);
  for (const root of roots) {
    if (inside(real(dir), real(root))) {
      throw new VaultError(
        `${dir} is inside ${root}, a checkout of this repository. A vault lives outside every checkout: ` +
          `leave out --out for ${defaultVaultDir()}, or name a folder elsewhere.`,
      );
    }
  }
  return dir;
}

/** The root `package.json`'s name, which every checkout of this repository carries. */
const REPOSITORY_NAME = "self-learn";

/** The nearest folder at or above `dir` whose `package.json` names this repository, or null. */
function checkoutAbove(dir: string): string | null {
  for (let at = dir; ; at = path.dirname(at)) {
    try {
      const manifest = JSON.parse(readFileSync(path.join(at, "package.json"), "utf8")) as { name?: unknown };
      if (manifest.name === REPOSITORY_NAME) return at;
    } catch {
      // No package.json here, or not JSON: not a checkout, keep walking up.
    }
    if (path.dirname(at) === at) return null;
  }
}

/**
 * The path with links resolved. For a path that does not exist yet, its
 * nearest existing ancestor is resolved and the rest joined on, so a folder
 * about to be created under a linked `concepts/` resolves to where it would
 * really land.
 */
function real(target: string): string {
  const missing: string[] = [];
  let at = path.resolve(target);
  for (;;) {
    try {
      return path.join(realpathSync(at), ...missing.reverse());
    } catch {
      const parent = path.dirname(at);
      if (parent === at) return path.resolve(target);
      missing.push(path.basename(at));
      at = parent;
    }
  }
}

function inside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}


/** For a `.catch`: a file that is not plain becomes a value to report, anything else is thrown on. */
function notPlain(error: unknown): NotPlainFile {
  if (error instanceof NotPlainFile) return error;
  throw error;
}

/** A path in the vault that is not a plain file: a link, a folder, a pipe. */
class NotPlainFile extends VaultError {
  constructor(
    readonly file: string,
    why = "is not a plain file (a link, a folder or a pipe?)",
  ) {
    super(`${file} ${why}. The vault holds plain files only, in folders of its own; replace it with one.`);
    this.name = "NotPlainFile";
  }
}

/**
 * `O_NOFOLLOW` refuses a link as the last part of the path, and `O_NONBLOCK`
 * keeps the open of a pipe from waiting forever; the `fstat` after it
 * refuses anything that is not a regular file before a byte is read. The same
 * guard the blob store's reads use.
 */
const READ_PLAIN = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0) | (fsConstants.O_NONBLOCK ?? 0);

/**
 * A vault file's text, or null when there is none. Never through a link:
 * push would otherwise commit whatever file outside the vault a link in it
 * names, as a note, and pull would judge an edit by bytes that are not in it.
 */
async function readText(dir: string, file: string): Promise<string | null> {
  const bytes = await readBytes(dir, file);
  return bytes === null ? null : bytes.toString("utf8");
}

/** A vault file's bytes, by the same rules as `readText`: an SVG is judged by these. */
async function readBytes(dir: string, file: string): Promise<Buffer | null> {
  // `O_NOFOLLOW` covers the last part of the path only: a `concepts/<domain>`
  // linked elsewhere would still be followed to a file outside the vault.
  if (!inside(real(path.dirname(file)), real(dir))) throw new NotPlainFile(file, "is in a folder that resolves outside the vault");
  let handle: fs.FileHandle;
  try {
    handle = await fs.open(file, READ_PLAIN);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    // ELOOP on Linux, EMLINK on some BSDs: the last part is a link.
    if (code === "ELOOP" || code === "EMLINK" || code === "EISDIR") throw new NotPlainFile(file);
    throw error;
  }
  try {
    if (!(await handle.stat()).isFile()) throw new NotPlainFile(file);
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

/**
 * Refuse a file whose folder resolves outside the vault: a `concepts/` that
 * is a link into the repository would otherwise put notes under `learn/`,
 * where the next import reads them.
 */
function assertInVault(dir: string, file: string): void {
  if (!inside(real(path.dirname(file)), real(dir))) {
    throw new VaultError(`${file} resolves outside the vault ${dir} (a linked folder?), so nothing was written there.`);
  }
}

let asideCounter = 0;
/** A hidden name beside `file` for a moment's use, unique to this process. */
function asideOf(file: string): string {
  asideCounter += 1;
  return path.join(path.dirname(file), `.${path.basename(file)}.vault-${process.pid}-${asideCounter}`);
}

/**
 * Put `from` at `file` only if nothing is there, and consume `from`. A hard
 * link fails rather than replace, so a file saved at `file` in the meantime
 * is kept; a filesystem without hard links gets an exclusive copy instead.
 */
async function placeIfAbsent(from: string, file: string): Promise<boolean> {
  try {
    await fs.link(from, file);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") return false;
    if (code !== "EPERM" && code !== "ENOTSUP" && code !== "EXDEV") throw error;
    try {
      await fs.copyFile(from, file, fsConstants.COPYFILE_EXCL);
    } catch (copyError) {
      if ((copyError as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw copyError;
    }
  }
  await fs.rm(from, { force: true });
  return true;
}

/**
 * Move whatever is at `file` aside, in one rename, and read it there. What was
 * moved is exactly what is judged: a save landing before the rename is in the
 * bytes read, and one landing after it creates a new `file`, which
 * `placeIfAbsent` will not replace.
 */
async function takeAside(dir: string, file: string): Promise<{ aside: string; bytes: Buffer } | null> {
  const aside = asideOf(file);
  try {
    await fs.rename(file, aside);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  try {
    const bytes = await readBytes(dir, aside);
    if (bytes !== null) return { aside, bytes };
  } catch (error) {
    // Not ours to judge: it goes back where it was, and the refusal names it.
    await putBack(aside, file);
    throw error instanceof NotPlainFile ? new NotPlainFile(file) : error;
  }
  return null;
}

/**
 * Put a file taken aside back. If something new was saved at its name in the
 * meantime, both are kept: the one taken aside as `<name>.kept-<time>.md`,
 * which push refuses by name, saying which file it belongs beside, so
 * neither edit is lost.
 */
async function putBack(aside: string, file: string): Promise<void> {
  if (await placeIfAbsent(aside, file)) return;
  // Beside it under a name of its own, whatever the extension, and never over
  // anything already there: a rename would replace the save it is making room for.
  const extension = path.extname(file);
  const stem = file.slice(0, file.length - extension.length);
  for (let attempt = 0; ; attempt += 1) {
    const kept = `${stem}.kept-${Date.now()}${attempt === 0 ? "" : `-${attempt}`}${extension}`;
    if (await placeIfAbsent(aside, kept)) return;
  }
}

/**
 * Write `text` to `file` only while the file reads as expected: absent when
 * `expected` is null, else hashing to it. There is no moment where a save
 * from Obsidian can be replaced unread: the old file is moved aside in one
 * rename and judged there, put back if it is not what was expected, and the
 * new text goes in only where nothing is. Returns whether it wrote.
 */
async function replaceIfUnchanged(
  dir: string,
  file: string,
  expected: string | null,
  text: string | Buffer,
): Promise<boolean> {
  assertInVault(dir, file);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const fresh = asideOf(file);
  await fs.writeFile(fresh, text);
  try {
    if (expected === null) return await placeIfAbsent(fresh, file);
    const taken = await takeAside(dir, file);
    if (taken === null) return false;
    if (sha256(taken.bytes) !== expected) {
      await putBack(taken.aside, file);
      return false;
    }
    const placed = await placeIfAbsent(fresh, file);
    // Unedited, so nothing of anyone's is in it. If a save took its place
    // meanwhile, that save stays and this pull wrote nothing.
    await fs.rm(taken.aside, { force: true });
    return placed;
  } finally {
    await fs.rm(fresh, { force: true });
  }
}

/** Remove `file` only while it hashes to `expected`, judged the same way. */
async function removeIfUnchanged(dir: string, file: string, expected: string): Promise<boolean> {
  assertInVault(dir, file);
  const taken = await takeAside(dir, file);
  if (taken === null) return false;
  if (sha256(taken.bytes) !== expected) {
    await putBack(taken.aside, file);
    return false;
  }
  await fs.rm(taken.aside, { force: true });
  return true;
}

/** A path segment from the database, refused if it could leave the vault. */
function segment(value: string, what: string): string {
  if (value === "" || value.startsWith(".") || /[\\/\0]/.test(value)) {
    throw new VaultError(`${what} ${JSON.stringify(value)} cannot be a file name in the vault`);
  }
  return value;
}

/**
 * A note or log's file name, refused when it would read as one of the vault's
 * own: `z.incoming` would be written as `z.incoming.md`, which the manifest
 * check takes for a side copy, and every later command would refuse the whole
 * manifest.
 */
function fileName(value: string, what: string): string {
  if (SIDE_COPY.test(`${value}.md`) || KEPT.test(`${value}.md`)) {
    throw new VaultError(
      `${what} ${JSON.stringify(value)} would be named like a copy the vault writes beside a file, so it was left out of the vault`,
    );
  }
  return segment(value, what);
}

/** The side copy's vault-relative path: `x.md` beside `x.incoming.md`. */
const sidePath = (rel: string, label: "incoming" | "conflict") => rel.replace(/\.md$/, `.${label}.md`);

/* ------------------------------------------------------------ the manifest */

async function readManifest(dir: string): Promise<Manifest | null> {
  const file = path.join(dir, MANIFEST);
  const raw = await readText(dir, file);
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new VaultError(
      `${file} is not JSON (${(error as Error).message}). It records what every file in the vault was based on, ` +
        `so nothing is written without it: restore it, or pull into another folder with --out.`,
    );
  }
  const manifest = parsed as Partial<Manifest>;
  if (manifest.version !== 1 || typeof manifest.files !== "object" || manifest.files === null) {
    throw new VaultError(`${file} is not a vault manifest this version of learn can read (expected version 1).`);
  }
  // Every path in it is used to read, replace and remove files, so one that
  // is not a file pull itself would write is refused before any of that.
  const bad = Object.entries(manifest.files).filter(([rel, entry]) => !validEntry(rel, entry)).map(([rel]) => rel);
  if (bad.length > 0) {
    throw new VaultError(
      `${file} names paths pull never writes (${bad.map((rel) => JSON.stringify(rel)).join(", ")}), ` +
        `so nothing was read or written. Restore it, or pull into another folder with --out.`,
    );
  }
  return manifest as Manifest;
}

/** A path pull writes: `README.md`, `concepts/[<domain>/]<slug>.md`, `sessions/<id>.md`, `assets/<slug>.svg`. */
const MANAGED =
  /^(?:README\.md|concepts\/(?:[^/\\\0]+\/)?[^/\\\0]+\.md|sessions\/[^/\\\0]+\.md|assets\/[^/\\\0]+\.svg)$/;

function validEntry(rel: string, entry: Entry): boolean {
  if (!MANAGED.test(rel) || rel.split("/").some((part) => part.startsWith(".")) || SIDE_COPY.test(rel)) return false;
  if (typeof entry !== "object" || entry === null) return false;
  if ((entry.kind === "readme") !== (rel === README)) return false;
  if (entry.kind === "log" && !rel.startsWith("sessions/")) return false;
  if (entry.kind === "note" && !rel.startsWith("concepts/")) return false;
  if ((entry.kind === "asset") !== rel.startsWith("assets/")) return false;
  const pending = entry.pending;
  if (entry.kind === "asset") return pending === undefined;
  return pending === undefined || pending.path === sidePath(rel, "incoming") || pending.path === sidePath(rel, "conflict");
}

async function writeManifest(dir: string, manifest: Manifest): Promise<void> {
  const sorted = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  await writeAtomically(path.join(dir, MANIFEST), `${JSON.stringify({ ...manifest, files: sorted }, null, 2)}\n`);
}

/**
 * Remove a file's side copy while it still holds what was written into it,
 * and forget it. One a person wrote in is left where it is, and with no
 * record of it no later write will replace it.
 */
async function clearSide(dir: string, entry: Entry): Promise<void> {
  if (entry.pending === undefined) return;
  await removeIfUnchanged(dir, path.join(dir, entry.pending.path), entry.pending.hash);
  delete entry.pending;
}

/**
 * A side copy the person deleted has been settled. When the file differs from
 * what was last written into it, whatever they merged is based on the copy's
 * version, and the next push commits against that. When it does not (the
 * edit was undone), the base stays, and the next pull updates the file.
 */
async function settleDeletedSide(dir: string, entry: Entry, current: string | null): Promise<void> {
  if (entry.pending === undefined) return;
  if ((await readText(dir, path.join(dir, entry.pending.path))) !== null) return;
  if (current !== null && sha256(current) !== entry.hash) entry.base = entry.pending.base;
  delete entry.pending;
}

/**
 * Write the database's version beside an edited file. Refuses (returns null)
 * when a copy is already there that a person wrote in. A copy that already
 * holds exactly this text is kept as it is.
 */
async function writeSide(
  dir: string,
  entry: Entry,
  rel: string,
  label: "incoming" | "conflict",
  text: string,
  base: number | null,
): Promise<string | null> {
  const hash = sha256(text);
  // A copy already beside it with this very version (a push's `.conflict`
  // that a pull finds again, say) is left under the name the person was told.
  if (entry.pending !== undefined && entry.pending.hash === hash) {
    const there = await readText(dir, path.join(dir, entry.pending.path));
    if (there !== null && sha256(there) === hash) {
      entry.pending.base = base;
      return entry.pending.path;
    }
  }
  const side = sidePath(rel, label);
  if (entry.pending !== undefined && entry.pending.path !== side) {
    // The copy under the other name goes only if nobody wrote in it. One
    // somebody did stays the copy this file is waiting on, record and all:
    // forgetting it would leave the merge in it untracked.
    const other = path.join(dir, entry.pending.path);
    if ((await readText(dir, other)) !== null && !(await removeIfUnchanged(dir, other, entry.pending.hash))) return null;
    delete entry.pending;
  }
  const file = path.join(dir, side);
  const existing = await readText(dir, file);
  if (existing !== null && sha256(existing) === hash) {
    entry.pending = { path: side, base, hash };
    return side;
  }
  let expected: string | null = null;
  if (existing !== null) {
    if (entry.pending?.path !== side || sha256(existing) !== entry.pending.hash) return null;
    expected = entry.pending.hash;
  }
  if (!(await replaceIfUnchanged(dir, file, expected, text))) return null;
  entry.pending = { path: side, base, hash };
  return side;
}

/* ------------------------------------------------------------ the database */

/** One file the database says the vault should hold. */
interface Item {
  rel: string;
  kind: "note" | "log";
  id: string;
  text: string;
  base: number | null;
}

/** The database must own the types the vault reads, or `learn/` is still the truth. */
async function assertOwned(db: CatalogDatabase, types: readonly ("concepts" | "sessions")[]): Promise<void> {
  let rows: Awaited<ReturnType<typeof readContentSources>>;
  try {
    rows = await readContentSources(db);
  } catch (error) {
    // `content_source` does not exist before migration 0010: nothing is flipped there.
    if (sqlstate(error) !== "42P01") throw error;
    rows = new Map();
  }
  const missing = types.filter((type) => rows.get(type)?.source !== "db");
  if (missing.length === 0) return;
  throw new VaultError(
    `the vault is the database's notes and logs, and the database does not own ${missing.join(" or ")} yet ` +
      `(catalog flip ${missing.join(", catalog flip ")}). Until then the files under learn/ are the notes: ` +
      `open that folder in Obsidian as before.`,
  );
}

/**
 * Every live note, rendered as its row renders it, with its revision, and
 * every log with its entry count, in one snapshot: read apart, an append
 * landing between the text and the count would record a log as based on
 * entries it does not hold.
 */
async function readItems(db: CatalogDatabase): Promise<{ items: Item[]; problems: string[] }> {
  return db.transaction(
    async (tx) => {
      const problems: string[] = [];
      const items: Item[] = [];
      // The learner's vault (phase 4): their notes and the commons', and
      // their own sessions' logs, never another owner's.
      const notes = await readNoteRows(tx, undefined, cliScope().readable);
      const revisions = await latestRevisions(
        tx,
        "concept",
        notes.map((row) => row.slug),
      );
      for (const row of notes) {
        if (row.body === null) {
          problems.push(`concept "${row.slug}" has no body in the database, so it was left out of the vault`);
          continue;
        }
        try {
          const folder = row.domain === null || row.domain === "" ? "" : `${segment(row.domain, "the folder")}/`;
          items.push({
            rel: `concepts/${folder}${fileName(row.slug, "the concept id")}.md`,
            kind: "note",
            id: row.slug,
            text: renderNote({ ...row, body: row.body }),
            base: revisions.get(row.slug)?.id ?? null,
          });
        } catch (error) {
          if (!(error instanceof VaultError)) throw error;
          problems.push(error.message);
        }
      }
      const { rows: logs } = await tx.execute<{ id: string; markdown: string; entries: number }>(sql`
        select e.session_id as id, string_agg(e.markdown, '' order by e.seq) as markdown, count(*)::int as entries
        from ${sessionLogEntry} e join session s on s.id = e.session_id
        where s.learner_id = ${CLI_OWNER}
        group by e.session_id order by e.session_id collate "C"
      `);
      for (const log of logs) {
        try {
          items.push({
            rel: `sessions/${fileName(log.id, "the session id")}.md`,
            kind: "log",
            id: log.id,
            text: log.markdown,
            base: log.entries,
          });
        } catch (error) {
          if (!(error instanceof VaultError)) throw error;
          problems.push(error.message);
        }
      }
      return { items, problems };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/* -------------------------------------------------------------------- pull */

export interface PullReport {
  vault: string;
  notes: number;
  logs: number;
  /** Diagram SVGs under `assets/`. */
  assets: number;
  /** Created or brought up to date. */
  written: string[];
  unchanged: string[];
  /** Files edited here and not pushed, left as they are, with the database's version beside them when it moved. */
  modified: { path: string; incoming: string | null; note?: string }[];
  /** Unedited files of notes or logs the database no longer has. */
  removed: string[];
  problems: string[];
}

export async function pullVault(
  db: CatalogDatabase,
  options: { dir: string; store?: BlobStore },
): Promise<PullReport> {
  await assertOwned(db, ["concepts", "sessions"]);
  const dir = options.dir;
  await fs.mkdir(dir, { recursive: true });
  const identity = await databaseIdentity(db);
  return withFileLock(path.join(dir, MANIFEST), path.join(dir, MANIFEST), async () => {
    const manifest: Manifest = (await readManifest(dir)) ?? {
      version: 1,
      database: identity,
      pulledAt: new Date().toISOString(),
      files: {},
    };
    if (manifest.database !== identity) {
      // Another database's revisions say nothing about this one's. Every base
      // becomes unknown, which makes an edited file get the database's version
      // beside it, whatever it holds; what each file hashes to still tells an
      // edit from an unedited copy, so nothing unedited is kept stale either.
      for (const entry of Object.values(manifest.files)) {
        entry.base = null;
        if (entry.pending !== undefined) entry.pending.base = null;
      }
      manifest.database = identity;
    }

    const { items, problems } = await readItems(db);
    const svgs = await readSvgs(db, problems);
    const report: PullReport = {
      vault: dir,
      notes: items.filter((item) => item.kind === "note").length,
      logs: items.filter((item) => item.kind === "log").length,
      assets: svgs.length,
      written: [],
      unchanged: [],
      modified: [],
      removed: [],
      problems,
    };

    for (const item of items) {
      await pullItem(dir, manifest, item, report).catch((error: unknown) => {
        report.problems.push(notPlain(error).message);
      });
    }

    // A file the database no longer has goes, if unedited. Not when some rows
    // could not be read: the file of a note left out above is not gone.
    // The README first, so a problem with it is known before anything is removed.
    await pullReadme(dir, manifest, report.problems);

    // Every stale file is read before any is removed, so one that cannot be
    // read stops the removals rather than arriving halfway through them.
    const live = new Set([...items.map((item) => item.rel), ...svgs.map((svg) => svg.rel)]);
    // Read as bytes, since an SVG's recorded hash is of its bytes.
    const stale: { rel: string; entry: Entry; file: string; current: Buffer | null }[] = [];
    for (const [rel, entry] of problems.length > 0 ? [] : Object.entries(manifest.files)) {
      if (entry.kind === "readme" || live.has(rel)) continue;
      const file = path.join(dir, rel);
      const current = await readBytes(dir, file).catch(notPlain);
      if (current instanceof NotPlainFile) {
        problems.push(current.message);
        continue;
      }
      // Its side copy too: removing the file removes the copy, and a copy
      // that cannot be read would otherwise stop the run halfway through the
      // removals, with the manifest still naming what was already gone.
      if (entry.pending !== undefined) {
        const side = await readText(dir, path.join(dir, entry.pending.path)).catch(notPlain);
        if (side instanceof NotPlainFile) {
          problems.push(side.message);
          continue;
        }
      }
      stale.push({ rel, entry, file, current });
    }
    for (const { rel, entry, file, current } of problems.length > 0 ? [] : stale) {
      try {
        if (current === null) {
          await clearSide(dir, entry);
          delete manifest.files[rel];
          continue;
        }
        if (entry.hash !== null && sha256(current) === entry.hash && (await removeIfUnchanged(dir, file, entry.hash))) {
          await clearSide(dir, entry);
          delete manifest.files[rel];
          report.removed.push(rel);
          continue;
        }
      } catch (error) {
        // Replaced by a link since it was read: reported, and the entry kept,
        // so the manifest written below still says what is in the vault.
        problems.push(notPlain(error).message);
        continue;
      }
      report.modified.push({
        path: rel,
        incoming: null,
        note: `the database no longer has this ${STALE_NAME[entry.kind]}; your copy is kept`,
      });
    }

    // After the removals, so a store that cannot be read costs these SVGs
    // and not the tidying of every other file.
    let store: BlobStore | undefined = options.store;
    for (const svg of svgs) {
      await pullSvg(dir, manifest, svg, () => (store ??= openBlobStore()), report).catch((error: unknown) => {
        report.problems.push(error instanceof NotPlainFile ? error.message : `${svg.rel}: ${(error as Error).message}`);
      });
    }

    manifest.pulledAt = new Date().toISOString();
    await writeManifest(dir, manifest);
    return report;
  });
}

async function pullItem(dir: string, manifest: Manifest, item: Item, report: PullReport): Promise<void> {
  const file = path.join(dir, item.rel);
  const want = sha256(item.text);
  const known = manifest.files[item.rel];
  const current = await readText(dir, file).catch(notPlain);
  if (current instanceof NotPlainFile) {
    report.problems.push(current.message);
    return;
  }
  if (known !== undefined) await settleDeletedSide(dir, known, current);
  const clean: Entry = { kind: item.kind, id: item.id, base: item.base, hash: want };

  if (current !== null && sha256(current) === want) {
    // Already what the database holds, whoever wrote it: nothing to keep apart.
    if (known !== undefined) await clearSide(dir, known);
    manifest.files[item.rel] = clean;
    report.unchanged.push(item.rel);
    return;
  }
  // Absent, or exactly what pull last wrote: the database's version replaces it.
  const expected = current === null ? null : known?.hash === sha256(current) ? known.hash : undefined;
  if (expected !== undefined) {
    if (await replaceIfUnchanged(dir, file, expected, item.text)) {
      if (known !== undefined) await clearSide(dir, known);
      manifest.files[item.rel] = clean;
      report.written.push(item.rel);
      return;
    }
    // Saved while the pull ran. Kept, and handled as the edit it is next time.
    report.modified.push({ path: item.rel, incoming: null, note: "changed while the pull ran; pull again" });
    return;
  }

  // Edited here, or there before any pull: kept. The database's version goes
  // beside it only when it moved past the file's base, since otherwise the
  // copy would just be the text the edit started from.
  const entry: Entry = known ?? { kind: item.kind, id: item.id, base: null, hash: null };
  manifest.files[item.rel] = entry;
  const moved = entry.base === null || entry.base !== item.base;
  if (!moved) {
    report.modified.push({ path: item.rel, incoming: entry.pending?.path ?? null });
    return;
  }
  const side = await writeSide(dir, entry, item.rel, "incoming", item.text, item.base);
  report.modified.push(
    side === null
      ? {
          path: item.rel,
          incoming: null,
          note: `${sidePath(item.rel, "incoming")} holds edits of its own, so the database's newer version was not written`,
        }
      : { path: item.rel, incoming: side },
  );
}

const STALE_NAME: Record<Entry["kind"], string> = { note: "note", log: "log", readme: "file", asset: "diagram" };

/** A live diagram's SVG, as the vault holds it. */
interface Svg {
  rel: string;
  slug: string;
  key: string;
  sha256: string;
}

/** Every live diagram with an SVG in the blob store, by the key and hash its row names. */
async function readSvgs(db: CatalogDatabase, problems: string[]): Promise<Svg[]> {
  const { rows } = await db.execute<{ slug: string; key: string; sha256: string }>(sql`
    select d.slug, d.svg_blob_key as key, b.sha256
    from diagram d join blob_object b on b.key = d.svg_blob_key
    where d.archived_at is null${andOwnedBy(sql`d.owner_id`, cliScope().readable)}
    order by d.slug collate "C"
  `);
  const svgs: Svg[] = [];
  for (const row of rows) {
    try {
      svgs.push({ rel: `assets/${segment(row.slug, "the diagram slug")}.svg`, slug: row.slug, key: row.key, sha256: row.sha256 });
    } catch (error) {
      if (!(error instanceof VaultError)) throw error;
      problems.push(error.message);
    }
  }
  return svgs;
}

/**
 * One SVG, read-only: written when absent or still what pull last wrote,
 * and never over a copy somebody changed. The bytes come from the blob store
 * only when the file needs them.
 */
async function pullSvg(
  dir: string,
  manifest: Manifest,
  svg: Svg,
  store: () => BlobStore,
  report: PullReport,
): Promise<void> {
  const file = path.join(dir, svg.rel);
  const current = await readBytes(dir, file);
  const clean: Entry = { kind: "asset", id: svg.slug, base: null, hash: svg.sha256 };
  if (current !== null && sha256(current) === svg.sha256) {
    manifest.files[svg.rel] = clean;
    report.unchanged.push(svg.rel);
    return;
  }
  const known = manifest.files[svg.rel];
  const expected = current === null ? null : known?.hash === sha256(current) ? known.hash : undefined;
  if (expected === undefined) {
    manifest.files[svg.rel] = known ?? { kind: "asset", id: svg.slug, base: null, hash: null };
    report.modified.push({
      path: svg.rel,
      incoming: null,
      note: "an SVG is read-only in the vault and this one was changed here, so it is kept; delete it and pull for the database's",
    });
    return;
  }
  const bytes = await readBlob(store(), svg.key, svg.sha256);
  if (await replaceIfUnchanged(dir, file, expected, bytes)) {
    manifest.files[svg.rel] = clean;
    report.written.push(svg.rel);
    return;
  }
  report.modified.push({ path: svg.rel, incoming: null, note: "changed while the pull ran; pull again" });
}

/** The README, written like any other file: never over an edit. */
async function pullReadme(dir: string, manifest: Manifest, problems: string[]): Promise<void> {
  const file = path.join(dir, README);
  const want = sha256(README_TEXT);
  const current = await readText(dir, file).catch(notPlain);
  if (current instanceof NotPlainFile) {
    problems.push(current.message);
    return;
  }
  const known = manifest.files[README];
  if (current !== null && sha256(current) === want) {
    manifest.files[README] = { kind: "readme", id: "README", base: null, hash: want };
    return;
  }
  const expected = current === null ? null : known?.hash === sha256(current) ? known.hash : undefined;
  if (expected !== undefined && (await replaceIfUnchanged(dir, file, expected, README_TEXT))) {
    manifest.files[README] = { kind: "readme", id: "README", base: null, hash: want };
  }
}

/* -------------------------------------------------------------------- push */

export interface PushReport {
  vault: string;
  /** One concept revision each. */
  pushed: { path: string; id: string; revision: number }[];
  refused: { path: string; reason: string; conflict?: string }[];
  unchanged: string[];
}

export async function pushVault(
  db: CatalogDatabase,
  options: { dir: string; reason?: string },
): Promise<PushReport> {
  const dir = options.dir;
  const found = await readManifest(dir);
  if (found === null) {
    throw new VaultError(`${dir} has no ${MANIFEST}, so it is not a vault learn pulled. Run: learn vault pull`);
  }
  await assertOwned(db, ["concepts"]);
  const identity = await databaseIdentity(db);
  return withFileLock(path.join(dir, MANIFEST), path.join(dir, MANIFEST), async () => {
    // Read again under the lock: a pull that finished while this waited wrote a newer one.
    const manifest = (await readManifest(dir)) ?? found;
    if (manifest.database !== identity) {
      throw new VaultError(
        `${dir} was pulled from the database ${manifest.database}, and this is ${identity}. Its bases mean ` +
          `nothing here, so nothing was pushed. Run learn vault pull first: your edits are kept, with this ` +
          `database's version beside each.`,
      );
    }
    const before = JSON.stringify(manifest);
    const report: PushReport = { vault: dir, pushed: [], refused: [], unchanged: [] };

    for (const [rel, entry] of Object.entries(manifest.files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      // The README and the SVGs are the vault's own, never content to push.
      if (entry.kind === "readme" || entry.kind === "asset") continue;
      const current = await readText(dir, path.join(dir, rel)).catch(notPlain);
      if (current instanceof NotPlainFile) {
        report.refused.push({ path: rel, reason: current.message });
        continue;
      }
      if (current === null) {
        report.refused.push({
          path: rel,
          reason: `${rel} is gone. A ${entry.kind} is not deleted from the vault; learn vault pull puts it back.`,
        });
        continue;
      }
      try {
        await settleDeletedSide(dir, entry, current);
        if (entry.hash !== null && sha256(current) === entry.hash) {
          report.unchanged.push(rel);
          continue;
        }
        if (entry.kind === "log") await pushLog(db, rel, entry, current, report);
        else {
          const committed = report.pushed.length;
          await pushNote(db, dir, rel, entry, current, options.reason ?? `learn vault push ${rel}`, report);
          // Recorded as soon as it is committed: stopped before the end, a push
          // run again would otherwise take its own commit for a moved base.
          if (report.pushed.length > committed) await writeManifest(dir, manifest);
        }
      } catch (error) {
        // A side copy that is a link: this file is refused, the rest go on.
        report.refused.push({ path: rel, reason: notPlain(error).message });
      }
    }

    for (const rel of await untracked(dir, manifest)) {
      if (KEPT.test(rel)) {
        const original = rel.replace(KEPT, ".md");
        report.refused.push({
          path: rel,
          reason:
            `${rel} is an edit saved to ${original} while a vault command was moving that file, kept apart so ` +
            `neither version was lost. Merge what you want of it into ${original}, then delete it.`,
        });
        continue;
      }
      report.refused.push({
        path: rel,
        reason: rel.startsWith("sessions/")
          ? `${rel} is not a log in the database. Logs are written by tutoring sessions, not from the vault.`
          : `${rel} is not a note in the database. A new note is made with learn concept add --topic <slug>, ` +
            `since the vault cannot say which topic it belongs to; then learn vault pull brings it here.`,
      });
    }

    if (JSON.stringify(manifest) !== before) await writeManifest(dir, manifest);
    return report;
  });
}

async function pushNote(
  db: CatalogDatabase,
  dir: string,
  rel: string,
  entry: Entry,
  text: string,
  reason: string,
  report: PushReport,
): Promise<void> {
  if (entry.pending !== undefined) {
    report.refused.push({
      path: rel,
      reason:
        `${entry.pending.path} is the database's newer version of this note. Merge what you want of it into ` +
        `${rel}, delete it, and push again.`,
    });
    return;
  }
  if (entry.base === null) {
    report.refused.push({
      path: rel,
      reason: `nothing records which revision ${rel} was based on. Run learn vault pull, which writes the database's version beside it.`,
    });
    return;
  }
  try {
    const written = await commitNoteText(db, entry.id, text, { base: entry.base, reason, where: path.join(dir, rel) });
    // The file as it stands is now what the note holds, whatever the rows
    // normalise in their rendering; the next pull rewrites it to that
    // rendering, since the file is then unedited against this hash.
    entry.base = written.revision;
    entry.hash = sha256(text);
    if (written.changed) report.pushed.push({ path: rel, id: entry.id, revision: written.revision });
    else report.unchanged.push(rel);
  } catch (error) {
    if (error instanceof ContentWriteError && error.code === "stale-base") {
      const now = await noteText(db, entry.id, cliScope().readable);
      if (now === null) {
        report.refused.push({ path: rel, reason: `${entry.id} is no longer a live note in the database.` });
        return;
      }
      if (now.text === rendered(text, rel, entry.id)) {
        // The database already holds exactly this file: a push that committed
        // it and stopped before recording that. Nothing to merge, so it is
        // recorded now rather than handed back as a conflict with itself.
        entry.base = now.revision;
        entry.hash = sha256(text);
        report.unchanged.push(rel);
        return;
      }
      const side = await writeSide(dir, entry, rel, "conflict", now.text, now.revision);
      report.refused.push({
        path: rel,
        reason:
          `${entry.id} changed in the database after revision ${entry.base} (it is at ${now.revision ?? "none"}). ` +
          (side === null
            ? `${sidePath(rel, "conflict")} holds edits of its own, so the current version was not written beside it.`
            : `Its current version is beside yours as ${side}: merge what you want of it into ${rel}, delete it, and push again.`),
        ...(side === null ? {} : { conflict: side }),
      });
      return;
    }
    if (error instanceof NoteWriteError || error instanceof NoteError || error instanceof ContentWriteError) {
      report.refused.push({ path: rel, reason: error.message });
      return;
    }
    throw error;
  }
}

/** The file as the row would render it, or null when it does not parse as a note. */
function rendered(text: string, rel: string, id: string): string | null {
  try {
    return renderNote(readNote(text, rel, id));
  } catch {
    return null;
  }
}

async function pushLog(db: CatalogDatabase, rel: string, entry: Entry, text: string, report: PushReport): Promise<void> {
  // A copy made identical to the database's (the `.incoming` copied over it)
  // is not an edit: record it as unedited, and nothing is refused.
  const { rows } = await db.execute<{ markdown: string | null; entries: number }>(sql`
    select string_agg(markdown, '' order by seq) as markdown, count(*)::int as entries
    from ${sessionLogEntry} where session_id = ${entry.id}
  `);
  const now = rows[0];
  if (now?.markdown === text) {
    entry.base = now.entries;
    entry.hash = sha256(text);
    report.unchanged.push(rel);
    return;
  }
  report.refused.push({ path: rel, reason: `${rel} ${LOG_REFUSAL}` });
}

/** Markdown under `concepts/` and `sessions/` no pull wrote, side copies aside. */
async function untracked(dir: string, manifest: Manifest): Promise<string[]> {
  const found: string[] = [];
  for (const top of ["concepts", "sessions"]) {
    let entries;
    try {
      entries = await fs.readdir(path.join(dir, top), { withFileTypes: true, recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries) {
      // Anything named like a note is listed, a link, folder or pipe too, so
      // it is refused by name rather than passed over.
      if (!entry.name.endsWith(".md") || SIDE_COPY.test(entry.name)) continue;
      const rel = path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join("/");
      if (rel.split("/").some((part) => part.startsWith("."))) continue;
      if (manifest.files[rel] === undefined) found.push(rel);
    }
  }
  return found.sort();
}
