import { LOCAL_LEARNER_ID, preference } from "@self-learn/schema";
import { and, eq, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
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
 * Set one preference. `null` is a value, not a clear — `clearPreference` is the
 * way to remove one, so "the learner chose null" and "the learner never chose"
 * stay distinguishable.
 */
export async function writePreference(
  db: CatalogDatabase,
  key: string,
  value: unknown,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<void> {
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
