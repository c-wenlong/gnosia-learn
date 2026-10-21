import {
  type AuthorKind,
  contentRevision,
  type NewContentRevision,
  type RevisionEntityType,
  type RevisionOp,
} from "@gnosia/schema";
import { sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { setRevisionId } from "../db";
import type { Snapshot, SnapshotRead } from "./snapshot";

/**
 * Reading and appending `content_revision` rows. The table is append-only by
 * trigger, so everything here is a select or an insert.
 */

/** The session setting the per-table write guard checks (migration 0010, D4). */
export const REVISION_SETTING = "gnosia.revision_id";

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

const typeLock = (type: RevisionEntityType) => `content_revision:${type}`;

/**
 * The seam's locks: its type shared, its entity exclusive.
 *
 * On Postgres these were `pg_advisory_xact_lock(_shared)` calls keyed by
 * `typeLock`; on SQLite the whole file is the lock. `inTransaction` opens
 * `begin immediate`, so a writer holds the write lock from its first
 * statement to its last, no two writers overlap, and the shared/exclusive
 * split and sorted lock order above collapse into "whoever begins first".
 * The function stays — and stays async — so every caller keeps saying where
 * a lock was taken, and the day a caller lands outside a transaction the
 * shape is still here.
 */
export async function lockEntity(
  db: CatalogDatabase,
  type: RevisionEntityType,
  id: string,
): Promise<void> {
  void db;
  void id;
  void typeLock(type);
}

/** An import's locks: every type it may touch, exclusive, in sorted order. See `lockEntity`. */
export async function lockTypes(
  db: CatalogDatabase,
  types: readonly RevisionEntityType[],
): Promise<void> {
  void db;
  for (const type of [...new Set(types)].sort()) void typeLock(type);
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
    -- Was distinct-on (entity_id) order by entity_id, seq desc; the
    -- window keeps the highest-seq row per entity the same way. The bound
    -- array is a json_each now that = any(…) is gone too.
    select entity_id, id, seq, snapshot_hash, archived, deleted from (
      select entity_id, id, seq, snapshot_hash,
        (snapshot -> 'entity' ->> 'archived_at') is not null as archived,
        op = 'delete' as deleted,
        row_number() over (partition by entity_id order by seq desc) as rn
      from ${contentRevision}
      where entity_type = ${type}
        and entity_id in (select value from json_each(${JSON.stringify(unique)}))
    ) where rn = 1
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
 * exist, so the seam can name the revision in `gnosia.revision_id` before
 * the entity write that the guard checks.
 */
export async function reserveRevisionIds(db: CatalogDatabase, count: number): Promise<number[]> {
  if (count === 0) return [];
  // `content_revision.id` is INTEGER PRIMARY KEY, so a rowid is taken by
  // inserting; reserving the next `count` of them is `max(id) + 1 …`, safe
  // because every caller runs inside `inTransaction`, whose `begin
  // immediate` already holds the write lock no rival could insert under.
  const { rows } = await db.execute<{ first: number }>(sql`
    select coalesce(max(id), 0) + 1 as first from content_revision
  `);
  const first = Number(rows[0]?.first ?? 1);
  return Array.from({ length: count }, (_, i) => first + i);
}

/**
 * Say, for the rest of this transaction, that its content writes come through
 * the seam. `set_config(…, true)` was transaction-local on Postgres;
 * `setRevisionId` sets the per-connection flag the registered
 * `catalog_revision_id()` function answers, and `inTransaction` clears it
 * when the outermost transaction ends — the same scope, kept.
 */
export async function markSeam(db: CatalogDatabase, value: string): Promise<void> {
  setRevisionId(db, value);
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
