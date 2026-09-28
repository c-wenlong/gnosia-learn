import { sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { ASSET_PREFIX } from "../index/source";
import { diagramPaths } from "./diagram-document";
import { ExportError, type RenderFilter } from "./export";

/**
 * `catalog export --subset`: a small tree that `catalog import` reads on its
 * own, cut from the database (docs/CONTENT-MIGRATION.md, phase 2, Tests).
 * It is how `seed/` is made, and it is the only way it should be remade.
 *
 * What goes in, from four names:
 *
 * - the **topics** named, and nothing else of the vocabulary;
 * - the **course** named, with only its live modules filed under one of those
 *   topics, and the course's tags;
 * - every live **note** filed under one of those topics;
 * - one **session** log, and one **diagram** (its document and its SVG).
 *
 * A subset has to import into an empty database, so every reference inside
 * it must land inside it. Where one would not, the export is refused with
 * the reference named, rather than written with a hole the import would
 * refuse later: a note's `requires:` or `assumes:` naming a note outside the
 * subset, a module item's concept outside it, a diagram whose topic or
 * concepts are outside it. A session log's wikilinks are not references in
 * that sense: the import counts one that names no concept and carries on.
 *
 * Videos never enter a subset (D7), so each topic's `maps.manimkc` is left
 * out, and `catalog import` of the subset with the manimkc CLI present reads
 * no topic folder under any of its topics.
 */

export interface ExportSubset {
  topics: readonly string[];
  course: string;
  session: string;
  diagram: string;
}

type Row = Record<string, unknown>;

async function rows<T extends Row>(db: CatalogDatabase, query: ReturnType<typeof sql>): Promise<T[]> {
  return (await db.execute<T>(query)).rows as T[];
}

const list = (values: Iterable<string>) => sql.join([...values].map((v) => sql`${v}`), sql`, `);

/** The rows a subset keeps, or an `ExportError` naming every reference that would leave it. */
export async function subsetFilter(db: CatalogDatabase, subset: ExportSubset): Promise<RenderFilter> {
  const problems: string[] = [];
  const topics = new Set(subset.topics);

  const live = await rows<{ slug: string; archived: boolean }>(
    db,
    sql`select slug, archived_at is not null as archived from topic where slug in (${list(topics)})`,
  );
  const found = new Map(live.map((t) => [t.slug, t.archived]));
  for (const slug of topics) {
    if (!found.has(slug)) problems.push(`topic "${slug}" does not exist`);
    else if (found.get(slug) === true) problems.push(`topic "${slug}" is archived`);
  }

  const [course] = await rows<{ id: string; kind: string; archived: boolean }>(
    db,
    sql`select id, kind, archived_at is not null as archived from collection where id = ${subset.course}`,
  );
  if (course === undefined || course.kind !== "course") problems.push(`"${subset.course}" is not a course`);
  else if (course.archived) problems.push(`course "${subset.course}" is archived`);

  const modules = await rows<{ id: string; topic: string | null }>(
    db,
    sql`select c.id,
               (select m.topic_slug from collection_item m
                where m.collection_id = c.id and m.topic_slug is not null
                order by m.position limit 1) as topic
        from collection c
        where c.parent_id = ${subset.course} and c.kind = 'module' and c.archived_at is null
        order by c.position, c.id`,
  );
  const keptModules = modules.filter((m) => m.topic !== null && topics.has(m.topic)).map((m) => m.id);
  if (course !== undefined && keptModules.length === 0) {
    problems.push(
      `no live module of "${subset.course}" is filed under a named topic; its modules sit under ` +
        [...new Set(modules.map((m) => m.topic ?? "(none)"))].join(", "),
    );
  }

  const tags = await rows<{ tag_id: string }>(
    db,
    sql`select tag_id from collection_tag where collection_id = ${subset.course} order by position, tag_id`,
  );

  const concepts = new Set(
    (
      await rows<{ slug: string }>(
        db,
        sql`select slug from concept where archived_at is null and topic_slug in (${list(topics)})`,
      )
    ).map((c) => c.slug),
  );

  if (concepts.size > 0) {
    const outside = await rows<{ concept_slug: string; kind: string; prerequisite_slug: string; topic: string | null }>(
      db,
      sql`select p.concept_slug, p.kind, p.prerequisite_slug, c.topic_slug as topic
          from concept_prerequisite p join concept c on c.slug = p.prerequisite_slug
          where p.concept_slug in (${list(concepts)})
          order by p.concept_slug, p.kind, p.prerequisite_slug`,
    );
    for (const edge of outside) {
      if (concepts.has(edge.prerequisite_slug)) continue;
      problems.push(
        `note "${edge.concept_slug}" ${edge.kind} "${edge.prerequisite_slug}", which is filed under ` +
          `${edge.topic === null ? "no topic" : `"${edge.topic}"`}, not a named topic`,
      );
    }
  }

  if (keptModules.length > 0) {
    const links = await rows<{ item: string; concept_slug: string }>(
      db,
      sql`select l.curriculum_item_id as item, l.concept_slug
          from concept_curriculum_item l join curriculum_item i on i.id = l.curriculum_item_id
          where i.archived_at is null and i.collection_id in (${list(keptModules)})
          order by l.curriculum_item_id, l.concept_slug`,
    );
    for (const link of links) {
      if (!concepts.has(link.concept_slug)) {
        problems.push(`item "${link.item}" names concept "${link.concept_slug}", which is not filed under a named topic`);
      }
    }
  }

  const [log] = await rows<{ n: number }>(
    db,
    sql`select count(*)::int as n from session_log_entry where session_id = ${subset.session}`,
  );
  if ((log?.n ?? 0) === 0) problems.push(`session "${subset.session}" has no log`);

  const [drawing] = await rows<{ topic_slug: string; archived: boolean }>(
    db,
    sql`select topic_slug, archived_at is not null as archived from diagram where slug = ${subset.diagram}`,
  );
  if (drawing === undefined) problems.push(`diagram "${subset.diagram}" does not exist`);
  else if (drawing.archived) problems.push(`diagram "${subset.diagram}" is archived`);
  else if (!topics.has(drawing.topic_slug)) {
    problems.push(`diagram "${subset.diagram}" is filed under "${drawing.topic_slug}", not a named topic`);
  }
  const paths = diagramPaths(subset.diagram);
  const stamped = await rows<{ concept_slug: string }>(
    db,
    sql`select distinct concept_slug from asset_concept
        where asset_id in (${`${ASSET_PREFIX.diagrams}${paths.tldr}`}, ${`${ASSET_PREFIX.diagrams}${paths.svg}`})
        order by concept_slug`,
  );
  for (const { concept_slug } of stamped) {
    if (!concepts.has(concept_slug)) {
      problems.push(`diagram "${subset.diagram}" explains concept "${concept_slug}", which is not filed under a named topic`);
    }
  }

  if (problems.length > 0) {
    throw new ExportError(
      `export --subset: the subset would not import on its own\n  - ${problems.join("\n  - ")}`,
    );
  }
  return {
    topics,
    tags: new Set(tags.map((t) => t.tag_id)),
    courses: new Set([subset.course]),
    modules: new Set(keptModules),
    concepts,
    sessions: new Set([subset.session]),
    diagrams: new Set([subset.diagram]),
  };
}
