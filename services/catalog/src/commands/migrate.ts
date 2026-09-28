import { withDatabase } from "../db";
import { databaseUrl, redactUrl } from "../env";
import { type HeldMigration, migrateHolding, migrationStatus } from "../migrations";

export interface MigrateResult {
  database: string;
  head: string | null;
  applied: string[];
  alreadyApplied: string[];
  /**
   * Contract migrations the data is not ready for, with everything after
   * them, and why (`migrateHolding` in ../migrations.ts). Empty once the
   * database is at the head.
   */
  held: HeldMigration[];
}

export async function runMigrate(): Promise<MigrateResult> {
  const url = databaseUrl();
  return withDatabase(async ({ db }) => {
    const before = await migrationStatus(db);
    const held = await migrateHolding(db);
    const after = await migrationStatus(db);
    return {
      database: redactUrl(url),
      head: after.head,
      applied: after.applied.filter((tag) => !before.applied.includes(tag)),
      alreadyApplied: before.applied,
      held,
    };
    // A copy refuses every write (the copy guard in 0010), and a migration's
    // data statements are writes. Migrating a copy is still right: its schema
    // has to follow the primary's for tests and e2e to mean anything.
  }, { copyOk: true });
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
  for (const held of result.held) lines.push(`held      ${held.tag}: ${held.reason}`);
  return lines.join("\n");
}
