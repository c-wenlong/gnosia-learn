import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import type { BlobStore } from "@self-learn/blob";
import { sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { documentBytes } from "./diagram-document";
import { renderType } from "./export";
import { ownRoot, resolvedPath, writableRoot, WriteThroughError } from "./import-root";
import { type ExportFile, exportHash, type ExportType, readTypeFiles, TYPE_LOCATION } from "./layout";
import { mayRecord, recordExport } from "./ownership";

/**
 * A content write that keeps the type's files in step with the rows
 * (D17 of docs/CONTENT-MIGRATION.md).
 *
 * Until the phase 3 cut-over some reader still parses files: the course
 * reader checks every module's topic against `content/topics.yaml`, the
 * concepts importer takes each note's topic from it, and every type that has
 * not flipped is read from its files. So a writer rewrites its type's export
 * after each write, from the rows, in the same transaction:
 *
 * 1. It takes an advisory lock per type (`content_export:<type>`), before any
 *    revision lock, so two writers of one type cannot interleave their file
 *    writes and leave the older render on disk.
 * 2. It refuses unless the files under the root the type was last imported
 *    from say exactly what the database would export now (a `.tldr` compared
 *    as its document, every other file byte for byte). Anything else is an
 *    edit the database has not seen (the type is still on files and someone
 *    changed the file, or the type is flipped and someone edited its export),
 *    and rewriting the file from rows would silently throw that edit away.
 * 3. It runs the write, renders the type again inside the same transaction
 *    (so the render sees the write), and replaces each file whose render
 *    changed with a temp file and a rename, then records the export's hash on
 *    the type's `content_source` row, which is what lets an import of a
 *    flipped type skip the file it now matches (edge case 12). Each file is
 *    read once more just before its rename: one saved since the check is left
 *    alone and the database's version goes beside it as `<file>.incoming`
 *    (`.incoming.2` and on while an earlier one waits), which no reader picks
 *    up, and the result lists it.
 * 4. If anything after the first file write fails, commit included, the files
 *    are put back as they were, so the tree and the rows never disagree. The
 *    transaction's locks are gone by then, so the put-back takes them again,
 *    and leaves any file whose bytes are no longer the ones this write put
 *    there: another writer committed and rewrote it in between, and its bytes
 *    are the rows'.
 *
 * The root is the one the type's last import read (`index_run.metadata.root`),
 * not the repository, so a write against a scratch database imported from a
 * scratch tree writes that tree. It must be a root this database recorded
 * itself and not one in another checkout of the repository
 * (`import-root.ts`): a `createdb -T` copy inherits the owner's root, and
 * would otherwise rewrite the owner's working tree. A type never imported
 * here has no files to keep in step, and the write is refused with the
 * command that fixes it.
 */

export { WriteThroughError } from "./import-root";

/** A changed file left alone because it moved on disk mid-write; the database's version is beside it. */
export interface WriteThroughConflict {
  /** Repo-relative: the file that was not overwritten. */
  path: string;
  /** Repo-relative: where the database's version went, or null for a removal that was not made. */
  incoming: string | null;
}

export interface ExportedType {
  type: ExportType;
  /** The directory the files were written under: the type's last import root. */
  root: string;
  /** Repo-relative paths rewritten, because their bytes changed. */
  written: string[];
  /** Repo-relative paths removed, because the rows no longer produce them. */
  removed: string[];
  /**
   * Files that changed on disk between the in-step check and their rewrite
   * (an editor saved one mid-write), so were left as they are.
   */
  conflicts: WriteThroughConflict[];
  /** The export hash of the type's files as this write left them (conflicts counted as written). */
  hash: string;
  /** Whether the hash was recorded on `content_source`. False on a copy. */
  recorded: boolean;
}

export interface WriteThroughResult<T> {
  value: T;
  exported: ExportedType[];
}

const exportLock = (type: ExportType) => sql`hashtextextended(${`content_export:${type}`}, 0)`;

/**
 * The root this database recorded for the type, or null when it never
 * imported it here (a copy's inherited root does not count; see
 * `import-root.ts`).
 */
export async function importRoot(db: CatalogDatabase, type: ExportType): Promise<string | null> {
  return ownRoot(db, type);
}

function sameBytes(a: Buffer | null | undefined, b: Buffer | null | undefined): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  return b !== null && b !== undefined && a.equals(b);
}

