import type { IndexSource } from "@self-learn/schema";

import { withDatabase } from "../db";
import { databaseUrl, redactUrl } from "../env";
import { runIndex, type RunResult } from "../index/run";
import type { SourceWrite } from "../index/writer";

/**
 * `catalog index` — read the content trees, write the derived rows.
 *
 * Reports two things per source, and the second matters more than the first:
 * what it wrote, and what it removed. A removal is the catalog agreeing that
 * something is gone, and when that is a surprise it is the only warning anyone
 * gets, so pruned entity keys are printed rather than counted.
 */

export interface IndexResult {
  database: string;
  repoRoot: string;
  manimkcRoot: string;
  sources: SourceWrite[];
  totals: { written: number; deleted: number };
}

export interface IndexOptions {
  only?: readonly IndexSource[];
  manimkcRoot?: string;
}

export async function runIndexCommand(options: IndexOptions = {}): Promise<IndexResult> {
  const url = databaseUrl();
  return withDatabase(async ({ db }) => {
    const result: RunResult = await runIndex(db, {
      only: options.only,
      manimkcRoot: options.manimkcRoot,
    });
    return {
      database: redactUrl(url),
      repoRoot: result.repoRoot,
      manimkcRoot: result.manimkcRoot,
      sources: result.sources,
      totals: result.totals,
    };
  });
}

export function formatIndex(result: IndexResult): string {
  const lines = [`database     ${result.database}`, `manimkc root ${result.manimkcRoot}`, ""];

  for (const source of result.sources) {
    lines.push(
      `${source.source.padEnd(10)} ${String(source.totalWritten).padStart(5)} written` +
        (source.totalDeleted > 0 ? `, ${source.totalDeleted} deleted` : ""),
    );
    const written = Object.entries(source.written);
    if (written.length > 0) {
      lines.push(`           ${written.map(([t, n]) => `${t} ${n}`).join(", ")}`);
    }
    for (const note of source.notes) lines.push(`           ${note}`);
    for (const key of source.deletedKeys) lines.push(`           - deleted ${key}`);
    const shown = source.deletedKeys.length;
    const entityDeletes = countEntityDeletes(source);
    if (entityDeletes > shown) lines.push(`           - and ${entityDeletes - shown} more`);
  }

  lines.push("");
  lines.push(`${result.totals.written} rows written, ${result.totals.deleted} removed`);
  return lines.join("\n");
}

/** Deletions that produced a key, so the "and N more" line counts the same thing. */
function countEntityDeletes(source: SourceWrite): number {
  const entities = new Set(["topic", "concept", "collection", "curriculum_item", "asset"]);
  return Object.entries(source.deleted)
    .filter(([table]) => entities.has(table))
    .reduce((a, [, n]) => a + n, 0);
}
