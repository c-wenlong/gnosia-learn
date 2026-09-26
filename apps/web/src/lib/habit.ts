import "server-only";

import { connection } from "next/server";
import { dueReviews, readEvents, readPreferences } from "@self-learn/catalog/state";

import { computeHabit, emptyHabit, type Habit } from "@/lib/habit-core";
import { catalogDatabase } from "@/lib/learner-store";

/**
 * The streak and the daily target the top bar shows on every page, read from
 * the catalog.
 *
 * The arithmetic is `habit-core.ts`; this file only fetches the three inputs
 * (the event log, the preferences, the due queue) and degrades the way
 * `loadLearnerSnapshot` does: an unreachable database is zeros with
 * `reachable: false`, never a thrown render. It borrows `learner-store`'s pool
 * rather than opening a second one.
 */

/**
 * The zone a "day" is counted in. `HABIT_TIME_ZONE` (an IANA name such as
 * `Asia/Singapore`) when it is set and valid, otherwise the server's own zone.
 * The difference matters on a host that runs in UTC: without it a learner
 * eight hours east has their day end at 8 in the morning.
 */
export function habitTimeZone(env: Record<string, string | undefined> = process.env): string | undefined {
  const zone = env.HABIT_TIME_ZONE?.trim();
  if (!zone) return undefined;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
    return zone;
  } catch {
    console.warn(`habit: HABIT_TIME_ZONE="${zone}" is not a time zone; using the server's own.`);
    return undefined;
  }
}

/** The read without the request marker, for a route handler or a test. */
export async function readHabit(now: Date = new Date()): Promise<Habit> {
  const timeZone = habitTimeZone();
  try {
    const db = await catalogDatabase();
    const [events, preferences, due] = await Promise.all([
      readEvents(db),
      readPreferences(db),
      dueReviews(db, { now }),
    ]);
    return computeHabit({ events, preferences, dueReviews: due.length, now, timeZone });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`habit: streak and target unavailable, ${message}`);
    return emptyHabit(now, timeZone);
  }
}

/** The habit numbers for this request, or zeros when the database is down. */
export async function loadHabit(): Promise<Habit> {
  await connection();
  return readHabit();
}
