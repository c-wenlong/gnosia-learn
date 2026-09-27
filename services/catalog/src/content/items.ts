import {
  collection,
  collectionItem,
  concept,
  conceptCurriculumItem as conceptLinks,
  curriculumItem,
  LOCAL_LEARNER_ID,
  learner,
  progress,
  recap,
} from "@self-learn/schema";
import { and, eq, getTableColumns, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import type { CatalogDatabase } from "../db";
import { CourseWriteError, summarise, type WriteThroughSummary } from "./courses";
import { contentColumns } from "./entities";
import {
  appendRevisions,
  latestRevisions,
  lockEntity,
  markSeam,
  reserveRevisionIds,
} from "./revisions";
import { canonical, type JsonValue, readSnapshots, type Snapshot, snapshotHash } from "./snapshot";
import { writeContent } from "./write";
import { applyWriteThrough, captureExports, planWriteThrough } from "./write-through";

/**
 * `catalog item archive|restore|purge <id>`: one curriculum item's lifecycle
 * through the write seam (docs/CONTENT-MIGRATION.md D12 and edge case 13).
 *
 * - **archive** hides an item from its course path. Its row, its links and
 *   every learner's tick, note and recap on it stay; the Settings export
 *   still carries them. It refuses a module's last live item, since a module
 *   with no rows cannot be written back as a course file.
 * - **restore** puts an archived item back on its course path, with the
 *   concept links it had when it was last live. It also brings back a purged
 *   item from the revision its purge wrote, learner rows included.
 * - **purge** deletes an archived item for good. It refuses while any
 *   `progress` or `recap` row names the item, unless `withLearnerData` is
 *   passed; then those rows go into the `delete` revision's snapshot, under
 *   `links.progress` and `links.recap`, before anything is deleted, so the
 *   purge is recoverable from the revision alone.
 *
 * Each is one transaction with one revision, and rewrites the item's course
 * file in the tree the courses were imported from (D17).
 */

type Row = Record<string, unknown>;

export interface ItemResult {
  item: string;
  course: string;
  op: string | null;
  revisionId: number;
  /** restore: concept links it came back with; purge: learner rows it took into the revision. */
  detail: string[];
  writeThrough: WriteThroughSummary;
}

interface ItemOptions {
  id: string;
  reason: string;
  author?: string;
}

function needReason(verb: string, reason: string): string {
  if (reason.trim() === "") {
    throw new CourseWriteError(`item ${verb} needs a --reason: the revision it writes carries it`);
  }
  return reason.trim();
}

async function itemRow(db: CatalogDatabase, id: string) {
  const [row] = await db.select().from(curriculumItem).where(eq(curriculumItem.id, id));
  return row;
}

/** The live module an item sits in and its course, or a refusal naming why not. */
async function moduleOf(db: CatalogDatabase, moduleId: string, item: string) {
  const [mod] = await db.select().from(collection).where(eq(collection.id, moduleId));
  if (mod === undefined) throw new CourseWriteError(`item "${item}" names module "${moduleId}", which is gone`);
  if (mod.archivedAt !== null) {
    throw new CourseWriteError(
      `item "${item}" is in module "${moduleId}", which is archived. List the module in its course ` +
        `file again and import it; an item cannot be live in a module that is not.`,
    );
  }
  const [topicRow] = await db
    .select({ slug: collectionItem.topicSlug })
    .from(collectionItem)
    .where(and(eq(collectionItem.collectionId, moduleId), isNotNull(collectionItem.topicSlug)));
  return { module: mod, course: mod.parentId ?? mod.id, topic: topicRow?.slug ?? null };
}

async function courseOf(db: CatalogDatabase, moduleId: string): Promise<string> {
  const [mod] = await db.select({ parentId: collection.parentId }).from(collection).where(eq(collection.id, moduleId));
  return mod?.parentId ?? moduleId;
}

/**
 * Run `write` in a transaction with the courses export captured around it,
 * then write the course file through once it commits.
 */
async function withWriteThrough<T>(
  db: CatalogDatabase,
  write: (tx: CatalogDatabase) => Promise<T>,
): Promise<{ value: T; writeThrough: WriteThroughSummary }> {
  const { value, plan } = await db.transaction(async (tx) => {
    const before = await captureExports(tx, ["courses"]);
    const value = await write(tx);
    return { value, plan: await planWriteThrough(tx, before) };
  });
  await applyWriteThrough(plan);
  return { value, writeThrough: summarise(plan, true) };
}

export async function archiveItem(db: CatalogDatabase, options: ItemOptions): Promise<ItemResult> {
  const reason = needReason("archive", options.reason);
  const { value, writeThrough } = await withWriteThrough(db, async (tx) => {
    await lockEntity(tx, "curriculum_item", options.id);
    const row = await itemRow(tx, options.id);
    if (row === undefined) throw new CourseWriteError(`no curriculum item "${options.id}" in the catalog`);
    if (row.archivedAt !== null) throw new CourseWriteError(`item "${options.id}" is already archived`);
    const siblings = await tx
      .select({ id: curriculumItem.id })
      .from(curriculumItem)
      .where(
        and(
          eq(curriculumItem.collectionId, row.collectionId),
          isNull(curriculumItem.archivedAt),
          ne(curriculumItem.id, options.id),
        ),
      );
    if (siblings.length === 0) {
      throw new CourseWriteError(
        `item "${options.id}" is the last live item of module "${row.collectionId}", and a module ` +
          `needs at least one. To drop the module, remove it from its course file and import that.`,
      );
    }
    const latest = (await latestRevisions(tx, "curriculum_item", [options.id])).get(options.id);
    const result = await writeContent(tx, {
      type: "curriculum_item",
      id: options.id,
      next: { row: { ...row, archivedAt: new Date() } },
      base: latest?.id ?? null,
      author: options.author ?? LOCAL_LEARNER_ID,
      authorKind: "person",
      reason,
    });
    return { result, course: await courseOf(tx, row.collectionId) };
  });
  return {
    item: options.id,
    course: value.course,
    op: value.result.op,
    revisionId: value.result.revisionId,
    detail: [],
    writeThrough,
  };
}

/** Rows of `table` keyed by SQL column name, as a snapshot holds them, turned back into drizzle's keys. */
function fromSnapshot(table: PgTable, row: Record<string, JsonValue>, except?: string): Row {
  const out: Row = {};
  for (const [key, name] of contentColumns(table, except)) {
    if (Object.hasOwn(row, name)) out[key] = row[name];
  }
  return out;
}

/** Timestamps come back from a snapshot as ISO strings. */
function instants(row: Row, keys: readonly string[]): Row {
  const out = { ...row };
  for (const key of keys) {
    const value = out[key];
    if (typeof value === "string") out[key] = new Date(value);
  }
  return out;
}

/**
 * The concept links an item had the last time a revision recorded it live,
 * or none. The courses indexer drops an archived item's links, so this is
 * where a restore finds them.
 */
async function lastLiveConcepts(db: CatalogDatabase, id: string): Promise<string[]> {
  const { rows } = await db.execute<{ snapshot: Snapshot }>(
    // Newest first; the first live one wins.
    sql`
      select snapshot from content_revision
      where entity_type = 'curriculum_item' and entity_id = ${id}
        and op <> 'delete' and (snapshot -> 'entity' ->> 'archived_at') is null
      order by seq desc limit 1`,
  );
  const links = rows[0]?.snapshot.links["concept_curriculum_item"] ?? [];
  return [...links]
    .sort((a, b) => Number(a["position"] ?? 0) - Number(b["position"] ?? 0))
    .map((link) => String(link["concept_slug"]));
}

export async function restoreItem(db: CatalogDatabase, options: ItemOptions): Promise<ItemResult> {
  const reason = needReason("restore", options.reason);
  const author = options.author ?? LOCAL_LEARNER_ID;
  const { value, writeThrough } = await withWriteThrough(db, async (tx) => {
    await lockEntity(tx, "curriculum_item", options.id);
    const latest = (await latestRevisions(tx, "curriculum_item", [options.id])).get(options.id);
    const row = await itemRow(tx, options.id);

    let entity: Row;
    let concepts: string[];
    let learnerRows: { progress: Record<string, JsonValue>[]; recap: Record<string, JsonValue>[] } = {
      progress: [],
      recap: [],
    };
    if (row !== undefined) {
      if (row.archivedAt === null) throw new CourseWriteError(`item "${options.id}" is not archived`);
      entity = { ...row };
      const current = await tx
        .select({ slug: conceptLinks.conceptSlug, position: conceptLinks.position })
        .from(conceptLinks)
        .where(eq(conceptLinks.curriculumItemId, options.id))
        .orderBy(conceptLinks.position);
      concepts = current.length > 0 ? current.map((c) => c.slug) : await lastLiveConcepts(tx, options.id);
    } else {
      // Purged: the delete revision holds the item, its links and the learner rows.
      if (latest === undefined || !latest.deleted) {
        throw new CourseWriteError(`no curriculum item "${options.id}" in the catalog, and no purge of one to undo`);
      }
      const [purge] = (
        await tx.execute<{ snapshot: Snapshot }>(
          sql`select snapshot from content_revision where id = ${latest.id}`,
        )
      ).rows;
      if (purge === undefined) throw new Error(`revision ${latest.id} is gone`);
      entity = instants(fromSnapshot(curriculumItem, purge.snapshot.entity), ["archivedAt"]);
      concepts = [...(purge.snapshot.links["concept_curriculum_item"] ?? [])]
        .sort((a, b) => Number(a["position"] ?? 0) - Number(b["position"] ?? 0))
        .map((link) => String(link["concept_slug"]));
      learnerRows = {
        progress: purge.snapshot.links["progress"] ?? [],
        recap: purge.snapshot.links["recap"] ?? [],
      };
    }

    const home = await moduleOf(tx, String(entity["collectionId"]), options.id);
    if (home.topic === null) throw new CourseWriteError(`module "${home.module.id}" has no topic row`);
    // A concept archived or refiled since is not linked again: the rule the
    // database enforces would refuse it, and the file could not say it.
    const live =
      concepts.length === 0
        ? new Set<string>()
        : new Set(
            (
              await tx
                .select({ slug: concept.slug })
                .from(concept)
                .where(and(inArray(concept.slug, concepts), isNull(concept.archivedAt), eq(concept.topicSlug, home.topic)))
            ).map((c) => c.slug),
          );
    const kept = concepts.filter((slug) => live.has(slug));
    const dropped = concepts.filter((slug) => !live.has(slug));

    const result = await writeContent(tx, {
      type: "curriculum_item",
      id: options.id,
      next: {
        row: { ...entity, archivedAt: null },
        links: {
          curriculum_item_topic: [{ topicSlug: home.topic }],
          concept_curriculum_item: kept.map((conceptSlug, i) => ({ conceptSlug, position: i + 1 })),
        },
      },
      base: latest?.id ?? null,
      author,
      authorKind: "person",
      reason,
      op: "restore",
    });

    const detail = [
      ...kept.map((slug) => `concept ${slug}`),
      ...dropped.map((slug) => `concept ${slug} not linked again: no longer a live note under "${home.topic}"`),
    ];
    // Learner rows a purge took with it come back as they were. A learner
    // row already there (the learner ticked it again some other way) wins.
    for (const [table, rows] of [
      [progress, learnerRows.progress],
      [recap, learnerRows.recap],
    ] as const) {
      for (const snap of rows) {
        const back = learnerFromSnapshot(table, snap);
        await tx.insert(learner).values({ id: String(back["learnerId"]) }).onConflictDoNothing();
        await tx
          .insert(table)
          .values({ ...back, curriculumItemId: options.id } as never)
          .onConflictDoNothing();
        detail.push(`${table === progress ? "progress" : "recap"} of ${String(back["learnerId"])} put back`);
      }
    }
    return { result, course: home.course, detail };
  });
  return {
    item: options.id,
    course: value.course,
    op: value.result.op,
    revisionId: value.result.revisionId,
    detail: value.detail,
    writeThrough,
  };
}

export interface PurgeOptions extends ItemOptions {
  withLearnerData?: boolean;
}

/** A learner row back from a purge's snapshot, every column including its timestamps. */
function learnerFromSnapshot(table: PgTable, snap: Record<string, JsonValue>): Row {
  const out: Row = {};
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    if (!Object.hasOwn(snap, column.name)) continue;
    const value = snap[column.name];
    out[key] = column.dataType === "date" && typeof value === "string" ? new Date(value) : value;
  }
  return out;
}

