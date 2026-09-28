import { LOCAL_LEARNER_ID, ownerScope, type OwnerScope } from "@self-learn/schema";
import { inArray, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import { sqlstate } from "../state/errors";

/**
 * App-level scoping by owner (phase 4 of docs/CONTENT-MIGRATION.md).
 *
 * Every content row carries `owner_id` since 0010, and ids stay global (D3,
 * D23), so what keeps one owner's notes off another's pages is a filter on
 * every read: `owner_id in readable`, where `readable` is the owner and the
 * commons (`readableOwners` in `@self-learn/schema`). Row-level security
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
 *   never on anything exported through `@self-learn/catalog/state`.
 */

export type { OwnerScope } from "@self-learn/schema";

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
export function ownedBy(column: PgColumn, owners: Owners): SQL | undefined {
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

/** Postgres's `undefined_column`, raised about `owner_id` itself. */
function beforeOwners(error: unknown): boolean {
  if (sqlstate(error) !== "42703") return false;
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    if (current.message.includes("owner_id")) return true;
    current = current.cause;
  }
  return false;
}

/**
 * A scoped read that still answers on a database from before 0010.
 *
 * `owner_id` arrived with 0010, and the owner's own database is older until
 * flip day migrates it, while the web app's asset and concept reads have
 * worked against it all along. A database with no `owner_id` column holds one
 * owner's rows by construction, so there the read is run again unscoped, which
 * is the answer it gave before scoping existed. Only that error is taken this
 * way: `undefined_column`, naming `owner_id`. Any database that has the column
 * is filtered, so a second owner, who can only exist after 0010, is never read
 * through this.
 */
export async function scopedRead<T>(owners: Owners, read: (owners: Owners) => Promise<T>): Promise<T> {
  try {
    return await read(owners);
  } catch (error) {
    if (owners === undefined || !beforeOwners(error)) throw error;
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
