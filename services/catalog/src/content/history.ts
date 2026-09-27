import { contentRevision, type RevisionEntityType } from "@self-learn/schema";
import { and, asc, eq, inArray } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import type { JsonValue, Snapshot } from "./snapshot";

/**
 * Reading the revision history back: `catalog history` and `catalog diff`.
 *
 * A diff is a comparison of two snapshots, which is the point of storing whole
 * snapshots rather than deltas (D4): structured fields compare as values,
 * nested objects (a course's metadata, a diagram's document) recurse by key,
 * link rows compare as sets, and a string with a newline in it (a note's body)
 * gets a line diff.
 */

export interface RevisionSummary {
  id: number;
  seq: number;
  entityType: string;
  entityId: string;
  op: string;
  authorKind: string;
  author: string;
  reason: string;
  previousId: number | null;
  jobId: string | null;
  sessionId: string | null;
  snapshotHash: string;
  createdAt: string;
}

export async function history(
  db: CatalogDatabase,
  type: RevisionEntityType,
  id: string,
): Promise<RevisionSummary[]> {
  const rows = await db
    .select()
    .from(contentRevision)
    .where(and(eq(contentRevision.entityType, type), eq(contentRevision.entityId, id)))
    .orderBy(asc(contentRevision.seq));
  return rows.map(summary);
}

function summary(row: typeof contentRevision.$inferSelect): RevisionSummary {
  return {
    id: row.id,
    seq: row.seq,
    entityType: row.entityType,
    entityId: row.entityId,
    op: row.op,
    authorKind: row.authorKind,
    author: row.author,
    reason: row.reason,
    previousId: row.previousId,
    jobId: row.jobId,
    sessionId: row.sessionId,
    snapshotHash: row.snapshotHash,
    createdAt: row.createdAt.toISOString(),
  };
}

export type LineOp = " " | "-" | "+";

export interface Change {
  /** Dotted path into the snapshot: `entity.title`, `entity.metadata.tags`, `links.asset_topic`. */
  path: string;
  kind: "added" | "removed" | "changed";
  before?: JsonValue;
  after?: JsonValue;
  /** For a multi-line string: every line, marked kept, removed or added. */
  lines?: { op: LineOp; text: string }[];
}

export interface RevisionDiff {
  from: RevisionSummary | null;
  to: RevisionSummary;
  changes: Change[];
}

export class RevisionNotFound extends Error {}

/**
 * The diff between two revisions, or between one and the revision it
 * replaced. Two revisions of different entities are allowed, since comparing
 * a renamed entity with its old self is exactly the case that needs it.
 */
export async function diffRevisions(
  db: CatalogDatabase,
  first: number,
  second?: number,
): Promise<RevisionDiff> {
  const ids = second === undefined ? [first] : [first, second];
  const rows = await db.select().from(contentRevision).where(inArray(contentRevision.id, ids));
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const id of ids) {
    if (!byId.has(id)) throw new RevisionNotFound(`no revision ${id}`);
  }

  let fromRow: typeof contentRevision.$inferSelect | undefined;
  let toRow: typeof contentRevision.$inferSelect;
  if (second === undefined) {
    toRow = byId.get(first)!;
    if (toRow.previousId !== null) {
      [fromRow] = await db
        .select()
        .from(contentRevision)
        .where(eq(contentRevision.id, toRow.previousId));
    }
  } else {
    fromRow = byId.get(first)!;
    toRow = byId.get(second)!;
  }

  return {
    from: fromRow === undefined ? null : summary(fromRow),
    to: summary(toRow),
    changes: diffSnapshots(
      (fromRow?.snapshot as Snapshot | undefined) ?? null,
      toRow.snapshot as Snapshot,
    ),
  };
}

/** Every difference between two snapshots. `before` null means the entity is new. */
export function diffSnapshots(before: Snapshot | null, after: Snapshot): Change[] {
  const changes: Change[] = [];
  diffValue("entity", before?.entity ?? {}, after.entity, changes);

  const names = new Set([...Object.keys(before?.links ?? {}), ...Object.keys(after.links)]);
  for (const name of [...names].sort()) {
    const was = new Map((before?.links[name] ?? []).map((row) => [JSON.stringify(row), row]));
    const now = new Map((after.links[name] ?? []).map((row) => [JSON.stringify(row), row]));
    for (const [key, row] of was) {
      if (!now.has(key)) changes.push({ path: `links.${name}`, kind: "removed", before: row });
    }
    for (const [key, row] of now) {
      if (!was.has(key)) changes.push({ path: `links.${name}`, kind: "added", after: row });
    }
  }
  return changes;
}

function isObject(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function diffValue(
  path: string,
  before: JsonValue | undefined,
  after: JsonValue | undefined,
  out: Change[],
): void {
  if (isObject(before) && isObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort()) {
      diffValue(`${path}.${key}`, before[key], after[key], out);
    }
    return;
  }
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  if (before === undefined) {
    out.push({ path, kind: "added", after });
    return;
  }
  if (after === undefined) {
    out.push({ path, kind: "removed", before });
    return;
  }
  const change: Change = { path, kind: "changed", before, after };
  if (
    (typeof before === "string" || before === null) &&
    (typeof after === "string" || after === null) &&
    `${before ?? ""}${after ?? ""}`.includes("\n")
  ) {
    change.lines = lineDiff(before ?? "", after ?? "");
  }
  out.push(change);
}

/**
 * A line diff by longest common subsequence. Quadratic, which is fine for the
 * sizes it sees (a note is about a kilobyte, the longest a few hundred lines)
 * and keeps it a dozen lines with no dependency.
 */
export function lineDiff(before: string, after: string): { op: LineOp; text: string }[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: { op: LineOp; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: " ", text: a[i]! });
      i += 1;
      j += 1;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ op: "-", text: a[i]! });
      i += 1;
    } else {
      out.push({ op: "+", text: b[j]! });
      j += 1;
    }
  }
  while (i < n) out.push({ op: "-", text: a[i++]! });
  while (j < m) out.push({ op: "+", text: b[j++]! });
  return out;
}
