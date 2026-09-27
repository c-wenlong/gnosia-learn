import { getTableColumns, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

/**
 * `created_at` is when the catalog first saw a row, and re-indexing is not a
 * new sighting. `updated_at` is handled separately. Everything else on the row
 * belongs to the writer.
 */
const NEVER_UPDATED = new Set(["created_at", "updated_at"]);

/**
 * The SET clause for an upsert: every column the table has, taken from the row
 * being inserted.
 *
 * Deliberately not "every column this batch happened to supply". The writer is
 * authoritative for the whole row, so a field that disappears from a file has
 * to disappear from the database, and a key-union SET cannot express that: an
 * omitted key is simply absent from the clause and the old value survives
 * forever. Reading the columns off the table instead makes `excluded.<column>`
 * the insert's own value, which for an omitted column is its default. A summary
 * deleted from a note's frontmatter therefore becomes null, rather than living
 * on as the last value anyone ever wrote, and an archived row a source produces
 * again comes back with `archived_at` null.
 *
 * `created_at` is the one exception: it is when the catalog first saw the row,
 * and re-indexing is not a new sighting. `updated_at` is set to now() rather
 * than to the insert's default for the same reason in reverse: it is a fact
 * about this write.
 */
export function updateSet(table: PgTable): Record<string, SQL> {
  const set: Record<string, SQL> = {};
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    if (NEVER_UPDATED.has(column.name)) continue;
    set[key] = sql.raw(`excluded.${quote(column.name)}`);
  }
  set["updatedAt"] = sql`now()`;
  return set;
}

function quote(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}
