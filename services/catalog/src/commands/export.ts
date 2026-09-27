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
import { mayRecord, recordExport } from "../content/ownership";
import { withDatabase } from "../db";
import { databaseUrl, redactUrl } from "../env";

/**
 * `catalog export [--only <type>] --out <dir>`: the database written back out
 * as the files it was imported from (docs/CONTENT-MIGRATION.md 0.5).
 *
 * Topics, tags and courses are written from rows. Concept notes, session logs
 * and diagrams are copied from the directory their import read, checked
 * against the sha256 each row recorded, until Tracks C and D move their text
 * into the database; the export refuses a file it cannot vouch for. Every type
 * is rendered before any file is written, so a refusal writes nothing.
 *
 * The hash of what was written is recorded on the type's `content_source`
 * row, which is how `catalog import` tells a flipped type's untouched export
 * from a hand-edited one (edge case 12). On a copy the row is left alone and
 * the result says so: an export is a read.
 *
 * Files of a type already in `<dir>` that the database did not write are
 * listed as stale and left in place. Deleting them is a decision about someone
 * else's directory.
 */

export interface ExportTypeResult {
  type: ExportType;
  files: number;
  bytes: number;
  hash: string;
  /** Files of this type under `out` that the export did not write. */
  stale: string[];
}

export interface ExportResult {
  database: string;
  out: string;
  types: ExportTypeResult[];
  /** Whether the hashes were written to `content_source`. False on a copy. */
  recorded: boolean;
}

export async function runExport(options: { out: string; only?: readonly ExportType[] }): Promise<ExportResult> {
  const url = databaseUrl();
  const out = path.resolve(options.out);
  const types = options.only ?? EXPORT_TYPES;
  return withDatabase(async ({ db }) => {
    const rendered = new Map<ExportType, ExportFile[]>();
    for (const type of types) rendered.set(type, await renderType(db, type));
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

    const record = await mayRecord(db);
    const results: ExportTypeResult[] = [];
    for (const [type, files] of rendered) {
      for (const file of files) {
        const target = path.join(out, file.path);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, file.bytes);
      }
      const written = new Set(files.map((f) => f.path));
      const hash = exportHash(files);
      if (record) await recordExport(db, type, hash);
      results.push({
        type,
        files: files.length,
        bytes: files.reduce((a, f) => a + f.bytes.length, 0),
        hash,
        stale: (await typeFiles(out, type)).filter((p) => !written.has(p)),
      });
    }
    return { database: redactUrl(url), out, types: results, recorded: record };
  });
}

export function formatExport(result: ExportResult): string {
  const lines = [`database  ${result.database}`, `out       ${result.out}`, ""];
  for (const type of result.types) {
    lines.push(
      `${type.type.padEnd(9)} ${String(type.files).padStart(4)} files  ${String(type.bytes).padStart(9)} bytes  ${type.hash.slice(0, 12)}`,
    );
    for (const stale of type.stale) lines.push(`          stale, not written by this export: ${stale}`);
  }
  lines.push(
    "",
    result.recorded
      ? "export hashes recorded on content_source"
      : "this database is a copy: export hashes were not recorded",
  );
  return lines.join("\n");
}
