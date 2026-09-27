import { EXPORT_TYPES, type ExportType } from "../content/layout";
import { mayRecord, recordParity } from "../content/ownership";
import { parity, type ParityResult } from "../content/parity";
import { withDatabase } from "../db";
import { databaseUrl, redactUrl } from "../env";

/**
 * `catalog parity [--only <type>] <dir>`: is the database, entity by entity,
 * what `<dir>` holds? Exit 1 on any mismatch.
 *
 * `<dir>` is the working tree when a type is about to flip, or an export when
 * proving the round trip. Each type's result is recorded on its
 * `content_source` row, because `catalog flip` requires a clean one; on a copy
 * nothing is recorded.
 */

export interface ParityCommandResult extends ParityResult {
  database: string;
  recorded: boolean;
}

export async function runParity(options: { dir: string; only?: readonly ExportType[] }): Promise<ParityCommandResult> {
  const url = databaseUrl();
  return withDatabase(async ({ db }) => {
    const result = await parity(db, options.dir, options.only ?? EXPORT_TYPES);
    const record = await mayRecord(db);
    if (record) {
      const at = new Date().toISOString();
      for (const type of result.types) {
        const mismatches = type.mismatches.length + (type.error === null ? 0 : 1);
        await recordParity(db, type.type, {
          at,
          dir: result.dir,
          clean: mismatches === 0,
          expected: type.expected,
          actual: type.actual,
          mismatches,
        });
      }
    }
    return { database: redactUrl(url), recorded: record, ...result };
  });
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
  lines.push(
    "",
    result.clean ? "parity: zero mismatches" : `parity: ${result.mismatches} mismatch(es)`,
    result.recorded ? "recorded on content_source" : "this database is a copy: nothing recorded",
  );
  return lines.join("\n");
}
