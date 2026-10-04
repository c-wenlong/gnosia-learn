import { formatCaps } from "./blob-audit";
import { ownerCapsOrError, type OwnerCaps } from "../content/blob";
import { catalogInstance, COMMONS_OWNER, contentSource } from "@self-learn/schema";
import { sql } from "drizzle-orm";

import {
  COMPLETENESS_RULES,
  outOfOrder,
  triggerStates,
  WRITE_GUARDED_TABLES,
  writeGuardName,
} from "../content/rules";
import { BLOB_CONTRACT_MIGRATION, blobContractDistance, blobContractInForce } from "../content/blob-contract";
import { linkOwners, type LinkOwnerReport } from "../content/link-owners";
import { restampLinkOwners } from "../content/topics";
import { type CatalogDatabase, withDatabase } from "../db";
import { databaseUrl, redactUrl } from "../env";
import { migrationStatus } from "../migrations";

/**
 * `catalog doctor`: how far the content is from the rules the database can
 * enforce (D21 of docs/CONTENT-MIGRATION.md).
 *
 * Every completeness rule migration 0010 created as a disabled constraint
 * trigger is run here as a plain query over the whole table, and every
 * violator is listed by id. That count is the distance to `catalog flip
 * <type> --strict`, which refuses while it is not zero. The report also says
 * which rules and write guards are armed, and whether this database is the
 * primary.
 *
 * Exit 0 unless the database contradicts itself: an armed rule with a
 * violator (a row written while it was disarmed), a trigger the migration
 * should have created and did not, or a link whose owner is not its parent's
 * (D24, which `--fix` repairs). A disarmed rule with violators is the
 * expected state until its type flips, and is reported, not failed; so is a
 * link to a row its owner cannot read.
 */

const SAMPLE = 50;

export interface RuleReport {
  name: string;
  says: string;
  type: string;
  /** `armed` when every trigger is on, `disarmed` when none is, `partial` otherwise. */
  state: "armed" | "disarmed" | "partial" | "missing";
  violators: number;
  /** The first violators, `id` and a detail such as the course or the concept. */
  sample: { id: string; detail: string }[];
  /** A `catalog flip --waive` entry for this rule, if one was recorded. */
  waived: { type: string; reason: string } | null;
}

export interface CourseCompleteness {
  course: string;
  items: number;
  withoutConcept: number;
}

export interface DoctorResult {
  database: string;
  migrations: { head: string | null; pending: string[] };
  instance: { role: string; primaryHost: string | null } | null;
  rules: RuleReport[];
  /**
   * The rules neither armed nor waived. Phase 3's cut-over ends only when
   * this is empty: every rule refuses its next violator, or a written
   * decision on `content_source` says why it does not (D21).
   */
  unsettled: string[];
  /**
   * The item-has-concept rule per course. A course whose every item lacks a
   * concept is a course the frontier cannot reach at all.
   */
  courses: CourseCompleteness[];
  /** Courses where no live item names a concept. */
  conceptlessCourses: string[];
  /**
   * `assumes` edges a course teaches out of order: the prerequisite after
   * the concept. Soft, so warned about and never counted; the `requires`
   * case is the course-order-respects-requires rule.
   */
  orderWarnings: { course: string; concept: string; prerequisite: string }[];
  /**
   * Videos a course lists (`videos:` on a module, or on a lesson when `item`
   * is set) that resolve to no `video` asset the module's owner can read.
   * The module path leaves each off; a reference waiting for its tool to be
   * indexed, so reported and never counted
   * (docs/proposals/module-learning-path.md, "Videos name their concepts").
   */
  danglingVideos: { course: string; module: string; item: string | null; id: string }[];
  /**
   * Live modules on a vocabulary topic another live module also names, that
   * list no video of their own: their path falls back to the topic's videos,
   * which may be the other module's. Reported, never counted.
   */
  sharedTopicWithoutVideos: { course: string; module: string; topic: string }[];
  /**
   * Concepts with no topic, archived ones included. Not a trigger: the
   * column is `NOT NULL` from Track C's contract migration (0012), which
   * refuses to run while this is not empty and makes it empty for good.
   */
  conceptsWithoutTopic: string[];
  /** Whether `concept.topic_slug` is `NOT NULL` here yet, which 0012 makes it. */
  conceptTopicRequired: boolean;
  /**
   * Phase 2's contract (migration 0013): the assets of a stored kind with no
   * blob, and the blob keys the package would not make. Migration 0013
   * refuses, and `catalog migrate` holds it back, until both are empty.
   */
  blobContract: {
    inForce: boolean;
    unstored: { id: string; kind: string }[];
    unkeyed: string[];
  };
  /** Write-seam guards (D4), armed per table by `catalog flip`. */
  writeGuards: Record<string, boolean | null>;
  /**
   * Links and owners (D24): relations and manimkc mappings whose `owner_id`
   * is not their topic's (`--fix` restamps them), and links or rows pointing
   * at another owner's row that their own owner cannot read (reported only).
   * Each counts as a violation.
   */
  links: LinkOwnerReport & { restamped: string[] };
  /**
   * The per-owner blob caps in force, or why they cannot be read (phase 4).
   * Said, not counted: an unreadable cap refuses new uploads, which is the
   * environment's problem and not a row that breaks a rule. `blob audit`
   * exits 1 on it.
   */
  caps: OwnerCaps | { error: string };
  violations: number;
  ok: boolean;
}

