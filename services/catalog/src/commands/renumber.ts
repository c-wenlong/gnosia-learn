import { renumber, type RenumberOptions, type RenumberResult } from "../content/renumber";
import { withDatabase } from "../db";
import { databaseUrl, redactUrl } from "../env";

/**
 * `catalog renumber <list> --reason <why>`: the connection and the printing.
 * What it does and when it is needed is in `../content/renumber.ts`.
 */

export interface RenumberCommandResult extends RenumberResult {
  database: string;
}

export async function runRenumber(options: RenumberOptions): Promise<RenumberCommandResult> {
  const url = databaseUrl();
  return withDatabase(async ({ db }) => ({ database: redactUrl(url), ...(await renumber(db, options)) }));
}

export function formatRenumber(result: RenumberCommandResult): string {
  const list = result.scope === null ? result.list : `${result.list} of ${result.scope}`;
  const lines = [
    `database  ${result.database}`,
    `${list}: ${result.rows} rows, ${result.moved.length} moved, one revision each`,
  ];
  for (const move of result.moved) {
    lines.push(`  ${move.id}  ${move.from} -> ${move.to}  (revision ${move.revisionId})`);
  }
  return lines.join("\n");
}
