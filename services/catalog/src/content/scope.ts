import { LOCAL_LEARNER_ID, ownerScope, readableOwners, type OwnerScope } from "@gnosia/schema";
import { inArray, sql, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

import type { CatalogDatabase } from "../db";
import { sqlstate } from "../state/errors";

/**
 * App-level scoping by owner (phase 4 of docs/CONTENT-MIGRATION.md).
 *
 * Every content row carries `owner_id` since 0010, and ids stay global (D3,
 * D23), so what keeps one owner's notes off another's pages is a filter on
 * every read: `owner_id in readable`, where `readable` is the owner and the
 * commons (`readableOwners` in `@gnosia/schema`). Row-level security
 * comes later, once a second service reads the database.
 *
 * Two kinds of caller, and the difference is deliberate:
 *
 * - **Everything the web app reaches** takes an `OwnerScope` as a required
 *   argument: `dbSource(db, scope)` and the queries under `../state/`. Leaving
 *   it out is a type error, so a new page cannot read every owner's rows by
 *   forgetting it.
 * - **The operator's whole-database tools** (`catalog export`, parity, the
 *   `learn` CLI's own note reads) call the shared queries with `owners`
 *   omitted, which reads every owner: they run on the owner's machine against
 *   the owner's database, and an export that silently dropped rows would be a
 *   lossy backup. `owners` is optional only on those internal functions,
 *   never on anything exported through `@gnosia/catalog/state`.
 */

export type { OwnerScope } from "@gnosia/schema";

/**
 * The owner the catalog and `learn` CLIs write and read as. They run on the
 * owner's own machine with no session to read an owner from, so this is the
 * one place that says who that is; a web route passes `currentOwner()`
 * instead (`apps/web/src/lib/owner.ts`).
 */
export const CLI_OWNER = LOCAL_LEARNER_ID;

/** The scope the CLIs read with: `local` and the commons. */
export function cliScope(): OwnerScope {
  return ownerScope(CLI_OWNER);
}

/** Owners to read, or undefined for every owner (the operator's tools only). */
export type Owners = readonly string[] | undefined;

/**
 * A query-builder condition, `column in (owners)`, or undefined when every
 * owner is read, so it drops out of an `and(...)`. An empty list reads
 * nothing, rather than turning into `in ()`, which Postgres refuses.
 */
export function ownedBy(column: SQLiteColumn, owners: Owners): SQL | undefined {
  if (owners === undefined) return undefined;
  if (owners.length === 0) return sql`false`;
  return inArray(column, [...owners]);
}

/**
 * The same for a raw `sql` query: ` and <column> in (...)`, or nothing when
 * every owner is read. `column` is a fragment such as sql`c.owner_id`, since a
 * raw query names its columns by alias.
 */
export function andOwnedBy(column: SQL, owners: Owners): SQL {
  if (owners === undefined) return sql``;
  if (owners.length === 0) return sql` and false`;
  return sql` and ${column} in (${sql.join(
    owners.map((owner) => sql`${owner}`),
    sql`, `,
  )})`;
}

/** Said once per process, like the blob store's own pre-0010 notice. */
let warnedUnowned = false;

/**
 * Whether a database has `owner_id`, per pool (or per transaction handle,
 * which has no pool of its own to key on). Only a yes is kept: a column is
 * never dropped, so once a database has it every later read is filtered, and
 * a no is asked again, so a database migrated while this process runs is
 * filtered from its next read on.
 */
const hasOwners = new WeakMap<object, true>();

export function cacheKey(db: CatalogDatabase): object {
  const client = (db as { $client?: unknown }).$client;
  return typeof client === "object" && client !== null ? client : db;
}

/**
 * Does this database have `owner_id` (migration 0010)? Asked of the catalog
 * itself, `asset.owner_id` in the schema the connection reads, rather than
 * guessed from an error message: drizzle wraps a failed query in an error
 * whose message is the whole SQL, so any query that named `owner_id` and failed
 * on some other column looked like a database from before 0010.
 */
export async function ownersExist(db: CatalogDatabase): Promise<boolean> {
  const key = cacheKey(db);
  if (hasOwners.has(key)) return true;
  const { rows } = await db.execute<{ present: number }>(sql`
    select exists (
      select 1 from pragma_table_info('asset') where name = 'owner_id'
    ) as present`);
  const present = rows[0]?.present === 1;
  if (present) hasOwners.set(key, true);
  return present;
}

/**
 * A scoped read that still answers on a database from before 0010.
 *
 * `owner_id` arrived with 0010, and the owner's own database is older until
 * flip day migrates it, while the web app's asset and concept reads have
 * worked against it all along. A database with no `owner_id` column holds one
 * owner's rows by construction, so there the read is run again unscoped, which
 * is the answer it gave before scoping existed.
 *
 * Only when the catalog says so: an `undefined_column` error is followed by
 * one question to `information_schema` (`ownersExist`), and the read is run
 * unscoped only when `asset.owner_id` is not there. On a database that has it,
 * the error is the caller's bug and is thrown, never answered with every
 * owner's rows, and after the first such answer the question is not asked
 * again. A second owner can only exist after 0010, so is never read through
 * this.
 */
export async function scopedRead<T>(
  db: CatalogDatabase,
  owners: Owners,
  read: (owners: Owners) => Promise<T>,
): Promise<T> {
  try {
    return await read(owners);
  } catch (error) {
    if (owners === undefined || sqlstate(error) !== "42703") throw error;
    if (hasOwners.has(cacheKey(db))) throw error;
    let present: boolean;
    try {
      present = await ownersExist(db);
    } catch {
      throw error;
    }
    if (present) throw error;
    if (!warnedUnowned) {
      warnedUnowned = true;
      console.warn(
        "owner scoping: this database predates owner_id (0010), so it holds one owner's rows and is read unscoped; " +
          "run `npm run catalog -- migrate`",
      );
    }
    return read(undefined);
  }
}

/**
 * What a learner may read, for a query about to run inside a write: their
 * own rows and the commons', or undefined (every row) on a database from
 * before 0010, which has one owner. Asked up front rather than by retrying
 * as `scopedRead` does, because in a transaction the failed first attempt
 * would abort the transaction the retry needs.
 */
export async function readableFor(db: CatalogDatabase, learnerId: string): Promise<Owners> {
  return (await ownersExist(db)) ? readableOwners(learnerId) : undefined;
}