export async function runDoctor(options: { fix?: boolean } = {}): Promise<DoctorResult> {
  const url = databaseUrl();
  return withDatabase(({ db }) => doctor(db, redactUrl(url), options));
}

/** The last migration of phase 0's expand, which every table this report reads needs. */
const LAST_EXPAND = 11;

export async function doctor(
  db: CatalogDatabase,
  database: string,
  options: { fix?: boolean } = {},
): Promise<DoctorResult> {
  const migrations = await migrationStatus(db);
  const empty: DoctorResult = {
    database,
    migrations: { head: migrations.head, pending: migrations.pending },
    instance: null,
    rules: [],
    unsettled: [],
    courses: [],
    conceptlessCourses: [],
    orderWarnings: [],
    danglingVideos: [],
    sharedTopicWithoutVideos: [],
    conceptsWithoutTopic: [],
    conceptTopicRequired: false,
    blobContract: { inForce: false, unstored: [], unkeyed: [] },
    writeGuards: {},
    links: { mixed: [], unreadable: [], restamped: [] },
    caps: ownerCapsOrError(),
    violations: 0,
    ok: false,
  };
  // The tables and triggers below arrive in 0010 and 0011; on an older
  // database the honest report is "migrate first", not a relation-does-not-
  // exist error. A database behind only on a later migration is reported in
  // full, since a contract migration such as 0012 is exactly what this report
  // says whether it can apply.
  const expandPending = migrations.pending.some((tag) => Number(tag.slice(0, 4)) <= LAST_EXPAND);
  if (migrations.head === null || expandPending) return empty;

  const [instance] = await db.select().from(catalogInstance).limit(1);
  const sources = await db.select().from(contentSource);
  const waivers = new Map<string, { type: string; reason: string }>();
  for (const source of sources) {
    for (const entry of (source.waivers as { rule?: unknown; reason?: unknown }[]) ?? []) {
      if (typeof entry.rule === "string") {
        waivers.set(entry.rule, { type: source.type, reason: String(entry.reason ?? "") });
      }
    }
  }

  const triggerNames = [
    ...COMPLETENESS_RULES.flatMap((rule) => rule.triggers.map(([, trigger]) => trigger)),
    ...WRITE_GUARDED_TABLES.map(writeGuardName),
  ];
  const states = await triggerStates(db, triggerNames);

  const rules: RuleReport[] = [];
  for (const rule of COMPLETENESS_RULES) {
    const { rows } = await db.execute<{ id: string; detail: string }>(rule.violators);
    const flags = rule.triggers.map(([, trigger]) => states.get(trigger));
    const state = flags.some((flag) => flag === undefined)
      ? "missing"
      : flags.every(Boolean)
        ? "armed"
        : flags.some(Boolean)
          ? "partial"
          : "disarmed";
    rules.push({
      name: rule.name,
      says: rule.says,
      type: rule.type,
      state,
      violators: rows.length,
      sample: rows.slice(0, SAMPLE).map((row) => ({ id: row.id, detail: row.detail })),
      waived: waivers.get(rule.name) ?? null,
    });
  }

  const courses = await db.execute<{ course: string; items: number; without: number }>(sql`
    select coalesce(m.parent_id, m.id) as course,
           count(*)::int as items,
           count(*) filter (
             where not exists (
               select 1 from concept_curriculum_item l where l.curriculum_item_id = i.id
             )
           )::int as without
    from curriculum_item i
    join collection m on m.id = i.collection_id
    where i.archived_at is null
    group by 1
    order by coalesce(m.parent_id, m.id) collate "C"
  `);
  const courseRows = courses.rows.map((row) => ({
    course: row.course,
    items: row.items,
    withoutConcept: row.without,
  }));

  const soft = await db.execute<{ id: string; concept: string; prerequisite: string }>(outOfOrder("assumes"));
  const { dangling, sharedWithout } = await listedVideos(db);

  // Archived concepts too: the column's `NOT NULL` binds every row, and
  // migration 0012 refuses while any row, archived or not, has a null.
  const orphans = await db.execute<{ slug: string }>(
    sql`select slug from concept where topic_slug is null order by slug collate "C"`,
  );
  const [topicColumn] = (
    await db.execute<{ nullable: string }>(sql`
      select is_nullable as nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'concept' and column_name = 'topic_slug'
    `)
  ).rows;

  const blobContract = { inForce: await blobContractInForce(db), ...(await blobContractDistance(db)) };

  const writeGuards: Record<string, boolean | null> = {};
  for (const table of WRITE_GUARDED_TABLES) {
    writeGuards[table] = states.get(writeGuardName(table)) ?? null;
  }

  // Asked before the violations are summed, so a --fix that repaired the
  // mixed rows reports what is left, which should be none.
  let links = await linkOwners(db);
  let restamped: string[] = [];
  if (options.fix === true && links.mixed.length > 0) {
    const written = await restampLinkOwners(
      db,
      links.mixed.map((row) => row.parent),
      {
        author: "catalog doctor",
        authorKind: "person",
        reason: "catalog doctor --fix: a relation or mapping belongs to its topic's owner (D24)",
      },
    );
    restamped = written.map((revision) => revision.id);
    links = await linkOwners(db);
  }

  const violations =
    rules.reduce((a, rule) => a + rule.violators, 0) +
    orphans.rows.length +
    blobContract.unstored.length +
    blobContract.unkeyed.length;
  const contradicted = rules.some(
    (rule) => rule.state === "missing" || (rule.state === "armed" && rule.violators > 0),
  );
  const missingGuard = Object.values(writeGuards).some((state) => state === null);

  return {
    database,
    migrations: { head: migrations.head, pending: migrations.pending },
    instance: instance === undefined ? null : { role: instance.role, primaryHost: instance.primaryHost },
    rules,
    unsettled: rules.filter((rule) => rule.state !== "armed" && rule.waived === null).map((rule) => rule.name),
    courses: courseRows,
    conceptlessCourses: courseRows
      .filter((row) => row.items > 0 && row.withoutConcept === row.items)
      .map((row) => row.course),
    orderWarnings: soft.rows.map((row) => ({ course: row.id, concept: row.concept, prerequisite: row.prerequisite })),
    danglingVideos: dangling,
    sharedTopicWithoutVideos: sharedWithout,
    conceptsWithoutTopic: orphans.rows.map((row) => row.slug),
    conceptTopicRequired: topicColumn?.nullable === "NO",
    blobContract,
    writeGuards,
    caps: ownerCapsOrError(),
    links: { ...links, restamped },
    violations: violations + links.mixed.length + links.unreadable.length,
    // A mixed row contradicts D24, which the seam enforces for every write,
    // as an armed rule's violator contradicts that rule; `--fix` repairs it.
    // A link to an unreadable row is reported and does not fail: the seam
    // carries one over on purpose, and removing it is a person's decision.
    ok: !contradicted && !missingGuard && links.mixed.length === 0,
  };
}

