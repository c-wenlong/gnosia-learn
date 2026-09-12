import {
  CONTENT_TABLES,
  STATE_TABLES,
  type TableName,
  tables,
} from "@self-learn/schema";
import { getTableName, sql } from "drizzle-orm";

import { withDatabase } from "../db";
import { databaseUrl, redactUrl } from "../env";
import { migrationStatus } from "../migrations";

export interface StatusResult {
  database: string;
  migrations: {
    head: string | null;
    latest: string | null;
    pending: string[];
  };
  /** Row count keyed by SQL table name, in dependency order. */
  rows: Record<string, number>;
  totals: { content: number; state: number };
}

function half(name: TableName): "content" | "state" {
  if ((CONTENT_TABLES as readonly TableName[]).includes(name)) return "content";
  if ((STATE_TABLES as readonly TableName[]).includes(name)) return "state";
  // Only reachable if a table is added to `tables` and to neither list. Loud
  // beats a count that quietly lands in the wrong half.
  throw new Error(`table ${name} is in neither CONTENT_TABLES nor STATE_TABLES`);
}

export async function runStatus(): Promise<StatusResult> {
  const url = databaseUrl();
  return withDatabase(async ({ db }) => {
    const migrations = await migrationStatus(db);
    const rows: Record<string, number> = {};
    const totals = { content: 0, state: 0 };

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

    return {
      database: redactUrl(url),
      migrations: {
        head: migrations.head,
        latest: migrations.latest,
        pending: migrations.pending,
      },
      rows,
      totals,
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
  lines.push(`content ${result.totals.content} rows, state ${result.totals.state} rows`);
  return lines.join("\n");
}
