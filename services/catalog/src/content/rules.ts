import type { ContentType } from "@gnosia/schema";
import { sql, type SQL } from "drizzle-orm";

import type { CatalogDatabase } from "../db";

/**
 * The triggers migration 0010 creates disabled, by name, and the queries that
 * say how far the data is from each one being armed.
 *
 * `catalog doctor` reads this to report; `catalog flip <type> [--strict]`
 * (phase 1) reads it to arm. A trigger name here that the migration did not
 * create fails `test/content-seam.test.ts`, so the two cannot drift.
 */

/**
 * Content tables carrying a `<table>_write_guard` trigger, grouped by the
 * content type whose flip arms them (D4).
 *
 * `asset` and its links are written by five sources, so they are listed under
 * the two types whose flips remove the last writers outside the seam: the
 * studio's Accept, which went through `assert-output` until Track D made it
 * `catalog diagram put` (diagrams), and the upload command (manimkc).
 */
export const WRITE_GUARDS: Readonly<Record<ContentType, readonly string[]>> = {
  topics: ["topic", "topic_relation", "manimkc_topic"],
  tags: ["tag"],
  courses: [
    "collection",
    "collection_tag",
    "collection_item",
    "curriculum_item",
    "curriculum_item_topic",
    "concept_curriculum_item",
    "curriculum_item_asset",
  ],
  concepts: ["concept", "concept_prerequisite"],
  sessions: [],
  diagrams: ["diagram", "asset", "asset_topic", "asset_concept", "asset_derivation"],
  manimkc: ["asset", "asset_topic", "asset_concept", "asset_derivation"],
};

/** Every table with a write guard, once each. */
export const WRITE_GUARDED_TABLES: readonly string[] = [...new Set(Object.values(WRITE_GUARDS).flat())];

export const writeGuardName = (table: string) => `${table}_write_guard`;

export interface CompletenessRule {
  /** Stable name, for `catalog flip --waive <rule>` and the doctor report. */
  name: string;
  /** What the rule says, for a person reading doctor's output. */
  says: string;
  /** The type whose `--strict` flip arms it. */
  type: ContentType;
  /** `[table, trigger]` pairs, parent and child. */
  triggers: readonly (readonly [string, string])[];
  /**
   * The same predicate the trigger function checks, over the whole table:
   * one row per violator with `id` (what to fix) and `detail`.
   */
  violators: SQL;
}

export const COMPLETENESS_RULES: readonly CompletenessRule[] = [
  {
    name: "module-has-item",
    says: "every live module has at least one live curriculum item",
    type: "courses",
    triggers: [
      ["collection", "collection_module_has_item"],
      ["curriculum_item", "curriculum_item_module_has_item"],
    ],
    violators: sql`
      select c.id, coalesce(c.parent_id, '') as detail
      from collection c
      where c.kind = 'module' and c.archived_at is null
        and not exists (
          select 1 from curriculum_item i
          where i.collection_id = c.id and i.archived_at is null
        )
      order by c.id collate "C"`,
  },
  {
    name: "item-has-concept",
    says: "every live curriculum item names at least one concept",
    type: "courses",
    triggers: [
      ["curriculum_item", "curriculum_item_item_has_concept"],
      ["concept_curriculum_item", "concept_curriculum_item_item_has_concept"],
    ],
    violators: sql`
      select i.id, coalesce(m.parent_id, m.id) as detail
      from curriculum_item i
      join collection m on m.id = i.collection_id
      where i.archived_at is null
        and not exists (
          select 1 from concept_curriculum_item l where l.curriculum_item_id = i.id
        )
      order by i.id collate "C"`,
  },
  {
    name: "item-concept-in-module-topic",
    says: "an item's concepts are filed under its module's topic",
    type: "courses",
    triggers: [
      ["concept_curriculum_item", "concept_curriculum_item_concept_topic"],
      ["concept", "concept_concept_topic"],
      ["curriculum_item", "curriculum_item_concept_topic"],
      ["collection_item", "collection_item_concept_topic"],
    ],
    violators: sql`
      select l.curriculum_item_id as id, l.concept_slug as detail
      from concept_curriculum_item l
      join curriculum_item i on i.id = l.curriculum_item_id
      join concept c on c.slug = l.concept_slug
      where i.archived_at is null
        and not exists (
          select 1 from collection_item m
          where m.collection_id = i.collection_id and m.topic_slug = c.topic_slug
        )
      order by l.curriculum_item_id collate "C", l.concept_slug collate "C"`,
  },
  {
    name: "course-order-respects-requires",
    says: "a course teaches no concept before a concept it requires",
    type: "courses",
    triggers: [
      ["concept_prerequisite", "concept_prerequisite_course_order"],
      ["concept_curriculum_item", "concept_curriculum_item_course_order"],
      ["curriculum_item", "curriculum_item_course_order"],
      ["collection", "collection_course_order"],
    ],
    violators: outOfOrder("requires"),
  },
];

/**
 * Every edge of `kind` whose prerequisite a course teaches after the concept
 * that needs it, one row per course and edge: `id` the course, `detail`
 * "<concept> before <prerequisite>". A concept's place is its first
 * appearance in the course, by module, item and position in the item, live
 * rows only: the same order migration 0021's trigger checks.
 */
export function outOfOrder(kind: "requires" | "assumes"): SQL {
  return sql`
    with taught as (
      select distinct on (m.parent_id, l.concept_slug)
        m.parent_id as course, l.concept_slug as concept,
        m.position as module_position, i.position as item_position, l.position as link_position
      from concept_curriculum_item l
      join curriculum_item i on i.id = l.curriculum_item_id and i.archived_at is null
      join collection m on m.id = i.collection_id and m.kind = 'module' and m.archived_at is null
      join collection c on c.id = m.parent_id and c.archived_at is null
      order by m.parent_id, l.concept_slug, m.position, i.position, l.position
    )
    select a.course as id, a.concept || ' before ' || b.concept as detail,
           a.concept as concept, b.concept as prerequisite
    from concept_prerequisite e
    join taught a on a.concept = e.concept_slug
    join taught b on b.concept = e.prerequisite_slug and b.course = a.course
    where e.kind = ${kind}
      and (b.module_position, b.item_position, b.link_position)
        > (a.module_position, a.item_position, a.link_position)
    order by a.course collate "C", a.concept collate "C", b.concept collate "C"`;
}

/**
 * Whether each named trigger is enabled, from `pg_trigger`. `O` is enabled
 * for ordinary sessions; `D` is disabled. A missing trigger is absent from
 * the map, which the doctor reports as a schema problem.
 */
export async function triggerStates(
  db: CatalogDatabase,
  names: readonly string[],
): Promise<Map<string, boolean>> {
  const { rows } = await db.execute<{ name: string; enabled: string }>(sql`
    select t.tgname as name, t.tgenabled as enabled
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal
      and t.tgname = any(${sql.param([...names])}::text[])
  `);
  return new Map(rows.map((row) => [row.name, row.enabled !== "D"]));
}

/**
 * Arm or disarm triggers by name. `ALTER TABLE ... ENABLE TRIGGER` takes the
 * table's exclusive lock, so this belongs in a flip or a test, never on a hot
 * path.
 */
export async function setTriggers(
  db: CatalogDatabase,
  pairs: readonly (readonly [string, string])[],
  enabled: boolean,
): Promise<void> {
  for (const [table, trigger] of pairs) {
    await db.execute(
      sql.raw(
        `alter table ${quoteIdent(table)} ${enabled ? "enable" : "disable"} trigger ${quoteIdent(trigger)}`,
      ),
    );
  }
}

function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
