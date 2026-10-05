import type { OwnerScope } from "@self-learn/schema";
import { sql, type SQL } from "drizzle-orm";

import { andOwnedBy, type Owners, scopedRead } from "../content/scope";
import type { CatalogDatabase } from "../db";

/**
 * Where each asset came from, for the Library row's source line (L3 of
 * docs/proposals/library-by-type-and-day.md): the course and module it sits
 * in, the concepts it explains, the studio conversation that made it, and the
 * tutor session it is the log of.
 *
 * Every one of those is a join the catalog already holds, and none of them is
 * on the asset row:
 *
 * ```
 *   asset ─ collection_item.asset_id ─► module ─ parent_id ─► course    (place, "item")
 *         ─ asset_topic ─ collection_item.topic_slug ─► module ─► course (place, "topic")
 *         ─ asset_concept ──────────────────────────────► concept
 *         ─ asset_job ─► job ─ draft_id ─► draft                       (conversation)
 *         ◄ session.log_asset_id ─ session                            (session)
 * ```
 *
 * **One statement for a page of rows.** The five branches are a `UNION ALL`
 * over one `wanted` set, so the ids are sent once and the whole answer comes
 * from one snapshot: a page that asked five times could show a course for an
 * asset that a concurrent import had just moved. The caller decides which
 * parent wins (`rowSource` in the web app); this returns all of them, each
 * list in a stable order.
 *
 * **Scoped at both ends** (the "A read that forgets its owner" gotcha): an
 * asset the reader cannot read is not in `wanted`, and a parent the reader
 * cannot read (another owner's course, concept, draft or session) is left
 * out, so no other owner's title reaches the row. A session has no
 * `owner_id`; its learner is its owner.
 *
 * The place's topic branch is how `?course=` already finds an asset (a module
 * is filed under one topic, and an asset filed under it belongs to the
 * course), so it is returned as a fallback, marked `via: "topic"`, for an
 * asset no module lists by id.
 */

/** A course and the module in it that holds the asset. */
export interface AssetPlace {
  course: string;
  /** `collection.metadata.code`: "CS3230". Null for a course with none. */
  code: string | null;
  courseTitle: string;
  /** Null when the asset is listed on the course itself rather than a module. */
  module: string | null;
  moduleTitle: string | null;
  /** The module's position in its course; 0 when there is no module. */
  position: number;
  /** `item` when a module lists the asset by id, `topic` when it is filed under the module's topic. */
  via: "item" | "topic";
}

/** A conversation or a session the asset came out of. */
export interface AssetOrigin {
  id: string;
  /** Null when the row has none; the caller names it by kind. */
  title: string | null;
}

/**
 * A studio conversation that wrote the asset. Beside the planner's title it
 * carries the name the owner gave it (`draft.name`, which every page shows
 * first, `conversationTitle` in the web app) and when the conversation was
 * last written to (`draft.updated_at`), which the Library's group by
 * conversation dates its headings by and orders them on.
 */
export interface AssetConversation extends AssetOrigin {
  name: string | null;
  /** ISO 8601; null only when the row's instant did not read. */
  updatedAt: string | null;
}

export interface AssetParents {
  /** By code, then module position; `item` rows before `topic` rows. */
  places: AssetPlace[];
  /** Concept slugs, sorted. The caller orders them by the graph. */
  concepts: string[];
  /** Studio conversations, the one whose job wrote the asset most recently first. */
  conversations: AssetConversation[];
  /** Tutor sessions this asset is the log of, the latest first. */
  sessions: AssetOrigin[];
}

interface ParentRow extends Record<string, unknown> {
  asset_id: string;
  branch: "item" | "topic" | "concept" | "draft" | "session";
  course: string | null;
  code: string | null;
  course_title: string | null;
  module: string | null;
  module_title: string | null;
  position: number | null;
  ref: string | null;
  ref_title: string | null;
  ref_name: string | null;
  ref_updated: Date | string | null;
}

