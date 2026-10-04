import {
  COURSE_COVER_EXTENSIONS,
  type Course,
  type CourseCoverExtension,
  coverFileName,
  type Module,
  type Resource,
  type ResourceType,
  type Topic,
} from "@self-learn/content";
import { sql } from "drizzle-orm";

import type { CatalogDatabase } from "../../db";
import { ASSET_PREFIX } from "../../index/source";
import { keyParts, storedCredit } from "../cover-image";
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
 *   its `concept_curriculum_item` rows as `concepts` in their order, and its
 *   `videos` column as `videos` when it lists any;
 * - a module's `videos` is `metadata.videos`, when it lists any;
 * - a resource is a curated `link` asset the module holds as a
 *   `collection_item`, in position order, its id without the `link:` prefix
 *   and its `type` the asset's `resource_type`; its `lessons` are its
 *   `curriculum_item_asset` rows to live items of the same module, in
 *   position order, when it has any;
 * - a cover is the course's `cover_blob_key` and `metadata.coverCredit`, named
 *   as the export names its file (`<code>.cover.<ext>`, the key's extension).
 *   Read through `to_jsonb`, so a database that has not had 0016 yet reads
 *   as courses with no cover rather than failing the whole list.
 *
 * Seven queries per call, whatever the number of courses, in one snapshot, each
 * ordered the way the export orders it (`../export.ts`), so the reader and the
 * export cannot disagree about a list's order.
 */

interface CourseRow extends Record<string, unknown> {
  id: string;
  slug: string;
  title: string;
  position: number;
  metadata: Record<string, unknown>;
  cover_blob_key: string | null;
}

interface ModuleRow extends Record<string, unknown> {
  id: string;
  parent_id: string;
  slug: string;
  title: string;
  position: number;
  topic: string | null;
  metadata: Record<string, unknown>;
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
    sql`select c.id, c.slug, c.title, c.position, c.metadata, to_jsonb(c) ->> 'cover_blob_key' as cover_blob_key
        from collection c
        where c.kind = 'course' and c.archived_at is null${andOwnedBy(sql`c.owner_id`, owners)} order by c.position, c.id collate "C"`,
  );
  const tags = groupBy(
    await rows<{ collection_id: string; tag_id: string }>(
      db,
      sql`select t.collection_id, t.tag_id from collection_tag t
          join collection c on c.id = t.collection_id
          join tag g on g.id = t.tag_id
          where c.kind = 'course' and c.archived_at is null${andOwnedBy(sql`c.owner_id`, owners)}${andOwnedBy(sql`g.owner_id`, owners)}
          order by t.collection_id collate "C", t.position, t.tag_id collate "C"`,
    ),
    (r) => r.collection_id,
  );
  const modules = groupBy(
    await rows<ModuleRow>(
      db,
      sql`select c.id, c.parent_id, c.slug, c.title, c.position, c.metadata,
                 (select m.topic_slug from collection_item m
                  where m.collection_id = c.id and m.topic_slug is not null${
                    owners === undefined
                      ? sql``
                      : sql` and exists (select 1 from topic t where t.slug = m.topic_slug${andOwnedBy(sql`t.owner_id`, owners)})`
                  }
                  order by m.position limit 1) as topic
          from collection c
          where c.kind = 'module' and c.archived_at is null${andOwnedBy(sql`c.owner_id`, owners)}
          order by c.parent_id collate "C", c.position, c.id collate "C"`,
    ),
    (r) => r.parent_id,
  );
  const items = groupBy(
    await rows<{ id: string; collection_id: string; title: string; subtopics: unknown; videos: unknown }>(
      db,
      // Through `to_jsonb`, so a database that has not had 0022 reads as
      // items listing no video rather than failing the whole list.
      sql`select id, collection_id, title, subtopics, to_jsonb(curriculum_item) -> 'videos' as videos from curriculum_item
          where archived_at is null${andOwnedBy(sql`owner_id`, owners)} order by collection_id collate "C", position, id collate "C"`,
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
          order by l.curriculum_item_id collate "C", l.position, l.concept_slug collate "C"`,
    ),
    (r) => r.curriculum_item_id,
  );
  const lessons = groupBy(
    await lessonLinks(db, owners),
    (r) => r.asset_id,
  );
  const resources = groupBy(
    await rows<{ collection_id: string; id: string; title: string | null; url: string | null; resource_type: string | null }>(
      db,
      sql`select m.collection_id, a.id, a.title, a.url, a.resource_type
          from collection_item m join asset a on a.id = m.asset_id
          where a.kind = 'link' and starts_with(a.id, ${ASSET_PREFIX.courses})${andOwnedBy(sql`a.owner_id`, owners)}
          order by m.collection_id collate "C", m.position, a.id collate "C"`,
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
        topics: (items.get(mod.id) ?? []).map((item): Topic => {
          const topic: Topic = {
            id: item.id,
            title: item.title,
            concepts: (concepts.get(item.id) ?? []).map((c) => c.concept_slug),
            subtopics: strings(item.subtopics),
          };
          // Last and only when listed, as the file reader adds it.
          const videos = strings(item.videos);
          if (videos.length > 0) topic.videos = videos;
          return topic;
        }),
        resources: (resources.get(mod.id) ?? []).map((link): Resource => {
          const resource: Resource = {
            id: link.id.slice(ASSET_PREFIX.courses.length),
            title: link.title ?? "",
            url: link.url ?? "",
            type: (link.resource_type ?? "other") as ResourceType,
          };
          const placed = (lessons.get(link.id) ?? []).filter((l) => l.collection_id === mod.id).map((l) => l.curriculum_item_id);
          if (placed.length > 0) resource.lessons = placed;
          return resource;
        }),
        ...moduleVideos(mod.metadata),
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
    const credit = storedCredit(meta);
    if (row.cover_blob_key !== null && credit !== null) {
      const { ext } = keyParts(row.cover_blob_key);
      if ((COURSE_COVER_EXTENSIONS as readonly string[]).includes(ext)) {
        course.cover = { file: coverFileName(course.code, ext as CourseCoverExtension), ...credit };
      }
    }
    return course;
  });
}

/** `{ videos }` when a module's metadata lists any, else nothing: spread last, as the file reader adds the key. */
function moduleVideos(metadata: Record<string, unknown> | null | undefined): { videos?: string[] } {
  const videos = strings(metadata?.["videos"]);
  return videos.length > 0 ? { videos } : {};
}

/**
 * Every reading's lesson links to a live item, with the item's module so a
 * caller keeps only the ones in the reading's own module, in `lessons:`
 * order. Scoped at both ends: the item and the reading are the owners'.
 * A database before 0022 has no such table, and reads as no lessons.
 */
async function lessonLinks(
  db: CatalogDatabase,
  owners: Owners,
): Promise<{ asset_id: string; curriculum_item_id: string; collection_id: string }[]> {
  const [present] = await rows<{ present: boolean }>(
    db,
    sql`select to_regclass('public.curriculum_item_asset') is not null as present`,
  );
  if (present?.present !== true) return [];
  return rows(
    db,
    sql`select l.asset_id, l.curriculum_item_id, i.collection_id
        from curriculum_item_asset l
        join curriculum_item i on i.id = l.curriculum_item_id
        join asset a on a.id = l.asset_id
        where i.archived_at is null${andOwnedBy(sql`i.owner_id`, owners)}${andOwnedBy(sql`a.owner_id`, owners)}
        order by l.asset_id collate "C", l.position, l.curriculum_item_id collate "C"`,
  );
}

export const reader: TypeReader<"courses"> = {
  ready: true,
  read: (db, scope) => () => readCourses(db, scope.readable),
};
