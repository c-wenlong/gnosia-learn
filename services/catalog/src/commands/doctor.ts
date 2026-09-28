import { catalogInstance, contentSource } from "@self-learn/schema";
import { sql } from "drizzle-orm";

import {
  COMPLETENESS_RULES,
  triggerStates,
  WRITE_GUARDED_TABLES,
  writeGuardName,
} from "../content/rules";
import { BLOB_CONTRACT_MIGRATION, blobContractDistance, blobContractInForce } from "../content/blob-contract";
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
 * violator (a row written while it was disarmed) or a trigger the migration
 * should have created and did not. A disarmed rule with violators is the
 * expected state until its type flips, and is reported, not failed.
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
   * The item-has-concept rule per course. A course whose every item lacks a
   * concept is a course the frontier cannot reach at all.
   */
  courses: CourseCompleteness[];
  /** Courses where no live item names a concept. */
  conceptlessCourses: string[];
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
  violations: number;
  ok: boolean;
}

export async function runDoctor(): Promise<DoctorResult> {
  const url = databaseUrl();
  return withDatabase(({ db }) => doctor(db, redactUrl(url)));
}

/** The last migration of phase 0's expand, which every table this report reads needs. */
const LAST_EXPAND = 11;

export async function doctor(db: CatalogDatabase, database: string): Promise<DoctorResult> {
  const migrations = await migrationStatus(db);
  const empty: DoctorResult = {
    database,
    migrations: { head: migrations.head, pending: migrations.pending },
    instance: null,
    rules: [],
    courses: [],
    conceptlessCourses: [],
    conceptsWithoutTopic: [],
    conceptTopicRequired: false,
    blobContract: { inForce: false, unstored: [], unkeyed: [] },
    writeGuards: {},
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
    order by 1
  `);
  const courseRows = courses.rows.map((row) => ({
    course: row.course,
    items: row.items,
    withoutConcept: row.without,
  }));

  // Archived concepts too: the column's `NOT NULL` binds every row, and
  // migration 0012 refuses while any row, archived or not, has a null.
  const orphans = await db.execute<{ slug: string }>(
    sql`select slug from concept where topic_slug is null order by slug`,
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
    courses: courseRows,
    conceptlessCourses: courseRows
      .filter((row) => row.items > 0 && row.withoutConcept === row.items)
      .map((row) => row.course),
    conceptsWithoutTopic: orphans.rows.map((row) => row.slug),
    conceptTopicRequired: topicColumn?.nullable === "NO",
    blobContract,
    writeGuards,
    violations,
    ok: !contradicted && !missingGuard,
  };
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
            `is held until both are none: run catalog import, then catalog asset upload --source manimkc)`),
  );
  for (const row of contract.unstored.slice(0, SAMPLE)) lines.push(`  ${row.id} (${row.kind})`);
  if (contract.unstored.length > SAMPLE) lines.push(`  and ${contract.unstored.length - SAMPLE} more (--json lists all)`);
  for (const key of contract.unkeyed.slice(0, SAMPLE)) lines.push(`  key ${key}`);
  const armed = Object.entries(result.writeGuards).filter(([, on]) => on === true).map(([t]) => t);
  const missing = Object.entries(result.writeGuards).filter(([, on]) => on === null).map(([t]) => t);
  lines.push(`write guards armed: ${armed.length === 0 ? "none" : armed.join(", ")}`);
  if (missing.length > 0) lines.push(`write guards MISSING: ${missing.join(", ")}`);
  lines.push("", `${result.violations} violations; ${result.ok ? "consistent" : "INCONSISTENT"}`);
  return lines.join("\n");
}
