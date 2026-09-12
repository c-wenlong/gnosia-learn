import { withDatabase } from "../db";
import { databaseUrl, redactUrl } from "../env";
import { applyMigrations, migrationStatus } from "../migrations";

export interface MigrateResult {
  database: string;
  head: string | null;
  applied: string[];
  alreadyApplied: string[];
}

export async function runMigrate(): Promise<MigrateResult> {
  const url = databaseUrl();
  return withDatabase(async ({ db }) => {
    const before = await migrationStatus(db);
    await applyMigrations(db);
    const after = await migrationStatus(db);
    return {
      database: redactUrl(url),
      head: after.head,
      applied: after.applied.filter((tag) => !before.applied.includes(tag)),
      alreadyApplied: before.applied,
    };
  });
}

export function formatMigrate(result: MigrateResult): string {
  const lines = [`database  ${result.database}`];
  if (result.applied.length === 0) {
    lines.push(`applied   nothing, already at ${result.head ?? "(no migrations)"}`);
  } else {
    lines.push(`applied   ${result.applied.length}`);
    for (const tag of result.applied) lines.push(`          + ${tag}`);
    lines.push(`head      ${result.head}`);
  }
  return lines.join("\n");
}
