import { learner, LOCAL_LEARNER_ID } from "@self-learn/schema";
import { cleanDisplayName, DISPLAY_NAME_MAX, isAvatar, type AvatarId } from "@self-learn/schema/shared";
import { eq, sql } from "drizzle-orm";

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

/** The learner's name, cleaned (`cleanDisplayName`), or null when none is set. */
export async function readDisplayName(
  db: CatalogDatabase,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<string | null> {
  const rows = await db.select({ name: learner.displayName }).from(learner).where(eq(learner.id, learnerId));
  return cleanDisplayName(rows[0]?.name);
}

/**
 * Set the learner's name, or clear it with null or an empty string. Stores
 * the cleaned value, and refuses one past `DISPLAY_NAME_MAX` characters (a
 * `RangeError`) rather than cutting it, whoever the caller is.
 */
export async function writeDisplayName(
  db: CatalogDatabase,
  name: string | null,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<string | null> {
  const cleaned = cleanDisplayName(name);
  if (cleaned !== null && cleaned.length > DISPLAY_NAME_MAX) {
    throw new RangeError(`A name is at most ${DISPLAY_NAME_MAX} characters; this one has ${cleaned.length}.`);
  }
  await ensureLearner(db, learnerId);
  await db.update(learner).set({ displayName: cleaned, updatedAt: new Date() }).where(eq(learner.id, learnerId));
  return cleaned;
}

/**
 * The learner's pixel sprite (`learner.avatar`), or null when there is no
 * row yet. The database draws one when the row is made, so a learner who
 * exists always has one.
 */
export async function readAvatar(db: CatalogDatabase, learnerId: string = LOCAL_LEARNER_ID): Promise<AvatarId | null> {
  const rows = await db.select({ avatar: learner.avatar }).from(learner).where(eq(learner.id, learnerId));
  const avatar = rows[0]?.avatar;
  return isAvatar(avatar) ? avatar : null;
}

/**
 * Set the learner's pixel sprite. Refuses a name outside `AVATARS` (a
 * `RangeError`) before the check constraint would, whoever the caller is.
 */
export async function writeAvatar(
  db: CatalogDatabase,
  avatar: string,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<AvatarId> {
  if (!isAvatar(avatar)) throw new RangeError(`"${avatar}" is not an avatar.`);
  await ensureLearner(db, learnerId);
  await db.update(learner).set({ avatar, updatedAt: new Date() }).where(eq(learner.id, learnerId));
  return avatar;
}

/**
 * Run `fn` in a transaction holding a row lock on the learner.
 *
 * Recording evidence is a read-modify-write: `observe` reads the current
 * mastery, applies the Bayesian update, and writes the result back. Two
 * processes doing that at once under READ COMMITTED both read the same prior
 * and the second write wins, so one of the two observations disappears from
 * the projection — while both events remain in the log, which is what makes it
 * recoverable but also what makes it silent until someone rebuilds.
 *
 * `FOR UPDATE` on the single learner row serialises them. It is the coarsest
 * possible lock and that is the right grain here: there is one learner, the
 * critical section is three statements long, and a per-concept lock would only
 * add a way to deadlock two commands that touch two concepts in two orders.
 *
 * Everything inside runs on `tx`. Passing `db` in by mistake would issue the
 * statement on a different connection, outside both the lock and the
 * transaction, which is the one way to get this wrong quietly.
 */
export async function withLearnerLock<T>(
  db: CatalogDatabase,
  learnerId: string,
  fn: (tx: CatalogDatabase) => Promise<T>,
): Promise<T> {
  await ensureLearner(db, learnerId);
  return db.transaction(async (tx) => {
    await tx.select({ id: learner.id }).from(learner).where(eq(learner.id, learnerId)).for("update");
    return fn(tx as CatalogDatabase);
  });
}

/**
 * Increment the epoch by one and return the new value, in a single statement.
 *
 * Read-modify-write in application code would let two concurrent resets read
 * the same number and write the same increment, and the epoch's whole job is
 * to change so that client components holding stale draft state remount. The
 * `#>> '{}'` extracts the jsonb scalar as text before the numeric cast, which
 * is the only way to read a bare jsonb number without going through the
 * string form of the JSON itself.
 */
export async function bumpEpoch(
  db: CatalogDatabase,
  key: string,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<number> {
  await ensureLearner(db, learnerId);
  const { rows } = await db.execute<{ value: number }>(sql`
    insert into preference (learner_id, key, value)
    values (${learnerId}, ${key}, to_jsonb(1))
    on conflict (learner_id, key) do update
      set value = to_jsonb(coalesce((preference.value #>> '{}')::numeric, 0) + 1),
          updated_at = now()
    returning (value #>> '{}')::int as value
  `);
  return rows[0]?.value ?? 1;
}
