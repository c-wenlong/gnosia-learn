import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { sessionLogEntry } from "@self-learn/schema";
import { sql } from "drizzle-orm";

import { databaseIdentity } from "../content/import-root";
import { commitNoteText, noteText, NoteWriteError, readNoteRows } from "../content/note-rows";
import { NoteError, renderNote } from "../content/notes";
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
 * - every replace re-reads the file just before it renames over it, so an
 *   edit saved while the command ran is kept, not lost.
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
  kind: "note" | "log" | "readme";
  /** The concept slug or the session id. */
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

const README_TEXT = `# Notes vault

This folder is a copy of the notes and session logs in the self-learn database, made by \`npm run learn -- vault pull\`, for reading and editing in Obsidian.
\`vault pull\` brings it up to date and never overwrites a file you edited: when the database moved on, its version lands beside yours as \`<name>.incoming.md\`.
\`vault push\` writes your edited notes back, one revision each; a note that changed in the database since your pull is refused, with its current version left as \`<name>.conflict.md\`.
To settle an \`.incoming\` or \`.conflict\` copy, merge what you want of it into your note, delete the copy, and push.
Session logs are a record of what happened and are read-only here: a correction belongs in the note it touched.
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
 * pulled into `learn/` would be read by the next `catalog import`.
 */
export function resolveVaultDir(given: string | undefined): string {
  const dir =
    given === undefined || given.trim() === ""
      ? defaultVaultDir()
      : path.resolve(process.env["INIT_CWD"] ?? process.cwd(), given);
  for (const root of new Set([REPO_ROOT, repoRoot()])) {
    if (inside(real(dir), real(root))) {
      throw new VaultError(
        `${dir} is inside ${root}. A vault lives outside the repository: leave out --out for ${defaultVaultDir()}, ` +
          `or name a folder elsewhere.`,
      );
    }
  }
  return dir;
}

function real(target: string): string {
  try {
    return realpathSync(target);
  } catch {
    return target;
  }
}

function inside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function readText(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Write `text` to `file` only while the file still reads as expected: absent
 * when `expected` is null, else hashing to it. Checked immediately before
 * the atomic rename, so an edit saved by Obsidian after the command decided
 * what to do is found here and kept. Returns whether it wrote.
 */
async function replaceIfUnchanged(file: string, expected: string | null, text: string): Promise<boolean> {
  const current = await readText(file);
  if (expected === null ? current !== null : current === null || sha256(current) !== expected) return false;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await writeAtomically(file, text);
  return true;
}

/** Remove `file` only while it still hashes to `expected`. */
async function removeIfUnchanged(file: string, expected: string): Promise<boolean> {
  const current = await readText(file);
  if (current === null || sha256(current) !== expected) return false;
  await fs.rm(file, { force: true });
  return true;
}

/** A path segment from the database, refused if it could leave the vault. */
function segment(value: string, what: string): string {
  if (value === "" || value.startsWith(".") || /[\\/\0]/.test(value)) {
    throw new VaultError(`${what} ${JSON.stringify(value)} cannot be a file name in the vault`);
  }
  return value;
}

/** The side copy's vault-relative path: `x.md` beside `x.incoming.md`. */
const sidePath = (rel: string, label: "incoming" | "conflict") => rel.replace(/\.md$/, `.${label}.md`);

/* ------------------------------------------------------------ the manifest */

async function readManifest(dir: string): Promise<Manifest | null> {
  const file = path.join(dir, MANIFEST);
  const raw = await readText(file);
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
  return manifest as Manifest;
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
  await removeIfUnchanged(path.join(dir, entry.pending.path), entry.pending.hash);
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
  if ((await readText(path.join(dir, entry.pending.path))) !== null) return;
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
    const there = await readText(path.join(dir, entry.pending.path));
    if (there !== null && sha256(there) === hash) {
      entry.pending.base = base;
      return entry.pending.path;
    }
  }
  const side = sidePath(rel, label);
  if (entry.pending !== undefined && entry.pending.path !== side) await clearSide(dir, entry);
  const file = path.join(dir, side);
  const existing = await readText(file);
  if (existing !== null && sha256(existing) === hash) {
    entry.pending = { path: side, base, hash };
    return side;
  }
  let expected: string | null = null;
  if (existing !== null) {
    if (entry.pending?.path !== side || sha256(existing) !== entry.pending.hash) return null;
    expected = entry.pending.hash;
  }
  if (!(await replaceIfUnchanged(file, expected, text))) return null;
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
      const notes = await readNoteRows(tx);
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
            rel: `concepts/${folder}${segment(row.slug, "the concept id")}.md`,
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
        select session_id as id, string_agg(markdown, '' order by seq) as markdown, count(*)::int as entries
        from ${sessionLogEntry} group by session_id order by session_id collate "C"
      `);
      for (const log of logs) {
        try {
          items.push({
            rel: `sessions/${segment(log.id, "the session id")}.md`,
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
  /** Created or brought up to date. */
  written: string[];
  unchanged: string[];
  /** Files edited here and not pushed, left as they are, with the database's version beside them when it moved. */
  modified: { path: string; incoming: string | null; note?: string }[];
  /** Unedited files of notes or logs the database no longer has. */
  removed: string[];
  problems: string[];
}

export async function pullVault(db: CatalogDatabase, options: { dir: string }): Promise<PullReport> {
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
    const report: PullReport = {
      vault: dir,
      notes: items.filter((item) => item.kind === "note").length,
      logs: items.filter((item) => item.kind === "log").length,
      written: [],
      unchanged: [],
      modified: [],
      removed: [],
      problems,
    };

    for (const item of items) await pullItem(dir, manifest, item, report);

    // A file the database no longer has goes, if unedited. Not when some rows
    // could not be read: the file of a note left out above is not gone.
    const live = new Set(items.map((item) => item.rel));
    for (const [rel, entry] of problems.length > 0 ? [] : Object.entries(manifest.files)) {
      if (entry.kind === "readme" || live.has(rel)) continue;
      const file = path.join(dir, rel);
      const current = await readText(file);
      if (current === null) {
        await clearSide(dir, entry);
        delete manifest.files[rel];
      } else if (entry.hash !== null && sha256(current) === entry.hash && (await removeIfUnchanged(file, entry.hash))) {
        await clearSide(dir, entry);
        delete manifest.files[rel];
        report.removed.push(rel);
      } else {
        report.modified.push({
          path: rel,
          incoming: null,
          note: `the database no longer has this ${entry.kind === "log" ? "log" : "note"}; your copy is kept`,
        });
      }
    }

    await pullReadme(dir, manifest);
    manifest.pulledAt = new Date().toISOString();
    await writeManifest(dir, manifest);
    return report;
  });
}

async function pullItem(dir: string, manifest: Manifest, item: Item, report: PullReport): Promise<void> {
  const file = path.join(dir, item.rel);
  const want = sha256(item.text);
  const known = manifest.files[item.rel];
  const current = await readText(file);
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
    if (await replaceIfUnchanged(file, expected, item.text)) {
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

/** The README, written like any other file: never over an edit. */
async function pullReadme(dir: string, manifest: Manifest): Promise<void> {
  const file = path.join(dir, README);
  const want = sha256(README_TEXT);
  const current = await readText(file);
  const known = manifest.files[README];
  if (current !== null && sha256(current) === want) {
    manifest.files[README] = { kind: "readme", id: "README", base: null, hash: want };
    return;
  }
  const expected = current === null ? null : known?.hash === sha256(current) ? known.hash : undefined;
  if (expected !== undefined && (await replaceIfUnchanged(file, expected, README_TEXT))) {
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
      if (entry.kind === "readme") continue;
      const current = await readText(path.join(dir, rel));
      if (current === null) {
        report.refused.push({
          path: rel,
          reason: `${rel} is gone. A ${entry.kind} is not deleted from the vault; learn vault pull puts it back.`,
        });
        continue;
      }
      await settleDeletedSide(dir, entry, current);
      if (entry.hash !== null && sha256(current) === entry.hash) {
        report.unchanged.push(rel);
        continue;
      }
      if (entry.kind === "log") await pushLog(db, rel, entry, current, report);
      else await pushNote(db, dir, rel, entry, current, options.reason ?? `learn vault push ${rel}`, report);
    }

    for (const rel of await untracked(dir, manifest)) {
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
    const written = await commitNoteText(db, entry.id, text, { base: entry.base, reason });
    // The file as it stands is now what the note holds, whatever the rows
    // normalise in their rendering; the next pull rewrites it to that
    // rendering, since the file is then unedited against this hash.
    entry.base = written.revision;
    entry.hash = sha256(text);
    if (written.changed) report.pushed.push({ path: rel, id: entry.id, revision: written.revision });
    else report.unchanged.push(rel);
  } catch (error) {
    if (error instanceof ContentWriteError && error.code === "stale-base") {
      const now = await noteText(db, entry.id);
      if (now === null) {
        report.refused.push({ path: rel, reason: `${entry.id} is no longer a live note in the database.` });
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
      if (!entry.isFile() || !entry.name.endsWith(".md") || SIDE_COPY.test(entry.name)) continue;
      const rel = path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join("/");
      if (rel.split("/").some((part) => part.startsWith("."))) continue;
      if (manifest.files[rel] === undefined) found.push(rel);
    }
  }
  return found.sort();
}
