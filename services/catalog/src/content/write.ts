import {
  AUTHOR_KINDS,
  type AuthorKind,
  COMMONS_OWNER,
  readableOwners,
  REVISION_OPS,
  type RevisionEntityType,
  type RevisionOp,
} from "@self-learn/schema";
import { eq, getTableColumns, inArray } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { ensureLearner } from "../state/learner";
import { BLOB_KEY_COLUMNS, column, ENTITIES, isEntityType, LINK_FAR_ENDS, ROW_FAR_ENDS } from "./entities";
import {
  appendRevisions,
  deriveOp,
  latestRevisions,
  lockEntity,
  markSeam,
  needsRevision,
  reserveRevisionIds,
  type PendingRevision,
} from "./revisions";
import { readSnapshots, type Snapshot, type SnapshotRead } from "./snapshot";
import { updateSet } from "./upsert";

/**
 * The one write seam for authored content (docs/CONTENT-MIGRATION.md 0.3).
 *
 * Every phase 1 writer calls this and nothing else writes a content table: a
 * CLI verb a person or their session ran, the studio's Accept, the Draw press.
 * One call is one transaction that
 *
 * 1. refuses an empty reason, and refuses when `base` is not the entity's
 *    latest revision (edge case 16: no merge is attempted, the writer re-reads
 *    and reapplies);
 * 2. sets `self_learn.revision_id`, which the per-table guard triggers check
 *    once a type flips (D4);
 * 3. upserts the entity, stamped with `owner_id = owner`, and replaces any
 *    owned links the caller supplied;
 * 4. reads the entity back and appends a `content_revision` with the next
 *    `seq`, the previous revision's id, the snapshot and its hash.
 *
 * **The owner** (phase 4 of docs/CONTENT-MIGRATION.md). Every write names
 * whose content it is, and the row is stamped with it. Ids are global (D3,
 * D23), so an upsert naming a slug another owner already holds would
 * otherwise take their row over; the seam refuses that instead, with
 * `foreign-owner`, before anything is written. With one owner every row is
 * `local` and every CLI writes as `CLI_OWNER`, so nothing is refused today.
 *
 * A write that leaves the snapshot exactly as the latest revision has it
 * appends nothing, touches nothing, and says so: the writes run in a savepoint
 * that is rolled back, so not even `updated_at` moves.
 *
 * Handed a transaction rather than the database, it runs as a savepoint of
 * that transaction and commits with it. Two such calls in one outer
 * transaction take their locks in call order, though, and a caller that
 * writes a topic and then a tag can deadlock against an import that locks
 * `tag` before `topic`. A write of several entities therefore goes through
 * `writeContents`, which takes every lock first, in the one order everything
 * else uses.
 */

/** Thrown inside the savepoint to roll back a write that changed nothing. */
class Unchanged extends Error {}

export class ContentWriteError extends Error {
  constructor(
    readonly code: "empty-reason" | "empty-author" | "empty-owner" | "foreign-owner" | "stale-base" | "invalid" | "key-mismatch",
    message: string,
  ) {
    super(message);
    this.name = "ContentWriteError";
  }
}

export interface ContentNext {
  /** The whole row, keyed as drizzle keys it. Omitted columns take their defaults. */
  row: Record<string, unknown>;
  /**
   * Owned links to replace, by SQL table name (`concept_prerequisite`). A table
   * left out keeps its rows; a table given as `[]` loses them. The parent
   * column is filled in, so a row names only the far end.
   */
  links?: Record<string, Record<string, unknown>[]>;
}

export interface WriteContentInput {
  type: RevisionEntityType;
  id: string;
  next: ContentNext;
  /** The revision the writer started from, or null for "this has no revision yet". */
  base: number | null;
  /**
   * Whose content this is: the learner id stamped on the row's `owner_id`.
   * Required, never defaulted, so a writer cannot leave it to the column's
   * `'local'` by forgetting it. The CLIs pass `CLI_OWNER` (`./scope.ts`); a
   * web route would pass `currentOwner()`. A row another owner holds is
   * refused (`foreign-owner`).
   */
  owner: string;
  author: string;
  authorKind: AuthorKind;
  reason: string;
  /** Named explicitly for a rename; otherwise derived from what changed. */
  op?: RevisionOp;
  jobId?: string;
  sessionId?: string;
}