function instant(value: Date | string | null): string | null {
  if (value === null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * The parents of every asset in `ids` the reader may read, keyed by asset id.
 * An asset with no parent at all is absent, the `conceptsForAssets` contract;
 * an empty list asks nothing.
 */
export async function assetParents(
  db: CatalogDatabase,
  ids: readonly string[],
  scope: OwnerScope,
): Promise<Record<string, AssetParents>> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return {};
  const rows = await scopedRead(db, scope.readable, async (owners) => {
    const { rows } = await db.execute<ParentRow>(parentsQuery(wanted, owners));
    return rows;
  });

  const out: Record<string, AssetParents> = {};
  const entry = (id: string): AssetParents =>
    (out[id] ??= { places: [], concepts: [], conversations: [], sessions: [] });
  for (const row of rows) {
    const parents = entry(row.asset_id);
    switch (row.branch) {
      case "item":
      case "topic":
        if (row.course === null || row.course_title === null) break;
        // One place per course and module: a module listing the asset by id
        // and filed under its topic as well is one place, not two.
        if (parents.places.some((p) => p.course === row.course && p.module === row.module)) break;
        parents.places.push({
          course: row.course,
          code: row.code,
          courseTitle: row.course_title,
          module: row.module,
          moduleTitle: row.module_title,
          position: row.position ?? 0,
          via: row.branch,
        });
        break;
      case "concept":
        if (row.ref !== null) parents.concepts.push(row.ref);
        break;
      case "draft":
        if (row.ref !== null && !parents.conversations.some((c) => c.id === row.ref)) {
          parents.conversations.push({
            id: row.ref,
            title: row.ref_title,
            name: row.ref_name,
            updatedAt: instant(row.ref_updated),
          });
        }
        break;
      case "session":
        if (row.ref !== null) parents.sessions.push({ id: row.ref, title: row.ref_title });
        break;
    }
  }
  return out;
}

/** `and <column> in (owners)`, or nothing on a database from before owners. */
function owned(column: string, owners: Owners): SQL {
  return andOwnedBy(sql.raw(column), owners);
}

function parentsQuery(ids: readonly string[], owners: Owners): SQL {
  const list = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
  // Ordered so the TypeScript above only appends: the branch rank keeps a
  // module listing (`item`) ahead of a topic match for the same course, and
  // `collate "C"` keeps the order the same on CI's en_US database as on a
  // Homebrew one (the "CI is Linux" gotcha).
  return sql`
    with wanted as (
      select a.id from asset a where a.id in (${list})${owned("a.owner_id", owners)}
    )
    select * from (
      select w.id as asset_id, 'item' as branch,
             c.slug as course, c.metadata ->> 'code' as code, c.title as course_title,
             m.slug as module, m.title as module_title, m.position as position,
             null::text as ref, null::text as ref_title, null::text as ref_name, null::timestamptz as ref_updated,
             null::timestamptz as at, 0 as rank
      from wanted w
      join collection_item ci on ci.asset_id = w.id
      join collection m on m.id = ci.collection_id and m.kind = 'module' and m.archived_at is null${owned("m.owner_id", owners)}
      join collection c on c.id = m.parent_id and c.kind = 'course' and c.archived_at is null${owned("c.owner_id", owners)}
      union all
      select w.id, 'item',
             c.slug, c.metadata ->> 'code', c.title,
             null, null, 0,
             null, null, null, null, null, 0
      from wanted w
      join collection_item ci on ci.asset_id = w.id
      join collection c on c.id = ci.collection_id and c.kind = 'course' and c.archived_at is null${owned("c.owner_id", owners)}
      union all
      select w.id, 'topic',
             c.slug, c.metadata ->> 'code', c.title,
             m.slug, m.title, m.position,
             null, null, null, null, null, 1
      from wanted w
      join asset_topic at on at.asset_id = w.id
      join topic t on t.slug = at.topic_slug${owned("t.owner_id", owners)}
      join collection_item ci on ci.topic_slug = at.topic_slug
      join collection m on m.id = ci.collection_id and m.kind = 'module' and m.archived_at is null${owned("m.owner_id", owners)}
      join collection c on c.id = m.parent_id and c.kind = 'course' and c.archived_at is null${owned("c.owner_id", owners)}
      union all
      select w.id, 'concept',
             null, null, null, null, null, null,
             k.slug, null, null, null, null, 2
      from wanted w
      join asset_concept ac on ac.asset_id = w.id
      join concept k on k.slug = ac.concept_slug${owned("k.owner_id", owners)}
      union all
      select w.id, 'draft',
             null, null, null, null, null, null,
             d.id, d.title, d.name, d.updated_at, aj.written_at, 3
      from wanted w
      join asset_job aj on aj.asset_id = w.id${owned("aj.owner_id", owners)}
      join job j on j.id = aj.job_id${owned("j.owner_id", owners)}
      join draft d on d.id = j.draft_id${owned("d.owner_id", owners)}
      union all
      select w.id, 'session',
             null, null, null, null, null, null,
             s.id, s.title, null, null, s.started_at, 4
      from wanted w
      join session s on s.log_asset_id = w.id${owned("s.learner_id", owners)}
    ) parents
    order by asset_id collate "C", rank,
             code collate "C" nulls last, course collate "C", position, module collate "C" nulls first,
             at desc nulls last, ref collate "C"`;
}