/** A learner row as a revision holds it: every column but the item it names, by SQL name, canonical. */
function learnerSnapshot(table: PgTable, row: Row): Record<string, JsonValue> {
  const out: Row = {};
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    if (key === "curriculumItemId") continue;
    out[column.name] = row[key] ?? null;
  }
  return canonical(out) as Record<string, JsonValue>;
}

export async function purgeItem(db: CatalogDatabase, options: PurgeOptions): Promise<ItemResult> {
  const reason = needReason("purge", options.reason);
  const { value, writeThrough } = await withWriteThrough(db, async (tx) => {
    await lockEntity(tx, "curriculum_item", options.id);
    const row = await itemRow(tx, options.id);
    if (row === undefined) throw new CourseWriteError(`no curriculum item "${options.id}" in the catalog`);
    if (row.archivedAt === null) {
      throw new CourseWriteError(
        `item "${options.id}" is live. Archive it first (\`catalog item archive ${options.id} --reason ...\`): ` +
          `a purge deletes, and only something already off the course path is deleted.`,
      );
    }
    // Locked so a tick landing now either commits first and is counted, or waits.
    const ticks = await tx.select().from(progress).where(eq(progress.curriculumItemId, options.id)).for("update");
    const recaps = await tx.select().from(recap).where(eq(recap.curriculumItemId, options.id)).for("update");
    if ((ticks.length > 0 || recaps.length > 0) && options.withLearnerData !== true) {
      const learners = [...new Set([...ticks, ...recaps].map((r) => r.learnerId))].sort();
      throw new CourseWriteError(
        `item "${options.id}" carries learner data: ${ticks.length} progress row(s) and ${recaps.length} ` +
          `recap row(s), for ${learners.join(", ")}. Archived, it keeps them and they stay in the ` +
          `Settings export. To delete them with the item, pass --with-learner-data; they are copied into ` +
          `the purge's revision first, and \`catalog item restore ${options.id}\` puts them back.`,
      );
    }

    const read = (await readSnapshots(tx, "curriculum_item", [options.id])).get(options.id);
    if (read === undefined) throw new Error(`item "${options.id}" vanished under its lock`);
    const snapshot: Snapshot = {
      entity: read.snapshot.entity,
      links: {
        ...read.snapshot.links,
        progress: ticks.map((r) => learnerSnapshot(progress, r)),
        recap: recaps.map((r) => learnerSnapshot(recap, r)),
      },
    };
    const latest = (await latestRevisions(tx, "curriculum_item", [options.id])).get(options.id);
    const [revisionId] = await reserveRevisionIds(tx, 1);
    if (revisionId === undefined) throw new Error("could not reserve a revision id");
    await markSeam(tx, String(revisionId));
    await tx.delete(progress).where(eq(progress.curriculumItemId, options.id));
    await tx.delete(recap).where(eq(recap.curriculumItemId, options.id));
    await tx.delete(curriculumItem).where(eq(curriculumItem.id, options.id));
    await appendRevisions(tx, [
      {
        id: revisionId,
        type: "curriculum_item",
        entityId: options.id,
        read: { ...read, snapshot, hash: snapshotHash(snapshot) },
        latest,
        op: "delete",
        authorKind: "person",
        author: options.author ?? LOCAL_LEARNER_ID,
        reason,
      },
    ]);
    return {
      revisionId,
      course: await courseOf(tx, row.collectionId),
      detail: [
        ...ticks.map((r) => `progress of ${r.learnerId}`),
        ...recaps.map((r) => `recap of ${r.learnerId}`),
      ],
    };
  });
  return {
    item: options.id,
    course: value.course,
    op: "delete",
    revisionId: value.revisionId,
    detail: value.detail,
    writeThrough,
  };
}
