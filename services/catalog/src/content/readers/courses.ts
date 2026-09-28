import type { Course, Module, Resource, ResourceType, Topic } from "@self-learn/content";
import { sql } from "drizzle-orm";

import type { CatalogDatabase } from "../../db";
import { ASSET_PREFIX } from "../../index/source";
import { andOwnedBy, type Owners } from "../scope";
import type { TypeReader } from "./reader";

/**
 * The database reader for `courses`: every live course, as `Course[]` in
 * `order:`, with archived modules and items left out.
 *
 * Track B's file (docs/CONTENT-MIGRATION.md, phase 1). It returns exactly what
 * `fileSource` returns for the same content, down to the order of each
 * object's keys: the pages hand courses to client components as props, and
 * React serialises props in key order, so a reader that built the same values
 * in a different order would change the HTML and fail the byte-for-byte
 * parity the flip is checked by.
 *
 * Where each field comes from:
 *
 * - a course is a live `collection` of kind `course`; `order` is its
 *   `position`, and the fields no query joins on (`code`, `credits`,
 *   `inferred`, `capstone` and the optional three) are its `metadata`, as the
 *   indexer and `course import` write it; `tags` are its `collection_tag`
 *   rows in position order, which is the list as written;
 * - a module is a live child `collection`, in `position` order (`order:`),
 *   and its `topic` is its topic `collection_item` row;
 * - an item is a live `curriculum_item` of the module, in position order, with
 *   its `concept_curriculum_item` rows as `concepts` in their order;
 * - a resource is a curated `link` asset the module holds as a
 *   `collection_item`, in position order, its id without the `link:` prefix
 *   and its `type` the asset's `resource_type`.
 *
 * Six queries per call, whatever the number of courses, in one snapshot, each
 * ordered the way the export orders it (`../export.ts`), so the reader and the
 * export cannot disagree about a list's order.
 */

interface CourseRow extends Record<string, unknown> {
  id: string;
  slug: string;
  title: string;
  position: number;
  metadata: Record<string, unknown>;
}

interface ModuleRow extends Record<string, unknown> {
  id: string;
  parent_id: string;
  slug: string;
  title: string;
  position: number;
  topic: string | null;
}

async function rows<T extends Record<string, unknown>>(db: CatalogDatabase, query: ReturnType<typeof sql>): Promise<T[]> {
  return (await db.execute<T>(query)).rows as T[];
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list === undefined) out.set(k, [item]);
    else list.push(item);
  }
  return out;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** What the file reader keeps of an optional text key: absent, or trimmed and non-empty. */
