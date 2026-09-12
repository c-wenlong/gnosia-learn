import { learner, LOCAL_LEARNER_ID } from "@self-learn/schema";

import type { CatalogDatabase } from "../db";

/**
 * The single learner row.
 *
 * Every state table carries `learner_id` as a foreign key, so the row has to
 * exist before anything else can be written. It is created on first use rather
 * than by a migration: a migration that seeds data makes a fresh database and a
 * restored one different, and this way `learn observe` on an empty database
 * just works instead of failing on a 23503 nobody can act on.
 *
 * `onConflictDoNothing` rather than a select-then-insert, so two concurrent
 * writers cannot race between the check and the insert.
 */
export async function ensureLearner(
  db: CatalogDatabase,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<string> {
  await db.insert(learner).values({ id: learnerId }).onConflictDoNothing();
  return learnerId;
}
