import { flip, type FlipOptions, type FlipResult } from "../content/flip";
import { withDatabase } from "../db";
import { databaseUrl, redactUrl } from "../env";

/**
 * `catalog flip <type> [--strict] [--waive <rule> --reason <why>]...`: the
 * database takes ownership of one content type. The rules are in
 * `../content/flip.ts`; this is the connection and the printing.
 */

export interface FlipCommandResult extends FlipResult {
  database: string;
}

export async function runFlip(options: FlipOptions): Promise<FlipCommandResult> {
  const url = databaseUrl();
  return withDatabase(async ({ db }) => ({ database: redactUrl(url), ...(await flip(db, options)) }));
}

export function formatFlip(result: FlipCommandResult): string {
  const lines = [
    `database  ${result.database}`,
    `${result.type} is owned by the database${result.already ? " (already was; guards re-armed)" : ""}, since ${result.flippedAt}`,
    result.parity === null
      ? "parity    none checked: re-armed without reading a tree, since the database owns this type"
      : `parity    clean against ${result.parity.dir}, the files it was last imported from`,
    `guards    ${result.guardsArmed.length === 0 ? "none for this type" : result.guardsArmed.join(", ")}`,
    `rules     ${result.rulesArmed.length === 0 ? "none armed" : result.rulesArmed.join(", ")}`,
  ];
  for (const waiver of result.waivers) lines.push(`waived    ${waiver.rule}: ${waiver.reason} (${waiver.at})`);
  if (result.rearmed) return lines.join("\n");
  lines.push(
    result.export.recorded
      ? `export    ${result.export.hash.slice(0, 12)} recorded: the next import skips these files`
      : "export    this database is a copy: the export hash was not recorded",
  );
  if (result.export.rewrites.length > 0 && result.parity !== null) {
    lines.push(
      `          ${result.export.rewrites.length} file(s) hold the same content in other bytes, and the next ` +
        `\`catalog export --only ${result.type} --out ${result.parity.dir}\` rewrites them: ` +
        result.export.rewrites.join(", "),
    );
  }
  return lines.join("\n");
}
