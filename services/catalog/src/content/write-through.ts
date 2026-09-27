import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { indexRun } from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { renderType } from "./export";
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
 *    from are exactly what the database would export now. Anything else is an
 *    edit the database has not seen (the type is still on files and someone
 *    changed the file, or the type is flipped and someone edited its export),
 *    and rewriting the file from rows would silently throw that edit away.
 * 3. It runs the write, renders the type again inside the same transaction
 *    (so the render sees the write), and replaces each changed file with a
 *    temp file and a rename, then records the export's hash on the type's
 *    `content_source` row, which is what lets an import of a flipped type skip
 *    the file it now matches (edge case 12).
 * 4. If anything after the first file write fails, commit included, the files
 *    are put back as they were, so the tree and the rows never disagree.
 *
 * The root is the one the type's last import read (`index_run.metadata.root`),
 * not the repository, so a write against a scratch database imported from a
 * scratch tree writes that tree. A type never imported has no files to keep in
 * step, and the write is refused with the command that fixes it.
 */

export class WriteThroughError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteThroughError";
  }
}

export interface ExportedType {
  type: ExportType;
  /** The directory the files were written under: the type's last import root. */
  root: string;
  /** Repo-relative paths rewritten, because their bytes changed. */
  written: string[];
  /** Repo-relative paths removed, because the rows no longer produce them. */
  removed: string[];
  /** The export hash of the type's files after the write. */
  hash: string;
  /** Whether the hash was recorded on `content_source`. False on a copy. */
  recorded: boolean;
}

export interface WriteThroughResult<T> {
  value: T;
  exported: ExportedType[];
}

const exportLock = (type: ExportType) => sql`hashtextextended(${`content_export:${type}`}, 0)`;

/** The root the type's rows were last imported from, or null when it never was. */
export async function importRoot(db: CatalogDatabase, type: ExportType): Promise<string | null> {
  const [run] = await db.select({ metadata: indexRun.metadata }).from(indexRun).where(eq(indexRun.source, type));
  const root = (run?.metadata as { root?: unknown } | undefined)?.root;
  return typeof root === "string" ? root : null;
}

/** The paths whose bytes differ between two sets of files, sorted. */
function differing(a: readonly ExportFile[], b: readonly ExportFile[]): string[] {
  const left = new Map(a.map((f) => [f.path, f.bytes]));
  const right = new Map(b.map((f) => [f.path, f.bytes]));
  return [...new Set([...left.keys(), ...right.keys()])]
    .filter((p) => {
      const x = left.get(p);
      const y = right.get(p);
      return x === undefined || y === undefined || !x.equals(y);
    })
    .sort();
}

interface InStep {
  type: ExportType;
  root: string;
  before: ExportFile[];
}

/**
 * Refuse unless each type's files are the database's own export. Exported so
 * a dry run can say up front that the real write would be refused.
 */
export async function assertInStep(db: CatalogDatabase, types: readonly ExportType[]): Promise<InStep[]> {
  const out: InStep[] = [];
  for (const type of types) {
    const root = await importRoot(db, type);
    if (root === null) {
      throw new WriteThroughError(
        `${type} has never been imported into this database, so there are no files to keep in step ` +
          `with the write. Run \`catalog index\` (or \`catalog import <dir>\`) first.`,
      );
    }
    const before = await readTypeFiles(root, type);
    const expected = await renderType(db, type);
    const changed = differing(before, expected);
    if (changed.length > 0) {
      throw new WriteThroughError(
        `${TYPE_LOCATION[type]} under ${root} is not what the database holds: ${changed.join(", ")} ` +
          `differ. Writing from the rows would throw that edit away. If the edit is wanted and ${type} ` +
          `is still read from files, import it first (\`catalog index --only ${type}\`); otherwise put ` +
          `the file back (\`catalog export --only ${type} --out <dir>\` writes what the database holds).`,
      );
    }
    out.push({ type, root, before });
  }
  return out;
}

let temporaryCounter = 0;

async function replaceFile(target: string, bytes: Buffer): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  temporaryCounter += 1;
  const temporary = `${target}.${process.pid}.${temporaryCounter}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, target);
}

/**
 * Run `write` in one transaction and rewrite the files of `types` from the
 * rows it leaves. See the module comment for the order and why.
 */
export async function writeThrough<T>(
  db: CatalogDatabase,
  types: readonly ExportType[],
  write: (tx: CatalogDatabase) => Promise<T>,
): Promise<WriteThroughResult<T>> {
  const sorted = [...new Set(types)].sort();
  /** Every file touched so far, with the bytes it held before (null: it did not exist). */
  const touched: { file: string; before: Buffer | null }[] = [];

  const restore = async () => {
    for (const { file, before } of touched.reverse()) {
      if (before === null) await rm(file, { force: true });
      else await replaceFile(file, before);
    }
  };

  try {
    return await db.transaction(async (tx) => {
      for (const type of sorted) await tx.execute(sql`select pg_advisory_xact_lock(${exportLock(type)})`);
      const steps = await assertInStep(tx, sorted);

      const value = await write(tx);

      const record = await mayRecord(tx);
      const exported: ExportedType[] = [];
      for (const { type, root, before } of steps) {
        const after = await renderType(tx, type);
        const changed = differing(before, after);
        const previous = new Map(before.map((f) => [f.path, f.bytes]));
        const next = new Map(after.map((f) => [f.path, f.bytes]));
        const written: string[] = [];
        const removed: string[] = [];
        for (const relative of changed) {
          const file = path.join(root, relative);
          touched.push({ file, before: previous.get(relative) ?? null });
          const bytes = next.get(relative);
          if (bytes === undefined) {
            await rm(file, { force: true });
            removed.push(relative);
          } else {
            await replaceFile(file, bytes);
            written.push(relative);
          }
        }
        const hash = exportHash(after);
        if (record) await recordExport(tx, type, hash);
        exported.push({ type, root, written, removed, hash, recorded: record });
      }
      return { value, exported };
    });
  } catch (error) {
    await restore();
    throw error;
  }
}
