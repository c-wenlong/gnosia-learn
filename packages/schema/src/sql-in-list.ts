import { sql } from "drizzle-orm";

/**
 * The check constraints' list helpers, once for every schema file. The
 * values are this package's own constants (kinds, states, provider ids),
 * never input, which is why they are quoted by hand into `sql.raw`. The
 * text they emit is what the migrations under
 * `services/catalog/drizzle-sqlite/` were generated from, so it must not
 * change.
 *
 * No import from `./index`: the schema files import this, and the barrel
 * imports them.
 */

/** `'a', 'b', 'c'`. */
export const quoted = (values: readonly string[]): string => values.map((v) => `'${v}'`).join(", ");

/** `column in ('a', 'b', 'c')`. */
export const inList = (column: string, values: readonly string[]) => sql.raw(`${column} in (${quoted(values)})`);
