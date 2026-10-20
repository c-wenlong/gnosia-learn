import type { ContentType } from "@self-learn/schema";
import { sql, type SQL } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { ARMED_RULES_TABLE, registerDeferredRule } from "../db";

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
      order by c.id collate binary`,
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
      order by i.id collate binary`,
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
      order by l.curriculum_item_id collate binary, l.concept_slug collate binary`,
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
    -- Was distinct-on (m.parent_id, l.concept_slug): a row_number window is
    -- the same first-by-ordering pick in SQLite.
    with taught as (
      select course, concept, module_position, item_position, link_position from (
        select m.parent_id as course, l.concept_slug as concept,
          m.position as module_position, i.position as item_position, l.position as link_position,
          row_number() over (
            partition by m.parent_id, l.concept_slug
            order by m.position, i.position, l.position
          ) as rn
        from concept_curriculum_item l
        join curriculum_item i on i.id = l.curriculum_item_id and i.archived_at is null
        join collection m on m.id = i.collection_id and m.kind = 'module' and m.archived_at is null
        join collection c on c.id = m.parent_id and c.archived_at is null
      ) where rn = 1
    )
    select a.course as id, a.concept || ' before ' || b.concept as detail,
           a.concept as concept, b.concept as prerequisite
    from concept_prerequisite e
    join taught a on a.concept = e.concept_slug
    join taught b on b.concept = e.prerequisite_slug and b.course = a.course
    where e.kind = ${kind}
      and (b.module_position, b.item_position, b.link_position)
        > (a.module_position, a.item_position, a.link_position)
    order by a.course collate binary, a.concept collate binary, b.concept collate binary`;
}

/**
 * The three SQLite triggers that stand in for one Postgres
 * `INSERT OR UPDATE OR DELETE` guard — the suffixes `writeGuardNames` makes.
 */
export const TRIGGER_EVENTS = ["ins", "upd", "del"] as const;

export function writeGuardNames(pgName: string): string[] {
  return TRIGGER_EVENTS.map((event) => `${pgName}_${event}`);
}

/**
 * The SQLite trigger set `catalog flip` creates where `ALTER TABLE … ENABLE
 * TRIGGER` armed the Postgres one. Each guards the table named by the
 * Postgres trigger's prefix, and asks the same question: is the seam writing?
 */
function writeGuardDdl(table: string, pgName: string): string[] {
  const guard = (table: string, trigger: string, event: "INSERT" | "UPDATE" | "DELETE", suffix: string) =>
    `create trigger if not exists "${trigger}_${suffix}" before ${event} on "${table}" for each row` +
    ` when catalog_revision_id() is null begin` +
    ` select raise(abort, '42501: ${table} is written only through the content write seam: ${event.toLowerCase()} refused. ` +
    `Write through services/catalog/src/content/write.ts, which records who wrote it and why.'); end`;
  return [
    guard(table, pgName, "INSERT", "ins"),
    guard(table, pgName, "UPDATE", "upd"),
    guard(table, pgName, "DELETE", "del"),
  ];
}

/**
 * Whether each named trigger is enabled. On Postgres `pg_trigger.tgenabled`
 * answered; on SQLite a completeness rule is a row in `catalog_armed_rule`
 * (checked before commit by `inTransaction`) and a write guard is armed by
 * existence — all three of its per-event triggers being present.
 */
export async function triggerStates(
  db: CatalogDatabase,
  names: readonly string[],
): Promise<Map<string, boolean>> {
  const armedTable = db.get<{ name: string }>(
    sql`select name from sqlite_master where type = 'table' and name = ${ARMED_RULES_TABLE}`,
  );
  const armed = new Set<string>(
    armedTable === undefined
      ? []
      : db.all<{ name: string }>(sql.raw(`select name from ${ARMED_RULES_TABLE}`)).map((row) => row.name),
  );
  const existing = new Set(
    db.all<{ name: string }>(sql`select name from sqlite_master where type = 'trigger'`).map((row) => row.name),
  );
  const ruleByTrigger = new Map(
    COMPLETENESS_RULES.flatMap((rule) => rule.triggers.map(([, trigger]) => [trigger, rule.name] as const)),
  );
  const out = new Map<string, boolean>();
  for (const name of names) {
    const rule = ruleByTrigger.get(name);
    out.set(name, rule !== undefined ? armed.has(rule) : writeGuardNames(name).every((t) => existing.has(t)));
  }
  return out;
}

/**
 * Arm or disarm triggers by name. `ALTER TABLE … ENABLE TRIGGER` did this on
 * Postgres; on SQLite arming a write guard creates its three triggers and
 * disarming drops them, while a completeness rule's pair is a row in
 * `catalog_armed_rule` — the deferred-trigger stand-in `inTransaction`
 * checks at commit.
 */
export async function setTriggers(
  db: CatalogDatabase,
  pairs: readonly (readonly [string, string])[],
  enabled: boolean,
): Promise<void> {
  if (enabled) {
    await db.execute(
      sql.raw(`create table if not exists ${ARMED_RULES_TABLE} (name text primary key)`),
    );
  }
  for (const [table, trigger] of pairs) {
    const rule = COMPLETENESS_RULES.find((rule) => rule.triggers.some(([, name]) => name === trigger));
    if (rule !== undefined) {
      await db.execute(
        enabled
          ? sql`insert into ${sql.raw(ARMED_RULES_TABLE)} (name) values (${rule.name}) on conflict do nothing`
          : sql`delete from ${sql.raw(ARMED_RULES_TABLE)} where name = ${rule.name}`,
      );
      continue;
    }
    if (enabled) {
      for (const ddl of writeGuardDdl(table, trigger)) await db.execute(sql.raw(ddl));
    } else {
      for (const name of writeGuardNames(trigger)) {
        await db.execute(sql.raw(`drop trigger if exists ${quoteIdent(name)}`));
      }
    }
  }
}

function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

// `inTransaction` asks this map when a `catalog_armed_rule` row says a rule
// is armed; registering at module load means the check works however the
// connection was opened.
for (const rule of COMPLETENESS_RULES) registerDeferredRule(rule.name, rule.violators);