function optional(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * Every live course, read in one repeatable-read, read-only transaction, so
 * the six queries see one snapshot. Separately, an import or an archive that
 * committed between two of them could hand a page a course from before it
 * and modules from after it.
 *
 * `owners` scopes it (phase 4): each of the six queries keeps only rows those
 * owners hold, a link only when the entity at its far end (a tag, a concept,
 * a resource) is theirs too. Omitted, every owner is read.
 */
export async function readCourses(db: CatalogDatabase, owners?: Owners): Promise<Course[]> {
  return db.transaction((tx) => readTree(tx, owners), { isolationLevel: "repeatable read", accessMode: "read only" });
}

async function readTree(db: CatalogDatabase, owners: Owners): Promise<Course[]> {
  const courses = await rows<CourseRow>(
    db,
    sql`select id, slug, title, position, metadata from collection
        where kind = 'course' and archived_at is null${andOwnedBy(sql`owner_id`, owners)} order by position, id`,
  );
  const tags = groupBy(
    await rows<{ collection_id: string; tag_id: string }>(
      db,
      sql`select t.collection_id, t.tag_id from collection_tag t
          join collection c on c.id = t.collection_id
          join tag g on g.id = t.tag_id
          where c.kind = 'course' and c.archived_at is null${andOwnedBy(sql`c.owner_id`, owners)}${andOwnedBy(sql`g.owner_id`, owners)}
          order by t.collection_id, t.position, t.tag_id`,
    ),
    (r) => r.collection_id,
  );
  const modules = groupBy(
    await rows<ModuleRow>(
      db,
      sql`select c.id, c.parent_id, c.slug, c.title, c.position,
                 (select m.topic_slug from collection_item m
                  where m.collection_id = c.id and m.topic_slug is not null
                  order by m.position limit 1) as topic
          from collection c
          where c.kind = 'module' and c.archived_at is null${andOwnedBy(sql`c.owner_id`, owners)}
          order by c.parent_id, c.position, c.id`,
    ),
    (r) => r.parent_id,
  );
  const items = groupBy(
    await rows<{ id: string; collection_id: string; title: string; subtopics: unknown }>(
      db,
      sql`select id, collection_id, title, subtopics from curriculum_item
          where archived_at is null${andOwnedBy(sql`owner_id`, owners)} order by collection_id, position, id`,
    ),
    (r) => r.collection_id,
  );
  const concepts = groupBy(
    await rows<{ curriculum_item_id: string; concept_slug: string }>(
      db,
      sql`select l.curriculum_item_id, l.concept_slug from concept_curriculum_item l
          join curriculum_item i on i.id = l.curriculum_item_id
          join concept k on k.slug = l.concept_slug
          where i.archived_at is null${andOwnedBy(sql`i.owner_id`, owners)}${andOwnedBy(sql`k.owner_id`, owners)}
          order by l.curriculum_item_id, l.position, l.concept_slug`,
    ),
    (r) => r.curriculum_item_id,
  );
  const resources = groupBy(
    await rows<{ collection_id: string; id: string; title: string | null; url: string | null; resource_type: string | null }>(
      db,
      sql`select m.collection_id, a.id, a.title, a.url, a.resource_type
          from collection_item m join asset a on a.id = m.asset_id
          where a.kind = 'link' and starts_with(a.id, ${ASSET_PREFIX.courses})${andOwnedBy(sql`a.owner_id`, owners)}
          order by m.collection_id, m.position, a.id`,
    ),
    (r) => r.collection_id,
  );

  return courses.map((row) => {
    const meta = row.metadata;
    const course: Course = {
      id: row.id,
      slug: row.slug,
      code: String(meta["code"] ?? ""),
      title: row.title,
      credits: Number(meta["credits"] ?? 0),
      order: row.position,
      inferred: meta["inferred"] === true,
      tags: (tags.get(row.id) ?? []).map((t) => t.tag_id),
      modules: (modules.get(row.id) ?? []).map((mod): Module => ({
        id: mod.id,
        slug: mod.slug,
        title: mod.title,
        order: mod.position,
        topic: mod.topic ?? "",
        topics: (items.get(mod.id) ?? []).map(
          (item): Topic => ({
            id: item.id,
            title: item.title,
            concepts: (concepts.get(item.id) ?? []).map((c) => c.concept_slug),
            subtopics: strings(item.subtopics),
          }),
        ),
        resources: (resources.get(mod.id) ?? []).map(
          (link): Resource => ({
            id: link.id.slice(ASSET_PREFIX.courses.length),
            title: link.title ?? "",
            url: link.url ?? "",
            type: (link.resource_type ?? "other") as ResourceType,
          }),
        ),
      })),
      capstone: String(meta["capstone"] ?? ""),
    };
    // The optional keys go last and only when present, as the file reader
    // adds them, so the two produce the same object key for key.
    const prereq = optional(meta["prereq"]);
    if (prereq !== undefined) course.prereq = prereq;
    const track = optional(meta["track"]);
    if (track !== undefined) course.track = track;
    const notes = optional(meta["notes"]);
    if (notes !== undefined) course.notes = notes;
    return course;
  });
}

export const reader: TypeReader<"courses"> = {
  ready: true,
  read: (db, scope) => () => readCourses(db, scope.readable),
};
