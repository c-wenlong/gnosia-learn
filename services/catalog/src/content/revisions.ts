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
  /** The latest revision records the entity's deletion, so whatever exists now is new. */
  deleted: boolean;
}

/*
 * Locks. A revision's `seq` is the latest one plus one, so two writers of the
 * same entity that both read the latest before either appends would pick the
 * same number, and the unique index would abort one of them. Every revision
 * writer therefore takes a transaction-scoped advisory lock before it reads:
 *
 * - the seam takes its entity type *shared* and the one entity exclusive, so
 *   seam writes of different entities run side by side;
 * - an import takes each entity type it may touch *exclusive*, all of them,
 *   in sorted order, before its first write, so it waits for seam writes in
 *   flight and they wait for it.
 *
 * Both take these before any row lock, and an import takes every one it needs
 * up front in one order, so no two writers can each hold what the other wants.
 *
 * **The lock order.** Every writer takes its advisory locks in one global
 * order and never takes one out of it: by entity type, sorted by code unit;
 * within a type, the type lock before any entity lock; entity locks by id.
 * Concretely:
 *
 * - `writeContent` takes one type shared, then one entity: two locks, in order;
 * - `writeContents` sorts its inputs by (type, id) and takes every pair before
 *   its first write, so a composite writer of a course and its items holds
 *   `collection` before `curriculum_item` whatever order it writes them in;
 * - an import takes its types exclusive in sorted order (`lockTypes`) and no
 *   entity locks.
 *
 * A cycle of waiters needs someone to wait for a lock that sorts before one
 * it already holds, and no writer ever does, so none can form between these
 * three, however many run at once. Re-taking a type lock a writer already
 * holds shared is granted at once, since Postgres counts a session's own
 * locks. What breaks the order is two `writeContent` calls in one outer
 * transaction that write a later type before an earlier one: the second
 * call's type lock then sorts before one already held. That is what
 * `writeContents` is for, and `test/content-seam.test.ts` holds both the
 * deadlock and its absence.
 */

function lockKey(key: string) {
  return sql`hashtextextended(${key}, 0)`;
}

const typeLock = (type: RevisionEntityType) => `content_revision:${type}`;

/** The seam's locks: its type shared, its entity exclusive. */
export async function lockEntity(
  db: CatalogDatabase,
  type: RevisionEntityType,
  id: string,
): Promise<void> {
  await db.execute(sql`select pg_advisory_xact_lock_shared(${lockKey(typeLock(type))})`);
  await db.execute(sql`select pg_advisory_xact_lock(${lockKey(`${typeLock(type)}:${id}`)})`);
}

/** An import's locks: every type it may touch, exclusive, in sorted order. */
export async function lockTypes(
  db: CatalogDatabase,
  types: readonly RevisionEntityType[],
): Promise<void> {
  for (const type of [...new Set(types)].sort()) {
    await db.execute(sql`select pg_advisory_xact_lock(${lockKey(typeLock(type))})`);
  }
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
    deleted: boolean;
  }>(sql`
    select distinct on (entity_id)
      entity_id, id, seq, snapshot_hash,
      (snapshot -> 'entity' ->> 'archived_at') is not null as archived,
      op = 'delete' as deleted
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
      deleted: row.deleted,
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
 * Whether `read` needs a revision on top of `latest`: it has none, its last
 * one records a deletion, or the snapshot moved.
 */
export function needsRevision(latest: LatestRevision | undefined, read: SnapshotRead): boolean {
  return latest === undefined || latest.deleted || latest.hash !== read.hash;
}

/**
 * What kind of write turned `latest` into `read`, when the caller did not say.
 * An archive and a restore are named for what they did; anything else is the
 * caller's default (`update` from the seam, `import` from an index run), and a
 * seam write of something that had no live history is `create`.
 */
export function deriveOp(
  latest: LatestRevision | undefined,
  read: SnapshotRead,
  fallback: RevisionOp,
  existedBefore: boolean,
): RevisionOp {
  const gone = latest === undefined || latest.deleted;
  const wasArchived = !gone && latest.archived;
  if (read.archived && !wasArchived && (!gone || existedBefore)) return "archive";
  if (!read.archived && wasArchived) return "restore";
  if (gone && !existedBefore && fallback !== "import") return "create";
  return fallback;
}