/**
 * Whether a file on disk holds what the rows render, as content. Bytes for
 * every type but a diagram's document: a `.tldr` is stored as jsonb and
 * rendered as its canonical JSON (`diagram-document.ts`), so the file
 * tldrawkc wrote, with its own key order and spacing, is the same document
 * in different bytes. Parity compares it the same way.
 */
function sameContent(file: string, onDisk: Buffer | undefined, rendered: Buffer | undefined): boolean {
  if (sameBytes(onDisk, rendered)) return true;
  if (onDisk === undefined || rendered === undefined || !file.endsWith(".tldr")) return false;
  try {
    return documentBytes(JSON.parse(onDisk.toString("utf8"))).equals(rendered);
  } catch {
    return false;
  }
}

/** The paths in either set whose content differs, sorted. */
function differing(disk: readonly ExportFile[], rendered: readonly ExportFile[]): string[] {
  const left = new Map(disk.map((f) => [f.path, f.bytes]));
  const right = new Map(rendered.map((f) => [f.path, f.bytes]));
  return [...new Set([...left.keys(), ...right.keys()])]
    .filter((p) => !sameContent(p, left.get(p), right.get(p)))
    .sort();
}

interface InStep {
  type: ExportType;
  root: string;
  /** The files on disk when the check ran. */
  disk: ExportFile[];
  /** What the rows rendered to when the check ran. */
  rendered: ExportFile[];
}

/**
 * Refuse unless each type's files are the database's own export. Exported so
 * a dry run can say up front that the real write would be refused.
 */
export async function assertInStep(
  db: CatalogDatabase,
  types: readonly ExportType[],
  options: WriteThroughOptions = {},
): Promise<InStep[]> {
  const exempt = new Set(await Promise.all((options.exempt ?? []).map(resolvedPath)));
  const out: InStep[] = [];
  for (const type of types) {
    const root = await writableRoot(db, type);
    const disk = await readTypeFiles(root, type);
    const rendered = await renderType(db, type, { store: options.store });
    const changed: string[] = [];
    for (const relative of differing(disk, rendered)) {
      if (!exempt.has(await resolvedPath(path.join(root, relative)))) changed.push(relative);
    }
    if (changed.length > 0) {
      throw new WriteThroughError(
        `${TYPE_LOCATION[type]} under ${root} is not what the database holds: ${changed.join(", ")} ` +
          `differ. Writing from the rows would throw that edit away. If the edit is wanted and ${type} ` +
          `is still read from files, import it first (\`catalog import --only ${type}\`); otherwise put ` +
          `the file back (\`catalog export --only ${type} --out <dir>\` writes what the database holds).`,
      );
    }
    out.push({ type, root, disk, rendered });
  }
  return out;
}

/**
 * `exempt`: files the writer was handed as its input, which may differ from
 * the database because they are the edit being written. `catalog course
 * import content/courses/cs2111.yaml` after editing that file in place is the
 * ordinary way to change a course, and refusing it as an unimported edit
 * would refuse the import of exactly that edit.
 */
export interface WriteThroughOptions {
  exempt?: readonly string[];
  /** The blob store a diagram's SVG is rendered from: the one the writer uploaded it to. */
  store?: BlobStore;
}

let temporaryCounter = 0;

