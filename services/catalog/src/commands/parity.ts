import { EXPORT_TYPES, type ExportType } from "../content/layout";
import { parity, type ParityResult } from "../content/parity";
import { withDatabase } from "../db";
import { databaseUrl, redactUrl } from "../env";

/**
 * `catalog parity [--only <type>] <dir>`: is the database, entity by entity,
 * what `<dir>` holds? Exit 1 on any mismatch.
 *
 * `<dir>` is the working tree when a type is about to flip, or an export when
 * proving the round trip. A read and nothing more: `catalog flip` runs the
 * same check itself, against the files the type was last imported from, and
 * records that result on the type's row.
 */

export interface ParityCommandResult extends ParityResult {
  database: string;
}

export async function runParity(options: { dir: string; only?: readonly ExportType[] }): Promise<ParityCommandResult> {
  const url = databaseUrl();
  return withDatabase(async ({ db }) => ({
    database: redactUrl(url),
    ...(await parity(db, options.dir, options.only ?? EXPORT_TYPES)),
  }));
}

export function formatParity(result: ParityCommandResult): string {
  const lines = [`database  ${result.database}`, `dir       ${result.dir}`, ""];
  for (const type of result.types) {
    const count = (counts: Record<string, number>) =>
      Object.entries(counts)
        .map(([key, n]) => `${n} ${key}`)
        .join(", ");
    lines.push(
      `${type.type.padEnd(9)} database ${String(type.expected).padStart(4)}  directory ${String(type.actual).padStart(4)}  ` +
        `mismatches ${type.mismatches.length}  byte-identical files ${type.identicalFiles} of ${type.files}`,
    );
    if (Object.keys(type.counts.expected).length > 0) lines.push(`          database:  ${count(type.counts.expected)}`);
    if (Object.keys(type.counts.actual).length > 0) lines.push(`          directory: ${count(type.counts.actual)}`);
    if (type.error !== null) lines.push(`          cannot render: ${type.error.replaceAll("\n", "\n          ")}`);
    for (const mismatch of type.mismatches) {
      lines.push(`          ${mismatch.kind.padEnd(10)} ${mismatch.id}  ${mismatch.detail}`);
    }
  }
  lines.push("", result.clean ? "parity: zero mismatches" : `parity: ${result.mismatches} mismatch(es)`);
  return lines.join("\n");
}