/**
 * The two module-path reports: listed videos that resolve to nothing, and
 * modules on a shared topic that list none. Whole-database, as the rest of
 * this report is; "resolves" means a `video` its module's owner can read
 * (their own or the commons'), which is what the page asks. The item lists
 * are read through `to_jsonb`, so a database without 0022 reports none.
 */
async function listedVideos(db: CatalogDatabase): Promise<{
  dangling: DoctorResult["danglingVideos"];
  sharedWithout: DoctorResult["sharedTopicWithoutVideos"];
}> {
  const listed = sql`
    select m.parent_id as course, m.id as module, null::text as item, v.id, m.owner_id
    from collection m
    cross join jsonb_array_elements_text(coalesce(m.metadata -> 'videos', '[]'::jsonb)) as v(id)
    where m.kind = 'module' and m.archived_at is null
    union all
    select m.parent_id, m.id, i.id, v.id, m.owner_id
    from curriculum_item i
    join collection m on m.id = i.collection_id
    cross join jsonb_array_elements_text(coalesce(to_jsonb(i) -> 'videos', '[]'::jsonb)) as v(id)
    where i.archived_at is null and m.archived_at is null`;
  const dangling = await db.execute<{ course: string; module: string; item: string | null; id: string }>(sql`
    with listed as (${listed})
    select course, module, item, id from listed l
    where not exists (
      select 1 from asset a
      where a.id = l.id and a.kind = 'video' and (a.owner_id = l.owner_id or a.owner_id = ${COMMONS_OWNER})
    )
    order by course collate "C", module collate "C", item collate "C" nulls first, id collate "C"
  `);
  const shared = await db.execute<{ course: string; module: string; topic: string }>(sql`
    with listed as (${listed}),
    module_topic as (
      select m.parent_id as course, m.id as module, t.topic_slug as topic
      from collection m
      join collection_item t on t.collection_id = m.id and t.topic_slug is not null
      where m.kind = 'module' and m.archived_at is null
    )
    select course, module, topic from module_topic mt
    where (select count(*) from module_topic o where o.topic = mt.topic) > 1
      and not exists (select 1 from listed l where l.module = mt.module)
    order by course collate "C", module collate "C"
  `);
  return { dangling: dangling.rows, sharedWithout: shared.rows };
}

