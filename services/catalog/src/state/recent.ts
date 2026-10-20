import { concept, mastery, readableOwners } from "@self-learn/schema";
import { and, eq, inArray, type SQL, sql } from "drizzle-orm";

import { andOwnedBy, ownedBy, scopedRead } from "../content/scope";
import type { CatalogDatabase } from "../db";
import { masteryLabel } from "../../../../scripts/learn/lib/bkt.mjs";
import type { EventRecord } from "./events";
import type { KbConcept, MasteryLabel } from "./knowledge-base";
import { readParams } from "./mastery";

/**
 * The two reads behind the sidebar's Recent and Home's "Pick up where you
 * left off" that used to be the owner's whole `event` table and every
 * concept note (`readEvents` and `readKnowledgeBase`), bounded.
 *
 * Recent wants two things from the event log: the latest `visit` per module
 * and the latest `observation` per concept. Both are folded here, in the
 * database, into one record per module and one per concept, so what crosses
 * the wire grows with the modules and concepts touched, not with the log.
 * Then the concepts those records name, and nothing else, are read for their
 * titles and mastery (`recentConcepts`).
 */

/**
 * The owner's event log, folded: one `visit` record per module (or course
 * page) at its latest visit, and one `observation` record per concept at its
 * latest answer, outside any session a `void` retracted and only on concepts
 * the owner may read. The flat `EventRecord` shape `readEvents` gives, so the
 * web app's `moduleVisits` and `conceptTouches` read these as they read the
 * whole log and answer the same.
 *
 * `limit` bounds the concepts: the newest `limit` by their latest answer.
 * The visits are not limited, since they are at most one per module, a
 * number the catalog's courses bound, and a module whose course is gone is
 * dropped after this read, which a limit here would let crowd out a live one.
 *
 * Each kind comes back in the order its key first appears in the log (`at`,
 * then `id`, as `readEvents` orders it). That is the order a fold over the
 * whole log meets them in, so two rows touched in the same instant keep the
 * order they had when the fold ran over every event.
 */
export async function recentActivity(
  db: CatalogDatabase,
  learnerId: string,
  options: { limit?: number } = {},
): Promise<EventRecord[]> {
  const [visits, observations] = await Promise.all([
    latestVisits(db, learnerId),
    latestObservations(db, learnerId, options.limit),
  ]);
  return [...visits, ...observations];
}

type VisitRow = {
  course: string;
  module: string;
  at: Date | string;
};

/** The latest visit per course and module, a course page being module "". */
async function latestVisits(db: CatalogDatabase, learnerId: string): Promise<EventRecord[]> {
  // The web app's fold reads `course` and `module` only when they are
  // non-empty strings, so a number or an empty string here is no module.
  const { rows } = await db.execute<VisitRow>(sql`
    with visits as (
      select
        e.id,
        e.at,
        e.payload ->> 'course' as course,
        case
          when json_type(e.payload -> 'module') = 'string' then e.payload ->> 'module'
          else ''
        end as module
      from event e
      where e.learner_id = ${learnerId}
        and e.type = 'visit'
        and json_type(e.payload -> 'course') = 'string'
        and e.payload ->> 'course' <> ''
    )
    select
      course,
      module,
      ${millis(sql`max(at)`)} as at,
      min(at) as first_at,
      json_extract(json_group_array(id order by at, id), '$[0]') as first_id
    from visits
    group by course, module
    order by first_at, first_id`);
  return rows.map((r) => ({
    at: iso(r.at),
    type: "visit",
    course: r.course,
    ...(r.module === "" ? {} : { module: r.module }),
  }));
}

type ObservationRow = {
  concept: string;
  at: Date | string;
};

/** The latest answer per readable concept, the newest `limit` of them. */
async function latestObservations(db: CatalogDatabase, learnerId: string, limit?: number): Promise<EventRecord[]> {
  const rows = await scopedRead(db, readableOwners(learnerId), async (owners) => {
    const result = await db.execute<ObservationRow>(sql`
      with voided as (
        select distinct v.session_id
        from event v
        where v.learner_id = ${learnerId}
          and v.type = 'void'
          and v.session_id is not null
          and v.session_id <> ''
      ),
      touched as (
        select
          e.concept_slug as concept,
          max(e.at) as at,
          min(e.at) as first_at,
          json_extract(json_group_array(e.id order by e.at, e.id), '$[0]') as first_id
        from event e
        where e.learner_id = ${learnerId}
          and e.type = 'observation'
          and e.concept_slug is not null
          and e.concept_slug <> ''
          and (e.session_id is null or e.session_id not in (select session_id from voided))
        group by e.concept_slug
      ),
      newest as (
        select t.concept, t.at, t.first_at, t.first_id
        from touched t
        join concept c on c.slug = t.concept${andOwnedBy(sql`c.owner_id`, owners)}
        order by t.at desc, t.first_at, t.first_id
        ${limit === undefined ? sql`` : sql`limit ${Math.max(0, Math.floor(limit))}`}
      )
      select concept, ${millis(sql`at`)} as at from newest order by first_at, first_id`);
    return result.rows;
  });
  return rows.map((r) => ({ at: iso(r.at), type: "observation", concept: r.concept }));
}

/** What Recent shows of a concept: its title and where its mastery stands. */
export type RecentConcept = Pick<KbConcept, "id" | "title" | "pL" | "mastery" | "observations">;

/**
 * Some concepts by slug, those the owner may read, with the title and the
 * mastery `readKnowledgeBase` would give them: p(L) from the owner's mastery
 * row, else the prior, and the label and observation count beside it. In no
 * particular order; a slug the owner cannot read, or no concept has, is left
 * out.
 */
export async function recentConcepts(
  db: CatalogDatabase,
  learnerId: string,
  slugs: readonly string[],
): Promise<RecentConcept[]> {
  const wanted = [...new Set(slugs)];
  if (wanted.length === 0) return [];
  const [rows, entries, params] = await Promise.all([
    scopedRead(db, readableOwners(learnerId), (owners) =>
      db
        .select({ slug: concept.slug, title: concept.title })
        .from(concept)
        .where(and(inArray(concept.slug, wanted), ownedBy(concept.ownerId, owners))),
    ),
    db
      .select({ slug: mastery.conceptSlug, pL: mastery.pL, observations: mastery.observations })
      .from(mastery)
      .where(and(eq(mastery.learnerId, learnerId), inArray(mastery.conceptSlug, wanted))),
    readParams(db, learnerId),
  ]);
  const bySlug = new Map(entries.map((e) => [e.slug, e]));
  return rows.map((row) => {
    const entry = bySlug.get(row.slug);
    const pL = entry?.pL ?? params.pL0;
    return {
      id: row.slug,
      title: row.title,
      pL,
      mastery: masteryLabel(pL) as MasteryLabel,
      observations: entry?.observations ?? 0,
    };
  });
}

/**
 * An instant as the ISO string `toISOString` writes, cut to the millisecond
 * in the database. A JavaScript `Date` holds milliseconds, so the fold over
 * the whole log compared times at that grain; text keeps the driver's
 * timestamp parsing out of it.
 */
function millis(column: SQL): SQL {
  return sql`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
}

function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}