async function replaceFile(target: string, bytes: Buffer): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  temporaryCounter += 1;
  const temporary = `${target}.${process.pid}.${temporaryCounter}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, target);
}

async function readOrNull(file: string): Promise<Buffer | null> {
  try {
    return await readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** `base`, or `base.2`, `base.3` ..., whichever does not exist yet. */
async function freeName(base: string): Promise<string> {
  for (let n = 1; ; n += 1) {
    const candidate = n === 1 ? base : `${base}.${n}`;
    if ((await readOrNull(candidate)) === null) return candidate;
  }
}

/**
 * Run `write` in one transaction and rewrite the files of `types` from the
 * rows it leaves. See the module comment for the order and why.
 */
export async function writeThrough<T>(
  db: CatalogDatabase,
  types: readonly ExportType[],
  write: (tx: CatalogDatabase) => Promise<T>,
  options: WriteThroughOptions = {},
): Promise<WriteThroughResult<T>> {
  const sorted = [...new Set(types)].sort();
  /** Every file touched so far: the bytes it held before and the bytes written (null: absent). */
  const touched: { file: string; before: Buffer | null; wrote: Buffer | null }[] = [];

  const putBack = async () => {
    for (const { file, before, wrote } of [...touched].reverse()) {
      const now = await readFile(file).catch(() => null);
      const ours = now === null ? wrote === null : wrote !== null && now.equals(wrote);
      if (!ours) continue;
      if (before === null) await rm(file, { force: true });
      else await replaceFile(file, before);
    }
  };
  /**
   * Put the files back after a failed write. Falls back to doing it without
   * the locks only when the locks themselves cannot be had (the database is
   * what failed); a put-back that fails while holding them is not retried
   * unlocked, since that retry could overwrite a newer writer's export.
   */
  const restore = async (): Promise<string | null> => {
    if (touched.length === 0) return null;
    let locked = false;
    try {
      await db.transaction(async (tx) => {
        for (const type of sorted) await tx.execute(sql`select pg_advisory_xact_lock(${exportLock(type)})`);
        locked = true;
        await putBack();
      });
      return null;
    } catch (error) {
      if (locked) return (error as Error).message;
    }
    // The locks could not be had. The check for bytes still ours is the guard
    // left: a writer that committed in between rewrote the file, and its
    // bytes are left where they are.
    try {
      await putBack();
      return null;
    } catch (error) {
      return (error as Error).message;
    }
  };

  try {
    return await db.transaction(async (tx) => {
      for (const type of sorted) await tx.execute(sql`select pg_advisory_xact_lock(${exportLock(type)})`);
      const steps = await assertInStep(tx, sorted, options);
      const exempt = new Set(await Promise.all((options.exempt ?? []).map(resolvedPath)));

      const value = await write(tx);

      const record = await mayRecord(tx);
      const exported: ExportedType[] = [];
      for (const { type, root, disk, rendered } of steps) {
        const after = await renderType(tx, type, { store: options.store });
        const onDisk = new Map(disk.map((f) => [f.path, f.bytes]));
        const was = new Map(rendered.map((f) => [f.path, f.bytes]));
        const next = new Map(after.map((f) => [f.path, f.bytes]));
        // The files as this write leaves them: what was on disk, with every
        // file the write changed replaced by its new render.
        const result = new Map(onDisk);
        const written: string[] = [];
        const removed: string[] = [];
        const conflicts: WriteThroughConflict[] = [];
        for (const relative of [...new Set([...onDisk.keys(), ...next.keys()])].sort()) {
          const seen = onDisk.get(relative) ?? null;
          const bytes = next.get(relative) ?? null;
          if (sameBytes(seen, bytes)) continue;
          const file = path.join(root, relative);
          // Only a file whose render this write changed is rewritten, plus the
          // file the writer was handed. A file that already says what the
          // rows say in other bytes (a `.tldr` in tldrawkc's key order) is
          // left in the author's bytes rather than rewritten by an unrelated
          // write.
          const moved = !sameBytes(was.get(relative) ?? null, bytes);
          if (!moved && !exempt.has(await resolvedPath(file))) continue;
          if (bytes === null) result.delete(relative);
          else result.set(relative, bytes);
          // Read once more just before the rename: a file saved since the
          // check (an editor, another process) is left as it is, and the
          // database's version goes beside it where no reader picks it up.
          // The window left is the width of one rename.
          if (!sameBytes(await readOrNull(file), seen)) {
            if (bytes === null) {
              conflicts.push({ path: relative, incoming: null });
              continue;
            }
            const incoming = await freeName(`${file}.incoming`);
            touched.push({ file: incoming, before: null, wrote: bytes });
            await replaceFile(incoming, bytes);
            conflicts.push({ path: relative, incoming: path.relative(root, incoming).split(path.sep).join("/") });
            continue;
          }
          touched.push({ file, before: seen, wrote: bytes });
          if (bytes === null) {
            await rm(file, { force: true });
            removed.push(relative);
          } else {
            await replaceFile(file, bytes);
            written.push(relative);
          }
        }
        // Conflicts are counted as written: the recorded hash is the rows'
        // export, so the next import of a flipped type names the file a
        // person saved over it instead of taking their bytes for the rows'.
        const hash = exportHash([...result].map(([p, bytes]) => ({ path: p, bytes })));
        if (record) await recordExport(tx, type, hash);
        exported.push({ type, root, written, removed, conflicts, hash, recorded: record });
      }
      return { value, exported };
    });
  } catch (error) {
    const failed = await restore();
    if (failed === null) throw error;
    throw new WriteThroughError(
      `${(error as Error).message}\n  The write was rolled back, but putting the files back failed too ` +
        `(${failed}), so they may not match the database. Rewrite them from the rows with ` +
        `\`catalog export --only ${sorted.join(",")} --out <the tree it was imported from>\`.`,
    );
  }
}