export function formatDoctor(result: DoctorResult): string {
  const lines = [`database  ${result.database}`];
  if (result.migrations.head === null || result.migrations.pending.length > 0) {
    lines.push(
      `migrations are outstanding (${result.migrations.pending.join(", ") || "none applied"}). ` +
        `Run: npm run catalog -- migrate`,
    );
    // Behind the expand itself there is nothing more to read; behind only a
    // later migration, the rest of the report says whether it can apply.
    if (result.rules.length === 0) return lines.join("\n");
  }
  lines.push(
    `instance  ${result.instance === null ? "no catalog_instance row" : result.instance.role}` +
      (result.instance?.primaryHost ? ` (primary at ${result.instance.primaryHost})` : ""),
    "",
    "completeness rules",
  );
  for (const rule of result.rules) {
    const waived = rule.waived === null ? "" : `, waived for ${rule.waived.type}: ${rule.waived.reason}`;
    lines.push(
      `  ${rule.name.padEnd(30)} ${rule.state.padEnd(9)} ${String(rule.violators).padStart(4)} violators${waived}`,
    );
    lines.push(`    ${rule.says}`);
  }
  lines.push(
    result.unsettled.length === 0
      ? "  every rule is armed or waived"
      : `  neither armed nor waived: ${result.unsettled.join(", ")} (catalog flip courses --strict arms them; --waive <rule> --reason "..." records why not)`,
  );
  if (result.conceptlessCourses.length > 0) {
    lines.push(
      "",
      `courses with no concept on any item (${result.conceptlessCourses.length}):`,
      ...result.conceptlessCourses.map((course) => {
        const row = result.courses.find((c) => c.course === course);
        return `  ${course.padEnd(10)} ${row?.items ?? 0} items`;
      }),
    );
  }
  const partial = result.courses.filter(
    (row) => row.withoutConcept > 0 && row.withoutConcept < row.items,
  );
  if (partial.length > 0) {
    lines.push(
      "",
      "courses with some items missing a concept:",
      ...partial.map((row) => `  ${row.course.padEnd(10)} ${row.withoutConcept} of ${row.items} items`),
    );
  }
  if (result.orderWarnings.length > 0) {
    lines.push(
      "",
      `assumes edges taught out of order (${result.orderWarnings.length}, warnings only):`,
      ...result.orderWarnings.map((w) => `  ${w.course.padEnd(10)} ${w.concept} before ${w.prerequisite}, which it assumes`),
    );
  }
  if (result.danglingVideos.length > 0) {
    lines.push(
      "",
      `listed videos that resolve to no video (${result.danglingVideos.length}, left off the module path, not counted):`,
      ...result.danglingVideos.map(
        (v) =>
          `  ${v.course.padEnd(10)} ${v.item === null ? v.module : `${v.item} (${v.module})`} lists ${v.id}, which is no video in the catalog`,
      ),
    );
  }
  if (result.sharedTopicWithoutVideos.length > 0) {
    lines.push(
      "",
      `modules on a shared topic that list no video (${result.sharedTopicWithoutVideos.length}, their path shows the topic's videos, not counted):`,
      ...result.sharedTopicWithoutVideos.map((m) => `  ${m.course.padEnd(10)} ${m.module} on ${m.topic}`),
    );
  }
  lines.push(
    "",
    `concepts with no topic: ${result.conceptsWithoutTopic.length === 0 ? "none" : result.conceptsWithoutTopic.join(", ")}` +
      (result.conceptTopicRequired
        ? " (concept.topic_slug is NOT NULL)"
        : result.conceptsWithoutTopic.length === 0
          ? " (migration 0012 makes concept.topic_slug NOT NULL; nothing stands in its way)"
          : " (migration 0012, which makes concept.topic_slug NOT NULL, refuses until this is none)"),
  );
  const contract = result.blobContract;
  const distance = contract.unstored.length + contract.unkeyed.length;
  lines.push(
    `stored assets with no blob: ${contract.unstored.length === 0 ? "none" : contract.unstored.length}` +
      `; blob keys the package would not make: ${contract.unkeyed.length === 0 ? "none" : contract.unkeyed.length}` +
      (contract.inForce
        ? ` (${BLOB_CONTRACT_MIGRATION} is in force)`
        : distance === 0
          ? ` (${BLOB_CONTRACT_MIGRATION} requires both to be none; nothing stands in its way)`
          : ` (${BLOB_CONTRACT_MIGRATION}, which requires a blob behind every video, sidecar, poster and diagram SVG, ` +
            `refuses to apply until both are none: run catalog import, then catalog asset upload --source manimkc)`),
  );
  for (const row of contract.unstored.slice(0, SAMPLE)) lines.push(`  ${row.id} (${row.kind})`);
  if (contract.unstored.length > SAMPLE) lines.push(`  and ${contract.unstored.length - SAMPLE} more (--json lists all)`);
  for (const key of contract.unkeyed.slice(0, SAMPLE)) lines.push(`  key ${key}`);
  lines.push(`blob caps: ${formatCaps(result.caps)}`);
  const armed = Object.entries(result.writeGuards).filter(([, on]) => on === true).map(([t]) => t);
  const missing = Object.entries(result.writeGuards).filter(([, on]) => on === null).map(([t]) => t);
  lines.push(`write guards armed: ${armed.length === 0 ? "none" : armed.join(", ")}`);
  if (missing.length > 0) lines.push(`write guards MISSING: ${missing.join(", ")}`);
  const links = result.links;
  if (links.restamped.length > 0) lines.push(`restamped the links of ${links.restamped.join(", ")} to their topic's owner (D24)`);
  lines.push(
    `links whose owner is not their topic's: ${links.mixed.length === 0 ? "none" : `${links.mixed.length} (catalog doctor --fix restamps them)`}`,
  );
  for (const row of links.mixed.slice(0, SAMPLE)) {
    lines.push(`  ${row.table} ${row.parent} -> ${row.far}: ${row.owner}, its topic ${row.parentOwner}`);
  }
  lines.push(`links to a row their owner cannot read: ${links.unreadable.length === 0 ? "none" : links.unreadable.length}`);
  for (const row of links.unreadable.slice(0, SAMPLE)) {
    lines.push(`  ${row.table} ${row.parent} (${row.parentOwner}) -> ${row.far} (${row.farOwner})`);
  }
  lines.push("", `${result.violations} violations; ${result.ok ? "consistent" : "INCONSISTENT"}`);
  return lines.join("\n");
}