export interface WriteContentResult {
  type: RevisionEntityType;
  id: string;
  /** False when the write left the entity exactly as its latest revision records it. */
  changed: boolean;
  /** The entity's latest revision after the write: the one appended, or the unchanged latest. */
  revisionId: number;
  seq: number;
  /** What the appended revision records, or null when nothing was appended. */
  op: RevisionOp | null;
  hash: string;
  snapshot: Snapshot;
}

export async function writeContent(
  db: CatalogDatabase,
  input: WriteContentInput,
): Promise<WriteContentResult> {
  validate(input);

  return db.transaction(async (tx) => {
    // Serialise writers of one entity, including two that both create it
    // (there is no row yet for FOR UPDATE to lock), and wait for an import of
    // this type. Transaction-scoped, so it cannot outlive a failure.
    await lockEntity(tx, input.type, input.id);
    await assertReadableFarEnds(tx, input);
    return writeLocked(tx, input);
  });
}

/**
 * Several entities in one transaction: all written, or none (tracks B and D
 * write a course with its items, a diagram with its assets).
 *
 * Every lock is taken before the first write, in one global order: by type,
 * then by id (see "Locks" in `revisions.ts` for why that order cannot
 * deadlock against another composite writer or an import). The writes then
 * run in the order given, because that is the order the foreign keys need
 * (a topic before the concept filed under it), which sorting would break.
 *
 * Each input keeps its own `base` check and its own revision, exactly as
 * `writeContent` would give it, and the results come back in input order. A
 * refusal of any one rolls back all of them. Naming one entity twice is
 * refused: the second write's base could only be stale.
 */
export async function writeContents(
  db: CatalogDatabase,
  inputs: readonly WriteContentInput[],
): Promise<WriteContentResult[]> {
  const seen = new Set<string>();
  for (const input of inputs) {
    validate(input);
    const name = `${input.type} ${input.id}`;
    if (seen.has(name)) {
      throw new ContentWriteError(
        "invalid",
        `${input.type} "${input.id}" is named twice in one composite write. Merge the two changes into one input.`,
      );
    }
    seen.add(name);
  }
  if (inputs.length === 0) return [];

  return db.transaction(async (tx) => {
    for (const input of [...inputs].sort(byLockOrder)) await lockEntity(tx, input.type, input.id);
    const results: WriteContentResult[] = [];
    for (const input of inputs) {
      await assertReadableFarEnds(tx, input);
      results.push(await writeLocked(tx, input));
    }
    return results;
  });
}

