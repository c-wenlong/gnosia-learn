import { getTableColumns, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

/**
 * `created_at` is when the catalog first saw a row, and re-indexing is not a
 * new sighting. `updated_at` is handled separately. `owner_id` is whose row it
 * is, and an upsert is never how a row changes owner: ids are global (D23), so
 * a conflict on another owner's row would otherwise hand it to the writer.
 * Both writers refuse that case before they upsert (the seam's
 * `foreign-owner`, the import's `assertNoForeignRows`); this is the floor
 * under both. Everything else on the row belongs to the writer.
 */
const NEVER_UPDATED = new Set(["created_at", "updated_at", "owner_id"]);

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
 * `created_at` is one exception: it is when the catalog first saw the row,
 * and re-indexing is not a new sighting. `owner_id` is the other: a row keeps
 * its owner through every upsert (see `NEVER_UPDATED`). `updated_at` is set to now() rather
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
