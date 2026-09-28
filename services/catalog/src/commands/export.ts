import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ExportError, renderType } from "../content/export";
import {
  EXPORT_TYPES,
  type ExportFile,
  exportHash,
  type ExportType,
  typeFiles,
} from "../content/layout";
import { ownRoot, recordedRoot, resolvedPath } from "../content/import-root";
import { type ExportSubset, subsetFilter } from "../content/subset";
import { mayRecord, recordExport } from "../content/ownership";
import { type CatalogDatabase, withDatabase } from "../db";
import { databaseUrl, REPO_ROOT, redactUrl } from "../env";

/**
 * `catalog export [--only <type>] --out <dir>`: the database written back out
 * as the files it was imported from (docs/CONTENT-MIGRATION.md 0.5).
 *
 * Every type is written from rows (`renderType`): topics, tags, courses,
 * concept notes and session logs from their tables, diagrams from their rows
 * and the blob store. Every type is rendered before any file is written, so a
 * refusal (a diagram whose SVG is not in the store) writes nothing.
 *
 * The hash of what was written is recorded on the type's `content_source`
 * row, which is how `catalog import` tells a flipped type's untouched export
 * from a hand-edited one (edge case 12), but only when `<dir>` is the tree the
 * type was last imported from by this database: the hash describes that tree.
 * An export anywhere else (a backup, a scratch folder, a rollback check)
 * leaves the row alone, or the files the root still holds would stop
 * matching it and every `catalog import` after would refuse them as edited.
 * On a copy the row is left alone and the result says so: an export is a
 * read.
 *
 * Files of a type already in `<dir>` that the database did not write are
 * listed as stale and left in place. Deleting them is a decision about someone
 * else's directory.
 *
 * `--subset` writes a small tree that imports on its own (`../content/subset.ts`)
 * and records no hash: it is never the whole of any type. It refuses the
 * repository and any tree a type was imported from, where it would replace
 * the real vocabulary with five topics.
 */

export interface ExportTypeResult {
  type: ExportType;
  files: number;
  bytes: number;
  hash: string;
  /** Files of this type under `out` that the export did not write. */
  stale: string[];
  /** Whether the hash was recorded: `out` is this database's import root for the type, and it is no copy. */
  recorded: boolean;
}

export interface ExportResult {
  database: string;
  out: string;
  types: ExportTypeResult[];
  /** Whether any hash was written to `content_source`. False on a copy, and for an export outside every type's root. */
  recorded: boolean;
  /** False on a copy: nothing is recorded, wherever `out` is. */
  mayRecord: boolean;
  /** The subset written, when `--subset` asked for one. */
  subset: ExportSubset | null;
}

export async function runExport(options: {
  out: string;
  only?: readonly ExportType[];
  subset?: ExportSubset;
}): Promise<ExportResult> {
  const url = databaseUrl();
  const out = path.resolve(options.out);
  const types = options.only ?? EXPORT_TYPES;
  return withDatabase(async ({ db }) => {
    const filter = options.subset === undefined ? undefined : await subsetFilter(db, options.subset);
    if (filter !== undefined) await refuseSubsetOverRoot(db, out);
    const rendered = new Map<ExportType, ExportFile[]>();
    for (const type of types) rendered.set(type, await renderType(db, type, { filter }));
    // Every path comes from a row, and a row written through the seam is only
    // as careful as its writer, so each target is held inside `out` here, at
    // the one place that writes, before anything is written.
    const outside = [...rendered.values()]
      .flat()
      .filter((file) => {
        const relative = path.relative(out, path.resolve(out, file.path));
        return relative === "" || relative.startsWith("..") || path.isAbsolute(relative);
      })
      .map((file) => file.path);
    if (outside.length > 0) {
      throw new ExportError(`refusing to write outside ${out}: ${outside.join(", ")}`);
    }

    const record = filter === undefined && (await mayRecord(db));
    const results: ExportTypeResult[] = [];
    for (const [type, files] of rendered) {
      for (const file of files) {
        const target = path.join(out, file.path);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, file.bytes);
      }
      const written = new Set(files.map((f) => f.path));
      const stale = (await typeFiles(out, type)).filter((p) => !written.has(p));
      // The database's export, not the tree: a stale file left beside it is
      // one the next import of a flipped type should name, not skip.
      const hash = exportHash(files);
      const root = await ownRoot(db, type);
      const atRoot = root !== null && (await resolvedPath(root)) === (await resolvedPath(out));
      if (record && atRoot) await recordExport(db, type, hash);
      results.push({
        type,
        files: files.length,
        bytes: files.reduce((a, f) => a + f.bytes.length, 0),
        hash,
        stale,
        recorded: record && atRoot,
      });
    }
    return {
      database: redactUrl(url),
      out,
      types: results,
      recorded: results.some((r) => r.recorded),
      mayRecord: filter === undefined ? record : await mayRecord(db),
      subset: options.subset ?? null,
    };
  });
}

/**
 * A subset over a real tree would replace the vocabulary, the courses and the
 * notes with a handful, and the next import would archive or delete the
 * rest. So never the repository, and never a directory any type was imported
 * from, by this database or the one it was copied from.
 */
async function refuseSubsetOverRoot(db: CatalogDatabase, out: string): Promise<void> {
  const here = await resolvedPath(out);
  const roots = [REPO_ROOT];
  for (const type of EXPORT_TYPES) {
    const recorded = await recordedRoot(db, type);
    if (recorded !== null) roots.push(recorded.root);
  }
  for (const root of roots) {
    if ((await resolvedPath(root)) === here) {
      throw new ExportError(
        `export --subset refuses ${out}: it is ${root === REPO_ROOT ? "the repository" : "a tree this database's content was imported from"}, ` +
          `and a subset written there would stand in for the whole of it. Write it somewhere else (seed/ is the usual place).`,
      );
    }
  }
}

export function formatExport(result: ExportResult): string {
  const lines = [`database  ${result.database}`, `out       ${result.out}`, ""];
  if (result.subset !== null) {
    lines.push(
      `subset    topics ${result.subset.topics.join(", ")}; course ${result.subset.course}; ` +
        `session ${result.subset.session}; diagram ${result.subset.diagram}`,
      "",
    );
  }
  for (const type of result.types) {
    lines.push(
      `${type.type.padEnd(9)} ${String(type.files).padStart(4)} files  ${String(type.bytes).padStart(9)} bytes  ${type.hash.slice(0, 12)}`,
    );
    for (const stale of type.stale) lines.push(`          stale, not written by this export: ${stale}`);
  }
  const recorded = result.types.filter((t) => t.recorded).map((t) => t.type);
  const elsewhere = result.types.filter((t) => !t.recorded).map((t) => t.type);
  lines.push(
    "",
    result.subset !== null
      ? "a subset: no export hash recorded"
      : !result.mayRecord
      ? "this database is a copy: export hashes were not recorded"
      : [
          ...(recorded.length === 0 ? [] : [`export hashes recorded on content_source for ${recorded.join(", ")}`]),
          ...(elsewhere.length === 0
            ? []
            : [
                `not recorded for ${elsewhere.join(", ")}: ${result.out} is not the tree this database last ` +
                  `imported them from, and the hash describes that tree`,
              ]),
        ].join("\n"),
  );
  return lines.join("\n");
}