/** The global lock order: type, then id, both by code unit, as `lockTypes` sorts types. */
function byLockOrder(a: WriteContentInput, b: WriteContentInput): number {
  if (a.type !== b.type) return a.type < b.type ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * One write, inside a transaction that already holds the entity's locks:
 * the base check, the savepoint, the revision.
 */
async function writeLocked(tx: CatalogDatabase, input: WriteContentInput): Promise<WriteContentResult> {
  const latest = (await latestRevisions(tx, input.type, [input.id])).get(input.id);
  const latestId = latest?.id ?? null;
  if (latestId !== input.base) {
    throw new ContentWriteError(
      "stale-base",
      `${input.type} "${input.id}" has moved on: this write started from ` +
        `${input.base === null ? "no revision" : `revision ${input.base}`}, and the latest is ` +
        `${latestId === null ? "no revision" : `revision ${latestId}`}. Read it again and reapply ` +
        `the change; nothing was merged.`,
    );
  }

  const before = (await readSnapshots(tx, input.type, [input.id])).get(input.id);
  if (before !== undefined && before.ownerId !== input.owner) {
    throw new ContentWriteError(
      "foreign-owner",
      `${input.type} "${input.id}" belongs to ${before.ownerId}, and this write is for ${input.owner}. ` +
        `Ids are shared across owners (D23 of docs/CONTENT-MIGRATION.md), so writing it would take ` +
        `their row over; nothing was written. Choose another id.`,
    );
  }
  // A blob's key names whose store and whose quota the bytes are in (D5), so
  // a row may name only a key under its own owner's prefix: one naming
  // another owner's key would serve bytes that owner stored. The table has no
  // CHECK for it (`owner_id` and the key's prefix are in different rows), so
  // it is asserted here, where every write passes. A key the row already had
  // is let through: after D23's move of a type to the commons a row keeps its
  // `local/` key until `catalog asset upload` re-keys it.
  for (const [column, name] of BLOB_KEY_COLUMNS) {
    const key = input.next.row[column];
    if (typeof key !== "string" || key.startsWith(`${input.owner}/`)) continue;
    const kept = before?.snapshot.entity[name];
    if (kept === key) continue;
    throw new ContentWriteError(
      "invalid",
      `${input.type} "${input.id}" names blob ${key}, which is not under "${input.owner}/", and this write is ` +
        `for ${input.owner}. A row's blob is keyed by the row's owner (D5); upload the bytes as ${input.owner}.`,
    );
  }
  // The commons owner is reserved and has no learner row until its first
  // write, the way `local` had none until its first observation.
  if (input.owner === COMMONS_OWNER) await ensureLearner(tx, COMMONS_OWNER);
  const [revisionId] = await reserveRevisionIds(tx, 1);
  if (revisionId === undefined) throw new Error("could not reserve a revision id");
  await markSeam(tx, String(revisionId));

  // The writes run in a savepoint, so a write that changes nothing can be
  // rolled back whole once the snapshot says so.
  const holder: { after?: SnapshotRead } = {};
  let unchanged = false;
  try {
    await tx.transaction(async (sp) => {
      await writeRows(sp, input);
      const read = (await readSnapshots(sp, input.type, [input.id])).get(input.id);
      if (read === undefined) throw new Error(`${input.type} "${input.id}" is missing after its own write`);
      holder.after = read;
      if (!needsRevision(latest, read)) throw new Unchanged();
    });
  } catch (error) {
    if (!(error instanceof Unchanged)) throw error;
    unchanged = true;
  }
  const after = holder.after;
  if (after === undefined) throw new Error(`${input.type} "${input.id}" is missing after its own write`);

  if (unchanged && latest !== undefined) {
    return {
      type: input.type,
      id: input.id,
      changed: false,
      revisionId: latest.id,
      seq: latest.seq,
      op: null,
      hash: latest.hash,
      snapshot: after.snapshot,
    };
  }

  const pending: PendingRevision = {
    id: revisionId,
    type: input.type,
    entityId: input.id,
    read: after,
    latest,
    op: input.op ?? deriveOp(latest, after, "update", before !== undefined),
    authorKind: input.authorKind,
    author: input.author,
    reason: input.reason.trim(),
    jobId: input.jobId,
    sessionId: input.sessionId,
  };
  await appendRevisions(tx, [pending]);
  return {
    type: input.type,
    id: input.id,
    changed: true,
    revisionId,
    seq: (latest?.seq ?? 0) + 1,
    op: pending.op,
    hash: after.hash,
    snapshot: after.snapshot,
  };
}

/** The entity upsert and the replacement of any owned links the caller gave. */
async function writeRows(db: CatalogDatabase, input: WriteContentInput): Promise<void> {
  const spec = ENTITIES[input.type];
  await db
    .insert(spec.table)
    .values({ ...input.next.row, ownerId: input.owner } as never)
    .onConflictDoUpdate({ target: column(spec.table, spec.key), set: updateSet(spec.table) });

  for (const [name, rows] of Object.entries(input.next.links ?? {})) {
    const linkSpec = spec.links.find((l) => l.name === name);
    if (linkSpec === undefined) {
      throw new ContentWriteError(
        "invalid",
        `${input.type} owns no link table "${name}". It owns: ` +
          `${spec.links.map((l) => l.name).join(", ") || "none"}.`,
      );
    }
    await db.delete(linkSpec.table).where(eq(column(linkSpec.table, linkSpec.parent), input.id));
    if (rows.length > 0) {
      // A link table with an owner of its own (`topic_relation`,
      // `manimkc_topic`) belongs to the entity at its owning end, so its rows
      // take the write's owner too, rather than the column's `'local'`.
      const owned = "ownerId" in getTableColumns(linkSpec.table);
      await db
        .insert(linkSpec.table)
        .values(
          rows.map((row) => ({
            ...row,
            ...(owned ? { ownerId: input.owner } : {}),
            [linkSpec.parent]: input.id,
          })) as never,
        );
    }
  }
}

function validate(input: WriteContentInput): void {
  if (!isEntityType(input.type)) {
    throw new ContentWriteError("invalid", `"${String(input.type)}" is not a content type`);
  }
  if (typeof input.reason !== "string" || input.reason.trim() === "") {
    throw new ContentWriteError(
      "empty-reason",
      `a content write needs a reason: it is what the commit message used to say, and ` +
        `catalog history shows it beside every revision`,
    );
  }
  if (typeof input.author !== "string" || input.author.trim() === "") {
    throw new ContentWriteError("empty-author", "a content write needs an author");
  }
  if (typeof input.owner !== "string" || input.owner.trim() === "") {
    throw new ContentWriteError("empty-owner", "a content write needs an owner: whose content this is");
  }
  if (!(AUTHOR_KINDS as readonly string[]).includes(input.authorKind)) {
    throw new ContentWriteError("invalid", `author kind "${input.authorKind}" is not one of ${AUTHOR_KINDS.join(", ")}`);
  }
  if (input.op !== undefined && !(REVISION_OPS as readonly string[]).includes(input.op)) {
    throw new ContentWriteError("invalid", `op "${input.op}" is not one of ${REVISION_OPS.join(", ")}`);
  }
  const spec = ENTITIES[input.type];
  const stated = input.next.row["ownerId"];
  if (stated !== undefined && stated !== input.owner) {
    throw new ContentWriteError(
      "invalid",
      `the row says its owner is ${JSON.stringify(stated)}, but the write is for ${input.owner}. ` +
        `The seam stamps the owner; a row should not name another one.`,
    );
  }
  for (const [name, rows] of Object.entries(input.next.links ?? {})) {
    for (const row of rows) {
      if (row["ownerId"] !== undefined && row["ownerId"] !== input.owner) {
        throw new ContentWriteError(
          "invalid",
          `a ${name} row says its owner is ${JSON.stringify(row["ownerId"])}, but the write is for ${input.owner}. ` +
            `A link belongs to the entity at its owning end.`,
        );
      }
    }
  }
  const key = input.next.row[spec.key];
  if (key !== input.id) {
    throw new ContentWriteError(
      "key-mismatch",
      `the row's ${spec.key} is ${JSON.stringify(key)}, but the write is for "${input.id}". ` +
        `A rename is its own operation.`,
    );
  }
}

export interface DeleteContentInput {
  type: RevisionEntityType;
  id: string;
  /** Whose content the caller means to delete; a row another owner holds is refused. */
  owner: string;
  /** The revision the caller planned the delete against, or null for "none yet". */
  base: number | null;
  author: string;
  authorKind: AuthorKind;
  reason: string;
}

/**
 * Delete one entity through the seam: a `delete` revision holding its last
 * state, then the row. The caller holds the entity's lock (`lockEntity`) and
 * runs this in its own transaction, the way `course import` deletes the link
 * assets a file stopped naming.
 *
 * The same two refusals a write gets, before anything is deleted: `stale-base`
 * when the entity moved past `base`, and `foreign-owner` when another owner
 * holds it (phase 4), since ids are global and a delete by id would otherwise
 * remove somebody else's row. Null when there is no such entity.
 */
export async function deleteContent(
  tx: CatalogDatabase,
  input: DeleteContentInput,
): Promise<{ revisionId: number } | null> {
  validate({ ...input, next: { row: { [ENTITIES[input.type].key]: input.id } } });
  const read = (await readSnapshots(tx, input.type, [input.id])).get(input.id);
  if (read === undefined) return null;
  const latest = (await latestRevisions(tx, input.type, [input.id])).get(input.id);
  if ((latest?.id ?? null) !== input.base) {
    throw new ContentWriteError(
      "stale-base",
      `${input.type} "${input.id}" has moved on: this delete was planned against ` +
        `${input.base === null ? "no revision" : `revision ${input.base}`}, and the latest is ` +
        `${latest === undefined ? "no revision" : `revision ${latest.id}`}. Nothing was deleted.`,
    );
  }
  if (read.ownerId !== input.owner) {
    throw new ContentWriteError(
      "foreign-owner",
      `${input.type} "${input.id}" belongs to ${read.ownerId}, and this delete is for ${input.owner}. ` +
        `Ids are shared across owners (D23 of docs/CONTENT-MIGRATION.md); nothing was deleted.`,
    );
  }
  const [revisionId] = await reserveRevisionIds(tx, 1);
  if (revisionId === undefined) throw new Error("could not reserve a revision id");
  await markSeam(tx, String(revisionId));
  const spec = ENTITIES[input.type];
  await tx.delete(spec.table).where(eq(column(spec.table, spec.key), input.id));
  await appendRevisions(tx, [
    {
      id: revisionId,
      type: input.type,
      entityId: input.id,
      read,
      latest,
      op: "delete",
      authorKind: input.authorKind,
      author: input.author,
      reason: input.reason.trim(),
    },
  ]);
  return { revisionId };
}

/**
 * Refuse a write that points at a row its owner may not read (phase 4): a
 * relation to another owner's topic, a concept filed under one, a module
 * listing another owner's link. Ids are global, so nothing in the schema stops
 * such a link, and its own reader could never follow it. The commons is
 * readable to everyone, so a link to it is fine.
 *
 * Only what the write adds is judged. A link the entity already has, the
 * same link and not merely one to the same row (a relation of another kind
 * to that topic is a new link), is carried over, as is a reference its row
 * already makes, so a link a mixed state left behind (the phase 4 review
 * seeded several) neither locks the owner out of their own entity nor is
 * dropped behind their back; `catalog doctor` reports it. A far end that
 * names nothing is left to the foreign key, which says so in its own words.
 */
/** Columns of a link row that say where it sits or who stamped it, not what it is. */
const LINK_PLACE = new Set(["position", "topicPosition", "ownerId", "createdAt", "updatedAt", "id"]);

async function assertReadableFarEnds(tx: CatalogDatabase, input: WriteContentInput): Promise<void> {
  const spec = ENTITIES[input.type];
  const wanted = new Map<RevisionEntityType, Set<string>>();
  const want = (target: RevisionEntityType, value: unknown) => {
    if (typeof value !== "string" || value === "") return;
    const set = wanted.get(target) ?? new Set<string>();
    set.add(value);
    wanted.set(target, set);
  };

  const rowEnds = ROW_FAR_ENDS[input.type] ?? [];
  if (rowEnds.length > 0) {
    const [current] = (await tx
      .select()
      .from(spec.table)
      .where(eq(column(spec.table, spec.key), input.id))) as Record<string, unknown>[];
    for (const end of rowEnds) {
      const value = input.next.row[end.column];
      if (value !== current?.[end.column]) want(end.target, value);
    }
  }
  for (const [name, rows] of Object.entries(input.next.links ?? {})) {
    const ends = LINK_FAR_ENDS[name] ?? [];
    const linkSpec = spec.links.find((l) => l.name === name);
    if (ends.length === 0 || linkSpec === undefined || rows.length === 0) continue;
    const current = (await tx
      .select()
      .from(linkSpec.table)
      .where(eq(column(linkSpec.table, linkSpec.parent), input.id))) as Record<string, unknown>[];
    // A link's identity is its content without its place in the list or
    // its stamps: the keys the writer gave, less position and owner.
    const identity = (row: Record<string, unknown>, keys: readonly string[]) =>
      JSON.stringify(keys.map((key) => row[key] ?? null));
    for (const row of rows) {
      const keys = Object.keys(row).filter((key) => !LINK_PLACE.has(key)).sort();
      const had = current.some((existing) => identity(existing, keys) === identity(row, keys));
      if (had) continue;
      for (const end of ends) want(end.target, row[end.column]);
    }
  }

  const readable = readableOwners(input.owner);
  for (const [target, ids] of wanted) {
    const targetSpec = ENTITIES[target];
    const found = (await tx
      .select({ id: column(targetSpec.table, targetSpec.key), ownerId: column(targetSpec.table, "ownerId") })
      .from(targetSpec.table)
      .where(inArray(column(targetSpec.table, targetSpec.key), [...ids]))) as { id: string; ownerId: string }[];
    const foreign = found.filter((row) => !readable.includes(row.ownerId)).map((row) => row.id).sort();
    if (foreign.length > 0) {
      throw new ContentWriteError(
        "foreign-owner",
        `${input.type} "${input.id}" would point at ${target} ${foreign.map((id) => `"${id}"`).join(", ")}, which ` +
          `${input.owner} cannot read: a link may name only its owner's rows or the commons' ` +
          `(phase 4 of docs/CONTENT-MIGRATION.md). Nothing was written.`,
      );
    }
  }
}
