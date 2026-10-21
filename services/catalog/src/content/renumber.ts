import {
  collection,
  collectionItem,
  concept,
  curriculumItem,
  LOCAL_LEARNER_ID,
  type RevisionEntityType,
  tag,
  topic,
} from "@gnosia/schema";
import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { renumbered } from "./positions";
import { latestRevisions } from "./revisions";
import { writeContents, type WriteContentInput, type WriteContentResult } from "./write";
import { CLI_OWNER } from "./scope";
import { bytewise } from "../sql-order";

/**
 * `catalog renumber <list>`: spread one sparse list back out to
 * `1000, 2000, ...` in its current order (D22 of docs/CONTENT-MIGRATION.md).
 *
 * An import keeps every row's position while its place is unchanged and puts
 * a moved or new row in the gap it landed in. After enough insertions at one
 * spot the gap closes, and the import refuses and names this command, because
 * renumbering moves every row after the gap and a moved position is a
 * revision of that row. So it is done on purpose, with a reason, as one
 * composite write: one revision per row whose number changed, none for a row
 * already where it would go, and the order itself never changes.
 */

export const RENUMBER_LISTS = ["topics", "tags", "concepts", "modules", "items"] as const;
export type RenumberList = (typeof RENUMBER_LISTS)[number];

export class RenumberError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenumberError";
  }
}

export interface RenumberOptions {
  list: RenumberList;
  /** `concepts` and `modules`: the topic whose `maps.concepts` or `maps.courses` it is. */
  topic?: string;
  /** `items`: the module. */
  module?: string;
  reason: string;
  /** Defaults to the local learner: a person ran the command. */
  author?: string;
}

export interface RenumberMove {
  id: string;
  from: number;
  to: number;
  revisionId: number;
}

export interface RenumberResult {
  list: RenumberList;
  scope: string | null;
  /** Rows in the list, in order. */
  rows: number;
  moved: RenumberMove[];
}

type Row = Record<string, unknown>;

/** One entry of the list: the entity it is a revision of, and its row as it will be written. */
interface Entry {
  type: RevisionEntityType;
  id: string;
  from: number;
  next: (to: number) => WriteContentInput["next"];
}

export async function renumber(db: CatalogDatabase, options: RenumberOptions): Promise<RenumberResult> {
  if (options.reason.trim() === "") {
    throw new RenumberError("renumber needs a --reason: every row it moves gets a revision that carries it");
  }
  const { entries, scope } = await listEntries(db, options);
  const positions = renumbered(entries.map((entry) => entry.id));
  const changing = entries.filter((entry) => positions.get(entry.id) !== entry.from);
  const author = options.author ?? LOCAL_LEARNER_ID;

  const bases = new Map<string, number | null>();
  for (const type of new Set(changing.map((entry) => entry.type))) {
    const ids = changing.filter((entry) => entry.type === type).map((entry) => entry.id);
    const latest = await latestRevisions(db, type, ids);
    for (const id of ids) bases.set(`${type} ${id}`, latest.get(id)?.id ?? null);
  }
  const results: WriteContentResult[] = await writeContents(
    db,
    changing.map((entry) => ({
      owner: CLI_OWNER,
      type: entry.type,
      id: entry.id,
      next: entry.next(positions.get(entry.id) as number),
      base: bases.get(`${entry.type} ${entry.id}`) ?? null,
      author,
      authorKind: "person",
      reason: options.reason,
    })),
  );
  return {
    list: options.list,
    scope,
    rows: entries.length,
    moved: changing.map((entry, i) => ({
      id: entry.id,
      from: entry.from,
      to: positions.get(entry.id) as number,
      revisionId: results[i]?.revisionId ?? 0,
    })),
  };
}

