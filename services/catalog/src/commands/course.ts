import { mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  type CourseExportResult,
  type CourseImportResult,
  exportCourse,
  importCourse,
  stampCourse,
  type WriteThroughSummary,
} from "../content/courses";
import { archiveItem, type ItemResult, purgeItem, restoreItem } from "../content/items";
import { importRoot } from "../content/write-through";
import { withDatabase } from "../db";
import { databaseUrl, redactUrl } from "../env";

/**
 * `catalog course import|export` and `catalog item archive|restore|purge`:
 * the connection and the printing. What each does, and the rules it keeps, is
 * in `../content/courses.ts` and `../content/items.ts`.
 */

export type CourseImportCommandResult = CourseImportResult & { database: string };
export type CourseExportCommandResult = CourseExportResult & { database: string; out: string | null };
export type ItemCommandResult = ItemResult & { database: string; verb: ItemVerb };

export const ITEM_VERBS = ["archive", "restore", "purge"] as const;
export type ItemVerb = (typeof ITEM_VERBS)[number];

export async function runCourseImport(options: {
  file: string;
  reason: string;
  dryRun?: boolean;
  forceBase?: boolean;
}): Promise<CourseImportCommandResult> {
  const url = databaseUrl();
  return withDatabase(async ({ db }) => ({ database: redactUrl(url), ...(await importCourse(db, options)) }));
}

/**
 * The file goes out stamped with the revision it was read at (`stampCourse`),
 * so an import of it after the course moved on is refused rather than undoing
 * the move. The one exception is `--out` naming the course's own file in the
 * tree courses were imported from: that file is the database's export, kept
 * in step by the write-through, which compares it byte for byte and would
 * read a stamp as an edit.
 */
export async function runCourseExport(options: { id: string; out?: string }): Promise<CourseExportCommandResult> {
  const url = databaseUrl();
  const { result, root } = await withDatabase(async ({ db }) => ({
    result: await exportCourse(db, options.id),
    root: await importRoot(db, "courses"),
  }));
  const stamped = stampCourse(result.yaml, result.base);
  let out: string | null = null;
  let yaml = stamped;
  if (options.out !== undefined) {
    out = path.resolve(options.out);
    const own = root !== null && (await sameFile(out, path.join(root, result.path)));
    yaml = own ? result.yaml : stamped;
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, yaml, "utf8");
  }
  return { database: redactUrl(url), out, ...result, yaml };
}

/**
 * Whether two paths name one file, every link resolved, the file's own
 * included: an `--out` that is a link to the tree's file is the tree's file,
 * since the write follows the link. A file not there yet compares by its
 * resolved directory.
 */
async function sameFile(a: string, b: string): Promise<boolean> {
  const real = async (file: string) =>
    realpath(file).catch(async () => {
      const dir = await realpath(path.dirname(file)).catch(() => path.resolve(path.dirname(file)));
      return path.join(dir, path.basename(file));
    });
  return (await real(a)) === (await real(b));
}

export async function runItem(options: {
  verb: ItemVerb;
  id: string;
  reason: string;
  withLearnerData?: boolean;
}): Promise<ItemCommandResult> {
  const url = databaseUrl();
  return withDatabase(async ({ db }) => {
    const input = { id: options.id, reason: options.reason };
    const result =
      options.verb === "archive"
        ? await archiveItem(db, input)
        : options.verb === "restore"
          ? await restoreItem(db, input)
          : await purgeItem(db, { ...input, withLearnerData: options.withLearnerData });
    return { database: redactUrl(url), verb: options.verb, ...result };
  });
}

function writeThroughLines(summary: WriteThroughSummary): string[] {
  return [
    ...summary.written.map((file) => `  wrote ${file.path}  (under ${file.root})`),
    ...summary.removed.map((file) => `  removed ${file.path}  (under ${file.root})`),
    ...summary.conflicts.map(
      (file) =>
        `  left ${file.path}  (under ${file.root}): it changed on disk during the write` +
        (file.incoming === null ? "" : `; the database's version is beside it as ${file.incoming}`),
    ),
  ];
}

export function formatCourseImport(result: CourseImportCommandResult): string {
  const written = result.changes.filter((change) => change.op !== null);
  const lines = [
    `database  ${result.database}`,
    `${result.dryRun ? "dry run, nothing committed: " : ""}course ${result.course} from ${result.file}: ` +
      `${result.revisions} revision(s), ${result.changes.length - written.length} unchanged`,
  ];
  for (const change of written) {
    const revision = change.revisionId === null ? "" : `  (revision ${change.revisionId})`;
    lines.push(`  ${change.op}  ${change.type} ${change.id}${revision}`);
  }
  if (result.archived.modules.length + result.archived.items.length > 0) {
    lines.push(
      "archived, not deleted: learner rows on them stay, and they leave the course path",
      ...result.archived.modules.map((id) => `  module ${id}`),
      ...result.archived.items.map((id) => `  item ${id}`),
    );
  }
  if (result.restored.modules.length + result.restored.items.length > 0) {
    lines.push(
      "restored",
      ...result.restored.modules.map((id) => `  module ${id}`),
      ...result.restored.items.map((id) => `  item ${id}`),
    );
  }
  for (const id of result.deletedLinks) lines.push(`deleted curated link ${id}: no module lists it`);
  lines.push(...writeThroughLines(result.writeThrough));
  return lines.join("\n");
}

export function formatCourseExport(result: CourseExportCommandResult): string {
  if (result.out === null) return result.yaml.replace(/\n$/, "");
  return `course ${result.course} written to ${result.out} (its place in the tree: ${result.path})`;
}

export function formatItem(result: ItemCommandResult): string {
  const lines = [
    `database  ${result.database}`,
    result.op === null
      ? `item ${result.item} (${result.course}) was already that way; no revision`
      : `item ${result.item} (${result.course}): ${result.op}, revision ${result.revisionId}`,
    ...result.detail.map((line) => `  ${line}`),
    ...writeThroughLines(result.writeThrough),
  ];
  return lines.join("\n");
}
