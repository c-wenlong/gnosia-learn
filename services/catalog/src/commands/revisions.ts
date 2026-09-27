import { REVISION_ENTITY_TYPES, type RevisionEntityType } from "@self-learn/schema";

import { isEntityType } from "../content/entities";
import {
  type Change,
  diffRevisions,
  history,
  type RevisionDiff,
  type RevisionSummary,
} from "../content/history";
import { withDatabase } from "../db";
import { databaseUrl, redactUrl } from "../env";

/**
 * `catalog history <type> <id>` and `catalog diff <rev> [<rev>]`: what git log
 * and git diff gave for content in files, read from `content_revision`.
 */

export class RevisionUsage extends Error {}

export interface HistoryResult {
  database: string;
  type: RevisionEntityType;
  id: string;
  revisions: RevisionSummary[];
}

export function parseEntityType(raw: string | undefined): RevisionEntityType {
  if (raw === undefined || !isEntityType(raw)) {
    throw new RevisionUsage(
      `history needs a type, one of ${REVISION_ENTITY_TYPES.join(", ")}` +
        (raw === undefined ? "" : `, not "${raw}"`),
    );
  }
  return raw;
}

export function parseRevisionId(raw: string | undefined, which: string): number {
  if (raw === undefined || !/^[1-9][0-9]*$/.test(raw)) {
    throw new RevisionUsage(`diff needs ${which} as a revision id (a positive integer)`);
  }
  return Number(raw);
}

export async function runHistory(type: RevisionEntityType, id: string): Promise<HistoryResult> {
  const url = databaseUrl();
  return withDatabase(async ({ db }) => ({
    database: redactUrl(url),
    type,
    id,
    revisions: await history(db, type, id),
  }));
}

export function formatHistory(result: HistoryResult): string {
  if (result.revisions.length === 0) {
    return `${result.type} ${result.id}: no revisions. It has not been written since revisions began, or it does not exist.`;
  }
  const lines = [`${result.type} ${result.id}: ${result.revisions.length} revisions, oldest first`, ""];
  for (const rev of result.revisions) {
    lines.push(
      `#${rev.id}  seq ${rev.seq}  ${rev.op.padEnd(7)}  ${rev.createdAt}  ${rev.authorKind}:${rev.author}`,
    );
    lines.push(`    ${rev.reason}`);
    const provenance = [
      rev.jobId === null ? null : `job ${rev.jobId}`,
      rev.sessionId === null ? null : `session ${rev.sessionId}`,
    ].filter((x) => x !== null);
    if (provenance.length > 0) lines.push(`    ${provenance.join(", ")}`);
  }
  return lines.join("\n");
}

export interface DiffResult extends RevisionDiff {
  database: string;
}

export async function runDiff(first: number, second?: number): Promise<DiffResult> {
  const url = databaseUrl();
  return withDatabase(async ({ db }) => ({
    database: redactUrl(url),
    ...(await diffRevisions(db, first, second)),
  }));
}

const CONTEXT = 2;

export function formatDiff(result: DiffResult): string {
  const head = (rev: RevisionSummary | null) =>
    rev === null ? "(nothing)" : `#${rev.id} ${rev.entityType} ${rev.entityId} seq ${rev.seq} (${rev.op})`;
  const lines = [`from ${head(result.from)}`, `to   ${head(result.to)}`, ""];
  if (result.changes.length === 0) {
    lines.push("no differences");
    return lines.join("\n");
  }
  for (const change of result.changes) lines.push(...formatChange(change));
  return lines.join("\n");
}

function formatChange(change: Change): string[] {
  const show = (value: unknown) => JSON.stringify(value);
  if (change.kind === "added") return [`+ ${change.path} ${show(change.after)}`];
  if (change.kind === "removed") return [`- ${change.path} ${show(change.before)}`];
  if (change.lines === undefined) {
    return [`~ ${change.path}`, `    - ${show(change.before)}`, `    + ${show(change.after)}`];
  }
  // A line diff with only the changed lines and a little context, the way a
  // unified diff reads.
  const out = [`~ ${change.path}`];
  const keep = new Set<number>();
  change.lines.forEach((line, index) => {
    if (line.op === " ") return;
    for (let k = index - CONTEXT; k <= index + CONTEXT; k += 1) keep.add(k);
  });
  let skipped = false;
  change.lines.forEach((line, index) => {
    if (!keep.has(index)) {
      skipped = true;
      return;
    }
    if (skipped) out.push("    ...");
    skipped = false;
    out.push(`    ${line.op} ${line.text}`);
  });
  return out;
}
