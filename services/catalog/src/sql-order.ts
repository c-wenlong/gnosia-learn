import { type AnyColumn, type SQL, sql } from "drizzle-orm";

/**
 * `column collate binary`: text ordered by its bytes, which for UTF-8 is code
 * point order, the order a JavaScript `<` on the same strings gives.
 *
 * Every `ORDER BY` over an id, a slug, a path or any other text key goes
 * through this (or spells `collate binary` in raw SQL), because without it the
 * order is the database's default collation and so differs from one server to
 * the next. Homebrew's Postgres initialises in the C locale and sorts
 * `fx:Beta` before `fx:alpha`; the postgres:17 image CI runs defaults to
 * en_US.utf8 and sorts them the other way round, and ignores a slug's hyphens
 * on a first pass. A page boundary, an export's bytes and every golden test
 * would then depend on which machine answered.
 *
 * Only the sort is pinned; the column keeps its own collation, so equality
 * and the foreign keys are untouched. The cost: on a database whose default
 * collation is not C, an index over the column cannot hand rows back in this
 * order, and Postgres sorts them instead. On a C database (Homebrew's) the
 * index still serves. The catalog's tables hold hundreds to low thousands of
 * rows, where that sort is noise; a table that grows past that and pages
 * through it wants an index declared `collate binary` rather than dropping this.
 */
export function bytewise(column: AnyColumn | SQL): SQL {
  return sql`${column} collate binary`;
}
