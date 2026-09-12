import {
  CONTENT_TABLES,
  indexRun,
  INDEX_SOURCES,
  OPERATIONAL_TABLES,
  STATE_TABLES,
  type TableName,
  tables,
} from "@self-learn/schema";
import { asc, getTableName, sql } from "drizzle-orm";

import { withDatabase } from "../db";
import { databaseUrl, redactUrl } from "../env";
import { migrationStatus } from "../migrations";

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

export interface StatusResult {
  database: string;
  migrations: {
    head: string | null;
    latest: string | null;
    pending: string[];
  };
  /** Row count keyed by SQL table name, in dependency order. */
  rows: Record<string, number>;
  totals: { content: number; state: number; operational: number };
  /**
   * When each source was last indexed. The question this answers is "is the
   * content half stale", which no row count can: a table full of rows from a
   * checkout three weeks old looks exactly like a fresh one.
   */
  sources: SourceStatus[];
}

function half(name: TableName): "content" | "state" | "operational" {
  if ((CONTENT_TABLES as readonly TableName[]).includes(name)) return "content";
  if ((STATE_TABLES as readonly TableName[]).includes(name)) return "state";
  if ((OPERATIONAL_TABLES as readonly TableName[]).includes(name)) return "operational";
  // Only reachable if a table is added to `tables` and to none of the lists.
  // Loud beats a count that quietly lands in the wrong half.
  throw new Error(`table ${name} is in none of CONTENT_TABLES, STATE_TABLES, OPERATIONAL_TABLES`);
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
    const totals = { content: 0, state: 0, operational: 0 };

    if (migrations.head === null) {
      // Nothing is applied, so no table exists yet. Counting would just be a
      // pile of "relation does not exist" errors; report zero tables instead.
      return {
        database: redactUrl(url),
        migrations: {
          head: migrations.head,
          latest: migrations.latest,
          pending: migrations.pending,
        },
        rows,
        totals,
        sources: sourceStatuses([]),
      };
    }

    // One statement, one round trip: a UNION ALL of counts. Sequential counts
    // would be 19 round trips for a command whose whole point is to be cheap.
    const parts = (Object.keys(tables) as TableName[]).map((key) => {
      const table = tables[key];
      return sql`select ${getTableName(table)}::text as name, count(*)::int as rows from ${table}`;
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

    const runs = await db.select().from(indexRun).orderBy(asc(indexRun.source));

    return {
      database: redactUrl(url),
      migrations: {
        head: migrations.head,
        latest: migrations.latest,
        pending: migrations.pending,
      },
      rows,
      totals,
      sources: sourceStatuses(runs),
    };
  });
}

export function formatStatus(result: StatusResult): string {
  const lines = [
    `database   ${result.database}`,
    `head       ${result.migrations.head ?? "(none applied)"}`,
    `latest     ${result.migrations.latest ?? "(none on disk)"}`,
    `pending    ${result.migrations.pending.length === 0 ? "none" : result.migrations.pending.join(", ")}`,
    "",
  ];
  const names = Object.keys(result.rows);
  if (names.length === 0) {
    lines.push("No tables yet. Run `npm run catalog -- migrate`.");
    return lines.join("\n");
  }
  const width = Math.max(...names.map((n) => n.length));
  for (const name of names) {
    lines.push(`${name.padEnd(width)}  ${String(result.rows[name]).padStart(7)}`);
  }
  lines.push("");
  lines.push(
    `content ${result.totals.content} rows, state ${result.totals.state} rows, ` +
      `operational ${result.totals.operational} rows`,
  );

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
  return lines.join("\n");
}
