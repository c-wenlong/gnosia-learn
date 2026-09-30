import type { IndexSource } from "@self-learn/schema";

import path from "node:path";

import { withDatabase } from "../db";
import { databaseUrl, REPO_ROOT, redactUrl } from "../env";
import { runIndex, type RunResult } from "../index/run";
import type { SourceWrite } from "../index/writer";

/**
 * `catalog import [<dir>]`, and `catalog index`, its old name: one code path.
 *
 * `import` reads any directory laid out like the repository, which is what
 * `catalog export --out <dir>` writes, so an export can be read back
 * (docs/CONTENT-MIGRATION.md 0.5); with no directory it reads the repository
 * itself, which is all `index` ever did. Phase 2 made `import` the name, since
 * once the database owns content the files are one format it imports, not
 * what it indexes; `index` stays as an alias that says so once. Either way
 * every source writes through the revision writer, a type the database owns
 * is skipped or refused by its `content_source` row, and the pinned manimkc,
 * remotionkc and tldrawkc checkouts are the repository's, since an export directory
 * holds no tools.
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
  remotionkcRoot: string;
  sources: SourceWrite[];
  /** Sources `--only` did not name but that had to run, and why they had to. */
  addedForSafety: string[];
  /** Sources it did not name that had to run *first*, for a different reason. */
  addedAsPrerequisite: string[];
  /** Sources that could not run in this checkout, and why leaving them out was safe. */
  skipped: { source: string; reason: string }[];
  totals: { written: number; deleted: number };
}

export interface IndexOptions {
  only?: readonly IndexSource[];
  manimkcRoot?: string;
  remotionkcRoot?: string;
}

export interface ImportOptions extends IndexOptions {
  /** The directory to read, in the repository's layout. */
  dir: string;
}

export async function runIndexCommand(options: IndexOptions = {}): Promise<IndexResult> {
  return runImportCommand({ ...options, dir: REPO_ROOT });
}

export async function runImportCommand(options: ImportOptions): Promise<IndexResult> {
  const url = databaseUrl();
  return withDatabase(async ({ db }) => {
    const result: RunResult = await runIndex(db, {
      repoRoot: path.resolve(options.dir),
      toolsRoot: REPO_ROOT,
      only: options.only,
      manimkcRoot: options.manimkcRoot,
      remotionkcRoot: options.remotionkcRoot,
    });
    return {
      database: redactUrl(url),
      repoRoot: result.repoRoot,
      manimkcRoot: result.manimkcRoot,
      remotionkcRoot: result.remotionkcRoot,
      sources: result.sources,
      addedForSafety: result.addedForSafety,
      addedAsPrerequisite: result.addedAsPrerequisite,
      skipped: result.skipped,
      totals: result.totals,
    };
  });
}

export function formatIndex(result: IndexResult): string {
  const lines = [
    `database        ${result.database}`,
    `read from       ${result.repoRoot}`,
    `manimkc root    ${result.manimkcRoot}`,
    `remotionkc root ${result.remotionkcRoot}`,
    "",
  ];
  for (const skip of result.skipped) {
    lines.push(`skipping ${skip.source}: ${skip.reason}.`, "");
  }
  if (result.addedAsPrerequisite.length > 0) {
    lines.push(
      `also running ${result.addedAsPrerequisite.join(", ")} first: the selected ` +
        `sources read rows it writes, and joining onto a stale set of them is a ` +
        `wrong answer rather than a missing one.`,
      "",
    );
  }
  if (result.addedForSafety.length > 0) {
    lines.push(
      `also running ${result.addedForSafety.join(", ")}: they point at rows the ` +
        `selected sources may prune, and a prune cascades.`,
      "",
    );
  }

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
    for (const key of source.archivedKeys) lines.push(`           - archived ${key}`);
    const archivedCount = Object.values(source.archived).reduce((a, b) => a + b, 0);
    if (archivedCount > source.archivedKeys.length) {
      lines.push(`           - and ${archivedCount - source.archivedKeys.length} more archived`);
    }
    const revisions = Object.entries(source.revisions);
    if (revisions.length > 0) {
      lines.push(`           revisions: ${revisions.map(([t, n]) => `${t} ${n}`).join(", ")}`);
    }
  }

  lines.push("");
  lines.push(`${result.totals.written} rows written, ${result.totals.deleted} removed`);
  return lines.join("\n");
}

/** Deletions that produced a key, so the "and N more" line counts the same thing. */
function countEntityDeletes(source: SourceWrite): number {
  const entities = new Set(["topic", "tag", "concept", "collection", "curriculum_item", "asset"]);
  return Object.entries(source.deleted)
    .filter(([table]) => entities.has(table))
    .reduce((a, [, n]) => a + n, 0);
}
