import {
  type AuthorKind,
  contentRevision,
  type NewContentRevision,
  type RevisionEntityType,
  type RevisionOp,
} from "@self-learn/schema";
import { sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import type { Snapshot, SnapshotRead } from "./snapshot";

/**
 * Reading and appending `content_revision` rows. The table is append-only by
 * trigger, so everything here is a select or an insert.
 */

/** The session setting the per-table write guard checks (migration 0010, D4). */
export const REVISION_SETTING = "self_learn.revision_id";

export interface LatestRevision {
  id: number;
  seq: number;
  hash: string;
  archived: boolean;
}

/** The newest revision of each entity named, keyed by entity id. */
export async function latestRevisions(
  db: CatalogDatabase,
  type: RevisionEntityType,
  ids: readonly string[],
): Promise<Map<string, LatestRevision>> {
  const out = new Map<string, LatestRevision>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return out;
  const { rows } = await db.execute<{
    entity_id: string;
    id: string | number;
    seq: number;
    snapshot_hash: string;
    archived: boolean;
  }>(sql`
    select distinct on (entity_id)
      entity_id, id, seq, snapshot_hash,
      (snapshot -> 'entity' ->> 'archived_at') is not null as archived
    from ${contentRevision}
    where entity_type = ${type} and entity_id = any(${sql.param(unique)}::text[])
    order by entity_id, seq desc
  `);
  for (const row of rows) {
    out.set(row.entity_id, {
      id: Number(row.id),
      seq: row.seq,
      hash: row.snapshot_hash,
      archived: row.archived,
    });
  }
  return out;
}

/**
 * Take revision ids from the table's own identity sequence before the rows
 * exist, so the seam can name the revision in `self_learn.revision_id` before
 * the entity write that the guard checks.
 */
export async function reserveRevisionIds(db: CatalogDatabase, count: number): Promise<number[]> {
  if (count === 0) return [];
  const { rows } = await db.execute<{ id: string | number }>(sql`
    select nextval(pg_get_serial_sequence('content_revision', 'id')) as id
    from generate_series(1, ${count})
  `);
  return rows.map((row) => Number(row.id));
}

/**
 * Say, for the rest of this transaction, that its content writes come through
 * the seam. `is_local = true`, so the setting ends with the transaction and a
 * pooled connection cannot carry it into the next caller's writes.
 */
export async function markSeam(db: CatalogDatabase, value: string): Promise<void> {
  await db.execute(sql`select set_config(${REVISION_SETTING}, ${value}, true)`);
}

export interface PendingRevision {
  id: number;
  type: RevisionEntityType;
  entityId: string;
  read: SnapshotRead;
  latest: LatestRevision | undefined;
  op: RevisionOp;
  authorKind: AuthorKind;
  author: string;
  reason: string;
  jobId?: string | null;
  sessionId?: string | null;
}

export function revisionRow(pending: PendingRevision): NewContentRevision {
  return {
    id: pending.id,
    ownerId: pending.read.ownerId,
    entityType: pending.type,
    entityId: pending.entityId,
    seq: (pending.latest?.seq ?? 0) + 1,
    previousId: pending.latest?.id ?? null,
    op: pending.op,
    snapshot: pending.read.snapshot satisfies Snapshot,
    snapshotHash: pending.read.hash,
    authorKind: pending.authorKind,
    author: pending.author,
    reason: pending.reason,
    jobId: pending.jobId ?? null,
    sessionId: pending.sessionId ?? null,
  };
}

export async function appendRevisions(
  db: CatalogDatabase,
  pending: readonly PendingRevision[],
): Promise<void> {
  for (let i = 0; i < pending.length; i += 200) {
    const part = pending.slice(i, i + 200).map(revisionRow);
    if (part.length > 0) await db.insert(contentRevision).values(part);
  }
}

/**
 * What kind of write turned `latest` into `read`, when the caller did not say.
 * An archive and a restore are named for what they did; anything else is the
 * caller's default (`update` from the seam, `import` from an index run), and a
 * first revision of something that did not exist before is `create`.
 */
export function deriveOp(
  latest: LatestRevision | undefined,
  read: SnapshotRead,
  fallback: RevisionOp,
  existedBefore: boolean,
): RevisionOp {
  const wasArchived = latest?.archived ?? false;
  if (read.archived && !wasArchived && (latest !== undefined || existedBefore)) return "archive";
  if (!read.archived && wasArchived) return "restore";
  if (latest === undefined && !existedBefore && fallback !== "import") return "create";
  return fallback;
}
