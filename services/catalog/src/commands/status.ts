import { formatCaps } from "./blob-audit";
import { ownerCapsOrError, type OwnerCaps } from "../content/blob";
import {
  collection,
  conceptCurriculumItem,
  CONTENT_TABLES,
  curriculumItem,
  indexRun,
  INDEX_SOURCES,
  mirror,
  MIRROR_STATUSES,
  OPERATIONAL_TABLES,
  STATE_TABLES,
  STUDIO_TABLES,
  type TableName,
  tables,
} from "@self-learn/schema";
import { and, asc, count, eq, getTableName, isNull, max, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { withDatabase } from "../db";
import { databaseUrl, redactUrl } from "../env";
import { type HeldMigration, heldMigrations, isContractMigration, migrationStatus } from "../migrations";
import { bytewise } from "../sql-order";
import { parseChecks } from "../../../../scripts/learn/lib/markdown.mjs";

/** One row per source, whether or not it has ever been indexed. */
export interface SourceStatus {
  source: string;
  /** ISO instant of the last successful run, or null if it has never run. */
  lastIndexedAt: string | null;
  /** What that run read. Repo-relative, or an absolute manimkc root. */
  sourceRoot: string | null;
  written: number;
  deleted: number;
  /** Rows written per table by that run. */
  counts: Record<string, number>;
}

/**
 * Mirror coverage for one destination: how many deliverables are there, and how
 * long ago anyone looked.
 *
 * `checked` is the newest `checked_at` across the destination's rows, which is
 * when the last audit that could reach it ran. A destination signed out for a
 * week keeps its rows and keeps last week's stamp, which is the honest answer:
 * those counts were true then and nothing has confirmed them since.
 */
export interface MirrorCoverage {
  present: number;
  stale: number;
  missing: number;
  unknown: number;
  checked: string | null;
}

/**
 * How much of one course the frontier can reach: its checklist rows, and how
 * many of them list a concept. A row with no concept is a tick and nothing
 * else, so this is the distance from "the course is in the catalog" to "the
 * course is a mastery path" (docs/proposals/course-items-declare-concepts.md).
 */
export interface CourseCoverage {
  course: string;
  items: number;
  withConcepts: number;
  /** Curated links on the course's live modules (0022: docs/proposals/module-learning-path.md). */
  readings: number;
  /** How many of those name at least one live lesson in `lessons:`; the rest are module material. */
  readingsOnLessons: number;
  /** The distinct concepts the course's live lessons teach. */
  concepts: number;
  /** How many of those notes hold at least one check, which the week check asks from. */
  conceptsWithChecks: number;
}

export interface StatusResult {
  database: string;
  migrations: {
    head: string | null;
    latest: string | null;
    pending: string[];
    /**
     * What `catalog migrate` holds, and why (`heldMigrations`). Empty unless
     * every pending migration is a contract migration whose data is not ready,
     * which adds no table, so the counts below are still read.
     */
    held: HeldMigration[];
  };
  /** Row count keyed by SQL table name, in dependency order. */
  rows: Record<string, number>;
  /**
   * Four groups, not two. The studio tables are as durable as the state half
   * and about a different subject, so a render failure must not inflate the
   * count of what a learner did.
   */
  totals: { content: number; state: number; operational: number; studio: number };
  /**
   * When each source was last indexed. The question this answers is "is the
   * content half stale", which no row count can: a table full of rows from a
   * checkout three weeks old looks exactly like a fresh one.
   */
  sources: SourceStatus[];
  /**
   * Mirror coverage per destination, or an empty object when nothing has been
   * audited. This is the "did it reach Google Drive" question, which no row
   * count answers: a video row says the file exists here, not that a copy of it
   * exists anywhere else.
   */
  mirrors: Record<string, MirrorCoverage>;
  /** Per course, how many checklist rows list a concept. Empty until courses are indexed. */
  coverage: CourseCoverage[];
  /**
   * The per-owner blob caps in force, or why they cannot be read, in which
   * case every new upload is refused until they can (phase 4). Read from the
   * environment, so it is said even when the database is behind.
   */
  caps: OwnerCaps | { error: string };
}

function half(name: TableName): "content" | "state" | "operational" | "studio" {
  if ((CONTENT_TABLES as readonly TableName[]).includes(name)) return "content";
  if ((STATE_TABLES as readonly TableName[]).includes(name)) return "state";
  if ((OPERATIONAL_TABLES as readonly TableName[]).includes(name)) return "operational";
  if ((STUDIO_TABLES as readonly TableName[]).includes(name)) return "studio";
  // Only reachable if a table is added to `tables` and to none of the lists.
  // Loud beats a count that quietly lands in the wrong half.
  throw new Error(
    `table ${name} is in none of CONTENT_TABLES, STATE_TABLES, OPERATIONAL_TABLES, STUDIO_TABLES`,
  );
}

/** Every source, in dependency order, with its last run folded in. */
function sourceStatuses(runs: (typeof indexRun.$inferSelect)[]): SourceStatus[] {
  const byName = new Map(runs.map((run) => [run.source, run]));
  return INDEX_SOURCES.map((source) => {
    const run = byName.get(source);
    return {
      source,
      lastIndexedAt: run?.finishedAt.toISOString() ?? null,
      sourceRoot: run?.sourceRoot ?? null,
      written: run?.written ?? 0,
      deleted: run?.deleted ?? 0,
      counts:
        run?.counts !== undefined && run.counts !== null
          ? (run.counts as Record<string, number>)
          : {},
    };
  });
}

export async function runStatus(): Promise<StatusResult> {
  const url = databaseUrl();
  return withDatabase(async ({ db }) => {
    const migrations = await migrationStatus(db);
    const rows: Record<string, number> = {};
    const totals = { content: 0, state: 0, operational: 0, studio: 0 };
    // A held contract migration adds constraints and no table, so the tables
    // are the ones this code knows; one queued behind it might add some.
    const held = (await heldMigrations(db, { status: migrations })) ?? [];
    const onlyHeld = held.length > 0 && held.every((h) => isContractMigration(h.tag));

    if (migrations.head === null || (migrations.pending.length > 0 && !onlyHeld)) {
      // Two cases, one answer: nothing applied, so no table exists; or some
      // applied and some not, so the tables that exist are not the tables this
      // code knows about. `index_run` arrives in 0002, so a database stopped at
      // 0000 or 0001 has a non-null head and no such table, and counting would
      // fail with "relation does not exist" instead of saying the obvious
      // thing, which is that migrations are outstanding.
      return {
        database: redactUrl(url),
        migrations: {
          head: migrations.head,
          latest: migrations.latest,
          pending: migrations.pending,
          held,
        },
        rows,
        totals,
        sources: sourceStatuses([]),
        mirrors: {},
        coverage: [],
        caps: ownerCapsOrError(),
      };
    }

    // One statement, one round trip: a UNION ALL of counts. Sequential counts
    // would be 19 round trips for a command whose whole point is to be cheap.
    const parts = (Object.keys(tables) as TableName[]).map((key) => {
      const table = tables[key];
      return sql`select ${getTableName(table)} as name, count(*) as rows from ${table}`;
    });
    const counted = await db.execute<{ name: string; rows: number }>(
      sql.join(parts, sql.raw(" union all ")),
    );
    const byName = new Map(counted.rows.map((row) => [row.name, row.rows]));

    for (const key of Object.keys(tables) as TableName[]) {
      const name = getTableName(tables[key]);
      const count = byName.get(name) ?? 0;
      rows[name] = count;
      totals[half(key)] += count;
    }

    const runs = await db.select().from(indexRun).orderBy(asc(bytewise(indexRun.source)));

    return {
      database: redactUrl(url),
      migrations: {
        head: migrations.head,
        latest: migrations.latest,
        pending: migrations.pending,
        held,
      },
      rows,
      totals,
      sources: sourceStatuses(runs),
      mirrors: await mirrorCoverage(db),
      coverage: await courseCoverage(db),
      caps: ownerCapsOrError(),
    };
  });
}

/** One row per course, in shortlist order: its items and how many list a concept. */
async function courseCoverage(db: Db): Promise<CourseCoverage[]> {
  const course = alias(collection, "course");
  const rows = await db
    .select({
      course: course.id,
      items: sql<number>`count(distinct ${curriculumItem.id})`,
      withConcepts: sql<number>`count(distinct ${conceptCurriculumItem.curriculumItemId})`,
    })
    .from(course)
    // Live rows only: an archived module or item is off the course path (D12),
    // and counting it would put a row nobody can fill in into the distance to
    // zero that `flip courses --strict` waits on. Left joins, so a live course
    // whose every item was archived still appears, with 0 items, rather than
    // dropping out of the report.
    .leftJoin(collection, and(eq(collection.parentId, course.id), isNull(collection.archivedAt)))
    .leftJoin(
      curriculumItem,
      and(eq(curriculumItem.collectionId, collection.id), isNull(curriculumItem.archivedAt)),
    )
    .leftJoin(conceptCurriculumItem, eq(conceptCurriculumItem.curriculumItemId, curriculumItem.id))
    .where(and(eq(course.kind, "course"), isNull(course.archivedAt)))
    .groupBy(course.id, course.position)
    .orderBy(asc(course.position), asc(bytewise(course.id)));
  const placed = await readingCoverage(db);
  const checked = await checkCoverage(db);
  return rows.map((row) => ({
    ...row,
    readings: 0,
    readingsOnLessons: 0,
    ...placed.get(row.course),
    concepts: 0,
    conceptsWithChecks: 0,
    ...checked.get(row.course),
  }));
}

/**
 * Per course, the distinct concepts its live lessons teach and how many of
 * their notes hold a check, counted with the pipeline's own `parseChecks`
 * (phase 6 of docs/proposals/module-learning-path.md: the week check asks
 * from those checks, and the tutor writes a question for a note with none).
 */
async function checkCoverage(db: Db): Promise<Map<string, { concepts: number; conceptsWithChecks: number }>> {
  const { rows } = await db.execute<{ course: string; slug: string; body: string | null }>(sql`
    select distinct m.parent_id as course, c.slug, c.body
    from concept_curriculum_item l
    join curriculum_item i on i.id = l.curriculum_item_id and i.archived_at is null
    join collection m on m.id = i.collection_id and m.kind = 'module' and m.archived_at is null
    join concept c on c.slug = l.concept_slug
    where m.parent_id is not null`);
  const out = new Map<string, { concepts: number; conceptsWithChecks: number }>();
  for (const row of rows) {
    const entry = out.get(row.course) ?? { concepts: 0, conceptsWithChecks: 0 };
    entry.concepts += 1;
    if ((parseChecks(row.body ?? "") as unknown[]).length > 0) entry.conceptsWithChecks += 1;
    out.set(row.course, entry);
  }
  return out;
}

/**
 * Per course, its readings (the curated links its live modules hold) and how
 * many of them a `lessons:` list places on a live lesson. A database before
 * 0022 has no lesson links, and counts every reading as unplaced.
 */
async function readingCoverage(db: Db): Promise<Map<string, { readings: number; readingsOnLessons: number }>> {
  const { rows: present } = await db.execute<{ present: boolean }>(
    sql`select exists(select 1 from sqlite_master where type = 'table' and name = 'curriculum_item_asset') as present`,
  );
  const lessons = present[0]?.present === true;
  const { rows } = await db.execute<{ course: string; readings: number; placed: number }>(sql`
    select m.parent_id as course, count(distinct r.asset_id) as readings,
      ${
        lessons
          ? sql`count(distinct r.asset_id) filter (where exists (
              select 1 from curriculum_item_asset l
              join curriculum_item i on i.id = l.curriculum_item_id
              where l.asset_id = r.asset_id and i.collection_id = m.id and i.archived_at is null))`
          : sql`0`
      } as placed
    from collection m
    join collection_item r on r.collection_id = m.id and instr(r.asset_id, 'link:') = 1
    where m.kind = 'module' and m.archived_at is null and m.parent_id is not null
    group by m.parent_id`);
  return new Map(rows.map((row) => [row.course, { readings: row.readings, readingsOnLessons: row.placed }]));
}

type Db = Parameters<Parameters<typeof withDatabase<StatusResult>>[0]>[0]["db"];

const empty = (): MirrorCoverage => ({
  present: 0,
  stale: 0,
  missing: 0,
  unknown: 0,
  checked: null,
});

/**
 * Destinations the last `mirrors` run reached, whether or not it wrote a row.
 *
 * The `mirror` table alone cannot answer this. A reachable destination whose
 * ledger matched no asset writes nothing and clears whatever it had, so it
 * would drop out of the report and read as never audited, which is the
 * opposite of what happened. `index_run.metadata` is where the run says what
 * it actually saw, so that is where the list of destinations comes from and
 * the table only supplies the counts.
 */
async function auditedDestinations(db: Db): Promise<Record<string, MirrorCoverage>> {
  const run = (
    await db
      .select({ metadata: indexRun.metadata })
      .from(indexRun)
      .where(eq(indexRun.source, "mirrors"))
      .limit(1)
  )[0];
  const raw = (run?.metadata ?? {}) as { destinations?: unknown };
  const out: Record<string, MirrorCoverage> = {};
  for (const entry of Array.isArray(raw.destinations) ? raw.destinations : []) {
    const row = entry as { destination?: unknown; reachable?: unknown; checked?: unknown };
    // An unreachable destination is deliberately not seeded. Its rows, if it
    // has any, still come through the table with the older stamp that says
    // when they were last true; with none, there is nothing to report.
    if (typeof row?.destination !== "string" || row.reachable !== true) continue;
    out[row.destination] = {
      ...empty(),
      checked: typeof row.checked === "string" ? new Date(row.checked).toISOString() : null,
    };
  }
  return out;
}

/**
 * One grouped scan of `mirror`, counting each status per destination, over the
 * destinations the last run reached. A count per status per destination would
 * be four queries times however many mirrors exist, for a command whose whole
 * point is to be cheap.
 */
async function mirrorCoverage(db: Db): Promise<Record<string, MirrorCoverage>> {
  const out = await auditedDestinations(db);
  const counted = await db
    .select({
      destination: mirror.destination,
      status: mirror.status,
      rows: count(),
      checked: max(mirror.checkedAt),
    })
    .from(mirror)
    .groupBy(mirror.destination, mirror.status)
    .orderBy(asc(bytewise(mirror.destination)));

  for (const row of counted) {
    const entry = (out[row.destination] ??= empty());
    // A status outside the vocabulary cannot reach the table (there is a CHECK
    // on it), so this only guards against the column and the constant drifting.
    if ((MIRROR_STATUSES as readonly string[]).includes(row.status)) {
      entry[row.status as (typeof MIRROR_STATUSES)[number]] = row.rows;
    }
    const at = row.checked === null ? null : new Date(row.checked).toISOString();
    if (at !== null && (entry.checked === null || at > entry.checked)) entry.checked = at;
  }
  return out;
}

export function formatStatus(result: StatusResult): string {
  const lines = [
    `database   ${result.database}`,
    `head       ${result.migrations.head ?? "(none applied)"}`,
    `latest     ${result.migrations.latest ?? "(none on disk)"}`,
    `pending    ${result.migrations.pending.length === 0 ? "none" : result.migrations.pending.join(", ")}`,
    ...result.migrations.held.map((h) => `held       ${h.tag}: ${h.reason}`),
    "",
  ];
  const names = Object.keys(result.rows);
  if (names.length === 0) {
    lines.push(
      result.migrations.head === null
        ? "No tables yet. Run `npm run catalog -- migrate`."
        : "Migrations are outstanding, so the tables are not what this build expects. " +
            "Run `npm run catalog -- migrate`.",
    );
    return lines.join("\n");
  }
  const width = Math.max(...names.map((n) => n.length));
  for (const name of names) {
    lines.push(`${name.padEnd(width)}  ${String(result.rows[name]).padStart(7)}`);
  }
  lines.push("");
  lines.push(
    `content ${result.totals.content} rows, state ${result.totals.state} rows, ` +
      `operational ${result.totals.operational} rows, studio ${result.totals.studio} rows`,
  );
  lines.push(`blob caps  ${formatCaps(result.caps)}`);

  lines.push("");
  lines.push("sources");
  const sourceWidth = Math.max(...result.sources.map((s) => s.source.length));
  for (const source of result.sources) {
    if (source.lastIndexedAt === null) {
      lines.push(`  ${source.source.padEnd(sourceWidth)}  never indexed`);
      continue;
    }
    lines.push(
      `  ${source.source.padEnd(sourceWidth)}  ${source.lastIndexedAt}  ` +
        `${String(source.written).padStart(5)} rows  ${source.sourceRoot ?? ""}`,
    );
  }

  const destinations = Object.keys(result.mirrors);
  lines.push("");
  lines.push("mirrors");
  if (destinations.length === 0) {
    lines.push("  nothing audited yet. Run `npm run catalog -- import --only mirrors`.");
  } else {
    const mirrorWidth = Math.max(...destinations.map((d) => d.length));
    for (const destination of destinations) {
      const m = result.mirrors[destination]!;
      lines.push(
        `  ${destination.padEnd(mirrorWidth)}  ${String(m.present).padStart(4)} present, ` +
          `${String(m.stale).padStart(3)} stale, ${String(m.missing).padStart(3)} missing, ` +
          `${String(m.unknown).padStart(4)} unknown  ${m.checked ?? "never"}`,
      );
    }
  }

  lines.push("");
  lines.push("coverage");
  if (result.coverage.length === 0) {
    lines.push("  no courses indexed yet. Run `npm run catalog -- import --only courses`.");
    return lines.join("\n");
  }
  const courseWidth = Math.max(...result.coverage.map((c) => c.course.length));
  for (const c of result.coverage) {
    lines.push(
      `  ${c.course.padEnd(courseWidth)}  ${String(c.withConcepts).padStart(3)} of ` +
        `${String(c.items).padStart(3)} items have concepts, ` +
        `${String(c.readingsOnLessons).padStart(3)} of ${String(c.readings).padStart(3)} readings are on a lesson, ` +
        `${String(c.conceptsWithChecks).padStart(3)} of ${String(c.concepts).padStart(3)} concepts have checks`,
    );
  }
  return lines.join("\n");
}
