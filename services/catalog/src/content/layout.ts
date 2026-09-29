import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  COURSE_COVER_EXTENSIONS,
  COURSES_DIR,
  DIAGRAMS_DIR,
  isCoverFile,
  NOTES_DIR,
  SESSIONS_DIR,
  TAGS_FILE,
  TOPICS_FILE,
} from "@self-learn/content";
import type { ContentType } from "@self-learn/schema";

/**
 * The export format's layout: which files under a root belong to which
 * content type.
 *
 * It is the repository's own layout, so `catalog export --out <dir>` writes a
 * tree `catalog import <dir>` reads back unchanged, `catalog parity` compares
 * the database against the working tree and against an export with one rule,
 * and `catalog import` is simply an import of the repository root
 * (docs/CONTENT-MIGRATION.md 0.5). Paths are repo-relative with forward
 * slashes, the form every `asset.path` and `concept.path` already takes.
 */

/** The types with files. `manimkc` has none: its videos never enter the export (D7). */
export const EXPORT_TYPES = ["topics", "tags", "courses", "concepts", "sessions", "diagrams"] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

export function isExportType(type: ContentType): type is ExportType {
  return (EXPORT_TYPES as readonly string[]).includes(type);
}

/** Where each type's files live, for help text and refusals. */
export const TYPE_LOCATION: Readonly<Record<ExportType, string>> = {
  topics: TOPICS_FILE,
  tags: TAGS_FILE,
  courses: `${COURSES_DIR}/*.yaml`,
  concepts: `${NOTES_DIR}/<domain>/*.md`,
  sessions: `${SESSIONS_DIR}/*.md`,
  diagrams: `${DIAGRAMS_DIR}/*.tldr, *.svg`,
};

/** One file of the export: where it goes and what it holds. */
export interface ExportFile {
  /** Repo-relative, forward slashes. */
  path: string;
  bytes: Buffer;
}

async function entries(directory: string) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** Files directly in `relative` under `root` with one of `extensions`, repo-relative and sorted. */
async function filesUnder(root: string, relative: string, extensions: readonly string[]): Promise<string[]> {
  return (await entries(path.join(root, relative)))
    .filter((e) => e.isFile() && extensions.includes(path.extname(e.name)))
    .map((e) => `${relative}/${e.name}`)
    .sort();
}

/**
 * The repo-relative paths of one type's files under `root`, sorted. A missing
 * directory or file is an empty list: whether an empty type is an error is the
 * caller's question.
 *
 * The same rules the indexers read by, so a file this lists is a file the
 * import reads: `*.yaml` and `*.yml` for courses (the READMEs beside them are
 * not courses) with each course's cover image, `<code>.cover.<ext>`, notes
 * one folder deep, logs and diagrams directly in their
 * folders (`learn/assets/.candidates/` is the studio's, and is not content).
 */
export async function typeFiles(root: string, type: ExportType): Promise<string[]> {
  switch (type) {
    case "topics":
    case "tags": {
      const file = type === "topics" ? TOPICS_FILE : TAGS_FILE;
      const listed = await filesUnder(root, path.posix.dirname(file), [".yaml"]);
      return listed.filter((p) => p === file);
    }
    case "courses":
      return (
        await filesUnder(root, COURSES_DIR, [".yaml", ".yml", ...COURSE_COVER_EXTENSIONS.map((ext) => `.${ext}`)])
      ).filter((p) => p.endsWith(".yaml") || p.endsWith(".yml") || isCoverFile(p));
    case "concepts": {
      const domains = (await entries(path.join(root, NOTES_DIR)))
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
      const out: string[] = [];
      for (const domain of domains) out.push(...(await filesUnder(root, `${NOTES_DIR}/${domain}`, [".md"])));
      return out;
    }
    case "sessions":
      return filesUnder(root, SESSIONS_DIR, [".md"]);
    case "diagrams":
      return filesUnder(root, DIAGRAMS_DIR, [".tldr", ".svg"]);
  }
}

/** Read one type's files under `root`. */
export async function readTypeFiles(root: string, type: ExportType): Promise<ExportFile[]> {
  const out: ExportFile[] = [];
  for (const relative of await typeFiles(root, type)) {
    out.push({ path: relative, bytes: await readFile(path.join(root, relative)) });
  }
  return out;
}

export function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * One hash for a type's whole export: sha256 over `path<TAB>sha256(bytes)`
 * lines in path order. A file added, removed, renamed or edited changes it,
 * which is what edge case 12 needs; which file it was is a question for
 * `catalog parity`, which compares entity by entity.
 */
export function exportHash(files: readonly ExportFile[]): string {
  const lines = [...files]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((file) => `${file.path}\t${sha256(file.bytes)}\n`);
  return sha256(lines.join(""));
}
