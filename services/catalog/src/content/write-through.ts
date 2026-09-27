import { readFile, realpath, rename, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { contentSource, indexRun } from "@self-learn/schema";
import { eq } from "drizzle-orm";
import { parse } from "yaml";

import type { CatalogDatabase } from "../db";
import { renderType } from "./export";
import { type ExportFile, exportHash, type ExportType } from "./layout";
import { mayRecord, recordExport } from "./ownership";
import { canonicalJson } from "./snapshot";

/**
 * The write-through of D17 (docs/CONTENT-MIGRATION.md): after a writer changes
 * rows, the export files those rows render to are rewritten in the tree the
 * type was last imported from, so the files and the database never disagree.
 *
 * Both halves of the migration need it. While a type is on files, the files
 * are the truth, and a write that did not reach them would be undone by the
 * next `catalog index`. Once a type is flipped, the files are its export, and
 * a stale one would make the next import of the tree refuse (edge case 12)
 * and the files rollback silently older than the database. So a writer calls
 * {@link captureExports} before it writes and {@link planWriteThrough} after,
 * inside its transaction, and {@link applyWriteThrough} once it commits.
 *
 * **Only the files the write changed are written**, found by rendering the
 * type before and after. A file nobody's write touched is left as it is, so a
 * hand edit in another course file is never overwritten by an edit to this
 * one.
 *
 * **A changed file must say what the database rendered before the write**
 * (compared parsed, for YAML), or the write is refused and rolled back. A file that differs holds edits the
 * database never imported, and rewriting it would lose them without a word.
 * The one exception is the file the writer was handed: `catalog course import
 * content/courses/cs2111.yaml` after editing that file in place is the
 * ordinary way to change a course, and that file is what is being imported.
 *
 * **The whole type's export hash is recorded when the database owns it**, in
 * the same transaction, so the next `catalog import` of the tree recognises
 * the files as the database's own export and skips them.
 */

export class WriteThroughRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteThroughRefused";
  }
}

/** One type's files as the database rendered them, by repo-relative path. */
export type Rendered = Map<ExportType, Map<string, Buffer>>;

export async function captureExports(db: CatalogDatabase, types: readonly ExportType[]): Promise<Rendered> {
  const out: Rendered = new Map();
  for (const type of types) out.set(type, byPath(await renderType(db, type)));
  return out;
}

function byPath(files: readonly ExportFile[]): Map<string, Buffer> {
  return new Map(files.map((file) => [file.path, file.bytes]));
}

/** One file the write changed: where it goes, and its bytes, or null to remove it. */
export interface PlannedFile {
  type: ExportType;
  /** Repo-relative. */
  path: string;
  /** The type's import root, which `path` is under. */
  root: string;
  /** Absolute: `root` joined with `path`. */
  target: string;
  bytes: Buffer | null;
}

export interface WriteThroughPlan {
  files: PlannedFile[];
  /** Types whose rendering changed but that were never imported from a tree, so there is nowhere to write. */
  skipped: { type: ExportType; reason: string }[];
  /** Types whose export hash was recorded on `content_source` in this transaction. */
  recorded: ExportType[];
}

/** The directory each type was last imported from, `index_run.metadata.root`, or null. */
async function importRoot(db: CatalogDatabase, type: ExportType): Promise<string | null> {
  const [run] = await db
    .select({ metadata: indexRun.metadata })
    .from(indexRun)
    .where(eq(indexRun.source, type));
  const root = (run?.metadata as { root?: unknown } | undefined)?.root;
  return typeof root === "string" ? root : null;
}

async function readOrNull(file: string): Promise<Buffer | null> {
  try {
    return await readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function resolved(file: string): Promise<string> {
  try {
    return await realpath(file);
  } catch {
    return path.resolve(file);
  }
}

function same(a: Buffer | null | undefined, b: Buffer | null | undefined): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  return b !== null && b !== undefined && a.equals(b);
}

/**
 * Whether the file on disk says what the database rendered, as content: a
 * YAML file is compared parsed, the way `catalog parity` compares it, so a
 * file that differs only in comments, quoting or spacing is not taken for an
 * edit. Rewriting it loses only that formatting, which the export format
 * does not carry anyway.
 */
function sameContent(file: string, onDisk: Buffer | null, rendered: Buffer | undefined): boolean {
  if (same(onDisk, rendered)) return true;
  if (onDisk === null || rendered === undefined || !/\.ya?ml$/.test(file)) return false;
  try {
    return canonicalJson(parse(onDisk.toString("utf8"))) === canonicalJson(parse(rendered.toString("utf8")));
  } catch {
    return false;
  }
}

/**
 * What the write changed on disk, checked against what is there now. Runs
 * inside the writer's transaction, after its writes: a refusal here rolls the
 * whole write back, and nothing has touched the disk yet.
 *
 * `input` is the file the writer was handed, if any, which may differ from
 * what the database rendered before the write because it is the edit.
 */
export async function planWriteThrough(
  db: CatalogDatabase,
  before: Rendered,
  options: { input?: string } = {},
): Promise<WriteThroughPlan> {
  const input = options.input === undefined ? null : await resolved(options.input);
  const files: PlannedFile[] = [];
  const skipped: WriteThroughPlan["skipped"] = [];
  const recorded: ExportType[] = [];
  const edited: string[] = [];

  const owners = new Map(
    (await db.select({ type: contentSource.type, source: contentSource.source }).from(contentSource)).map(
      (row) => [row.type, row.source],
    ),
  );

  for (const [type, was] of before) {
    const now = byPath(await renderType(db, type));
    const changed = [...new Set([...was.keys(), ...now.keys()])]
      .filter((file) => !same(was.get(file), now.get(file)))
      .sort();
    if (changed.length === 0) continue;

    const root = await importRoot(db, type);
    if (root === null) {
      skipped.push({
        type,
        reason: `${type} was never imported from a tree, so there is no file to keep in step`,
      });
      continue;
    }
    for (const file of changed) {
      const target = path.join(root, file);
      const onDisk = await readOrNull(target);
      const isInput = input !== null && (await resolved(target)) === input;
      if (!isInput && !sameContent(file, onDisk, was.get(file))) edited.push(`${file} (under ${root})`);
      files.push({ type, path: file, root, target, bytes: now.get(file) ?? null });
    }
    if (owners.get(type) === "db" && (await mayRecord(db))) {
      await recordExport(db, type, exportHash([...now].map(([file, bytes]) => ({ path: file, bytes }))));
      recorded.push(type);
    }
  }

  if (edited.length > 0) {
    throw new WriteThroughRefused(
      `this write changes files that hold edits the database has not imported, and rewriting them ` +
        `would lose those edits. Import them first (for a course, \`catalog course import <file> ` +
        `--reason ...\`), or put them back, then run this again. Nothing was written.\n  - ` +
        edited.join("\n  - "),
    );
  }
  return { files, skipped, recorded };
}

/**
 * Write the planned files, each through a temporary file renamed into place
 * so a reader never sees half of one. Called after the transaction commits:
 * a crash between the two leaves the files one write behind, which the next
 * import reports by name (edge case 12) rather than losing anything.
 */
export async function applyWriteThrough(plan: WriteThroughPlan): Promise<void> {
  for (const file of plan.files) {
    if (file.bytes === null) {
      await rm(file.target, { force: true });
      continue;
    }
    await mkdir(path.dirname(file.target), { recursive: true });
    const temporary = `${file.target}.${process.pid}.tmp`;
    await writeFile(temporary, file.bytes);
    await rename(temporary, file.target);
  }
}
