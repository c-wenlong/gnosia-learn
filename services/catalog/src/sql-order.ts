import { type AnyColumn, type SQL, sql } from "drizzle-orm";

/**
 * `column collate "C"`: text ordered by its bytes, which for UTF-8 is code
 * point order, the order a JavaScript `<` on the same strings gives.
 *
 * Every `ORDER BY` over an id, a slug, a path or any other text key goes
 * through this (or spells `collate "C"` in raw SQL), because without it the
 * order is the database's default collation and so differs from one server to
 * the next. Homebrew's Postgres initialises in the C locale and sorts
 * `fx:Beta` before `fx:alpha`; the postgres:17 image CI runs defaults to
 * en_US.utf8 and sorts them the other way round, and ignores a slug's hyphens
 * on a first pass. A page boundary, an export's bytes and every golden test
 * would then depend on which machine answered. The column keeps its own
 * collation, and with it its indexes; only the sort is pinned.
 */
export function bytewise(column: AnyColumn | SQL): SQL {
  return sql`${column} collate "C"`;
}
