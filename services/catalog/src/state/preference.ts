import { LOCAL_LEARNER_ID, preference } from "@self-learn/schema";
import { and, eq, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { StateError } from "./errors";
import { ensureLearner } from "./learner";

/**
 * The key/value corner of the learner state: theme, epoch, last visited, the
 * learner's own resource links, and the BKT parameters.
 *
 * These are the fields nothing joins on. Giving each one a column would mean a
 * migration every time the UI grew a toggle, and a `jsonb` value keeps the
 * shape where it is used — the caller that wrote it is the caller that reads
 * it, so a `Record<string, UserResource[]>` does not need eleven columns and a
 * link table to be stored honestly.
 */

/** One preference, or `undefined` when it has never been set. */
export async function readPreference(
  db: CatalogDatabase,
  key: string,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<unknown> {
  const rows = await db
    .select({ value: preference.value })
    .from(preference)
    .where(and(eq(preference.learnerId, learnerId), eq(preference.key, key)))
    .limit(1);
  return rows[0]?.value;
}

/** Every preference for this learner, keyed. */
export async function readPreferences(
  db: CatalogDatabase,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<Record<string, unknown>> {
  const rows = await db
    .select({ key: preference.key, value: preference.value })
    .from(preference)
    .where(eq(preference.learnerId, learnerId));
  const out: Record<string, unknown> = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

/**
 * The preferences whose key starts with `prefix`, keyed, for a family of
 * per-row keys such as `favorite:<asset id>`: read without loading the rest
 * (the playback positions, the learner's resource links). `starts_with`
 * rather than `LIKE`, so a `%` or `_` in the prefix is matched as itself.
 */
export async function readPreferencesWithPrefix(
  db: CatalogDatabase,
  prefix: string,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<Record<string, unknown>> {
  const rows = await db
    .select({ key: preference.key, value: preference.value })
    .from(preference)
    .where(and(eq(preference.learnerId, learnerId), sql`starts_with(${preference.key}, ${prefix})`));
  const out: Record<string, unknown> = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

/**
 * Set one preference.
 *
 * `value` cannot be `null` or `undefined`. The column is `jsonb not null`, and
 * the driver would send a JavaScript `null` as SQL NULL rather than as the JSON
 * value `null`, so it is refused here with a sentence instead of arriving as a
 * 23502. Removing a preference is `clearPreference`, which keeps "the learner
 * never chose" and "the learner chose nothing" from collapsing into one row.
 */
export async function writePreference(
  db: CatalogDatabase,
  key: string,
  value: unknown,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<void> {
  if (value === null || value === undefined) {
    throw new StateError(
      `preference "${key}" cannot be set to ${String(value)}. Use clearPreference to remove it.`,
    );
  }
  await ensureLearner(db, learnerId);
  await db
    .insert(preference)
    .values({ learnerId, key, value })
    .onConflictDoUpdate({
      target: [preference.learnerId, preference.key],
      set: { value: sql`excluded.value`, updatedAt: sql`now()` },
    });
}

export async function clearPreference(
  db: CatalogDatabase,
  key: string,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<void> {
  await db
    .delete(preference)
    .where(and(eq(preference.learnerId, learnerId), eq(preference.key, key)));
}
