import {
  AUTHOR_KINDS,
  type AuthorKind,
  REVISION_OPS,
  type RevisionEntityType,
  type RevisionOp,
} from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { column, ENTITIES, isEntityType } from "./entities";
import {
  appendRevisions,
  deriveOp,
  latestRevisions,
  markSeam,
  reserveRevisionIds,
  type PendingRevision,
} from "./revisions";
import { readSnapshots, type Snapshot } from "./snapshot";
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
 * 3. upserts the entity, and replaces any owned links the caller supplied;
 * 4. reads the entity back and appends a `content_revision` with the next
 *    `seq`, the previous revision's id, the snapshot and its hash.
 *
 * A write that leaves the snapshot exactly as the latest revision has it
 * appends nothing and says so, the same rule that makes a re-import free.
 */

export class ContentWriteError extends Error {
  constructor(
    readonly code: "empty-reason" | "empty-author" | "stale-base" | "invalid" | "key-mismatch",
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
  const spec = ENTITIES[input.type];

  return db.transaction(async (tx) => {
    // Serialise writers of one entity, including two that both create it:
    // there is no row yet for FOR UPDATE to lock. Transaction-scoped, so it
    // cannot outlive a failure.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${input.type}:${input.id}`}, 0))`,
    );

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
    const [revisionId] = await reserveRevisionIds(tx, 1);
    if (revisionId === undefined) throw new Error("could not reserve a revision id");
    await markSeam(tx, String(revisionId));

    const key = column(spec.table, spec.key);
    await tx
      .insert(spec.table)
      .values(input.next.row as never)
      .onConflictDoUpdate({ target: key, set: updateSet(spec.table) });

    for (const [name, rows] of Object.entries(input.next.links ?? {})) {
      const linkSpec = spec.links.find((l) => l.name === name);
      if (linkSpec === undefined) {
        throw new ContentWriteError(
          "invalid",
          `${input.type} owns no link table "${name}". It owns: ` +
            `${spec.links.map((l) => l.name).join(", ") || "none"}.`,
        );
      }
      await tx.delete(linkSpec.table).where(eq(column(linkSpec.table, linkSpec.parent), input.id));
      if (rows.length > 0) {
        await tx
          .insert(linkSpec.table)
          .values(rows.map((row) => ({ ...row, [linkSpec.parent]: input.id })) as never);
      }
    }

    const after = (await readSnapshots(tx, input.type, [input.id])).get(input.id);
    if (after === undefined) throw new Error(`${input.type} "${input.id}" is missing after its own write`);

    if (latest !== undefined && latest.hash === after.hash) {
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
  });
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
  if (!(AUTHOR_KINDS as readonly string[]).includes(input.authorKind)) {
    throw new ContentWriteError("invalid", `author kind "${input.authorKind}" is not one of ${AUTHOR_KINDS.join(", ")}`);
  }
  if (input.op !== undefined && !(REVISION_OPS as readonly string[]).includes(input.op)) {
    throw new ContentWriteError("invalid", `op "${input.op}" is not one of ${REVISION_OPS.join(", ")}`);
  }
  const spec = ENTITIES[input.type];
  const key = input.next.row[spec.key];
  if (key !== input.id) {
    throw new ContentWriteError(
      "key-mismatch",
      `the row's ${spec.key} is ${JSON.stringify(key)}, but the write is for "${input.id}". ` +
        `A rename is its own operation.`,
    );
  }
}