/** The live rows of the list, in their current order, ties broken by id as the export breaks them. */
async function listEntries(
  db: CatalogDatabase,
  options: RenumberOptions,
): Promise<{ entries: Entry[]; scope: string | null }> {
  const need = (value: string | undefined, flag: string): string => {
    if (value === undefined || value.trim() === "") {
      throw new RenumberError(`renumber ${options.list} needs ${flag}`);
    }
    return value;
  };
  const whole = (type: RevisionEntityType, key: string, column: string) => (row: Row): Entry => ({
    type,
    id: String(row[key]),
    from: Number(row[column]),
    next: (to) => ({ row: { ...row, [column]: to } }),
  });

  switch (options.list) {
    case "topics": {
      const rows = await db
        .select()
        .from(topic)
        .where(isNull(topic.archivedAt))
        .orderBy(asc(topic.position), asc(bytewise(topic.slug)));
      return { entries: rows.map(whole("topic", "slug", "position")), scope: null };
    }
    case "tags": {
      const rows = await db.select().from(tag).orderBy(asc(tag.position), asc(bytewise(tag.id)));
      return { entries: rows.map(whole("tag", "id", "position")), scope: null };
    }
    case "concepts": {
      const slug = need(options.topic, "--topic <slug>");
      await mustExist(db, "topic", slug);
      const rows = await db
        .select()
        .from(concept)
        .where(and(eq(concept.topicSlug, slug), isNull(concept.archivedAt)))
        .orderBy(asc(concept.topicPosition), asc(bytewise(concept.slug)));
      return { entries: rows.map(whole("concept", "slug", "topicPosition")), scope: slug };
    }
    case "items": {
      const id = need(options.module, "--module <id>");
      await mustExist(db, "module", id);
      const rows = await db
        .select()
        .from(curriculumItem)
        .where(and(eq(curriculumItem.collectionId, id), isNull(curriculumItem.archivedAt)))
        .orderBy(asc(curriculumItem.position), asc(bytewise(curriculumItem.id)));
      return { entries: rows.map(whole("curriculum_item", "id", "position")), scope: id };
    }
    case "modules": {
      const slug = need(options.topic, "--topic <slug>");
      await mustExist(db, "topic", slug);
      // The topic row of each live module under the topic: its place in
      // `maps.courses`. The row belongs to the module's snapshot, so a move
      // is a revision of the module, written with every link row the module
      // owns in that table, since the seam replaces a link table whole.
      const topicRows = await db
        .select({ moduleId: collectionItem.collectionId, at: collectionItem.topicPosition })
        .from(collectionItem)
        .innerJoin(collection, eq(collection.id, collectionItem.collectionId))
        .where(
          and(
            eq(collectionItem.topicSlug, slug),
            eq(collection.kind, "module"),
            isNull(collection.archivedAt),
          ),
        )
        .orderBy(asc(collectionItem.topicPosition), asc(bytewise(collectionItem.collectionId)));
      const ids = topicRows.map((row) => row.moduleId);
      if (ids.length === 0) return { entries: [], scope: slug };
      const modules = new Map(
        (await db.select().from(collection).where(inArray(collection.id, ids))).map((row) => [row.id, row]),
      );
      const links = await db
        .select()
        .from(collectionItem)
        .where(inArray(collectionItem.collectionId, ids))
        .orderBy(asc(collectionItem.position), asc(collectionItem.id));
      return {
        scope: slug,
        entries: topicRows.map((row) => ({
          type: "collection",
          id: row.moduleId,
          from: row.at,
          next: (to) => ({
            row: modules.get(row.moduleId) as Row,
            links: {
              // Without `id`: it is an identity the table generates, and the
              // seam deletes and reinserts the rows.
              collection_item: links
                .filter((link) => link.collectionId === row.moduleId)
                .map((link) => {
                  const rest: Row = { ...link };
                  delete rest["id"];
                  return link.topicSlug === slug ? { ...rest, topicPosition: to } : rest;
                }),
            },
          }),
        })),
      };
    }
  }
}

async function mustExist(db: CatalogDatabase, kind: "topic" | "module", id: string): Promise<void> {
  const found =
    kind === "topic"
      ? await db.select({ id: topic.slug }).from(topic).where(eq(topic.slug, id)).limit(1)
      : await db
          .select({ id: collection.id })
          .from(collection)
          .where(and(eq(collection.id, id), eq(collection.kind, "module"), isNotNull(collection.parentId)))
          .limit(1);
  if (found.length === 0) throw new RenumberError(`no ${kind} "${id}" in the catalog`);
}
