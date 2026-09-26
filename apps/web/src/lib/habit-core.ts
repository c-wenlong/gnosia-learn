/**
 * The habit layer's arithmetic: the streak and the daily target, from the
 * event log, the preferences and the size of the due queue.
 *
 * Pure and React-free, so the shell, the Today page and a test can all call
 * it. `habit.ts` is the server half that reads the catalog and hands the rows
 * here. The rules come from docs/design/DESIGN.md decisions 5 and 6: a
 * forgiving streak with a weekly leeway the learner sets, and a target the
 * learner sets, with nothing raising either behind their back.
 *
 * Days are calendar days in one time zone, written as `YYYY-MM-DD` keys. All
 * the walking back and forth is done on the keys with UTC arithmetic, so a
 * daylight-saving change cannot make a day 23 hours long and skip it.
 */

import { PREFERENCE_KEYS } from "@self-learn/schema/shared";

/** The fields of an `EventRecord` this module reads. */
export interface HabitEvent {
  at: string;
  type: string;
  concept?: string | null;
  session?: string | null;
  [key: string]: unknown;
}

export interface DailyTarget {
  /** Concepts to teach or probe today. */
  concepts: number;
  /** Whether clearing the due-review queue is part of the target. */
  reviews: boolean;
}

export const DEFAULT_DAILY_TARGET: DailyTarget = { concepts: 1, reviews: true };
export const DEFAULT_DAILY_LEEWAY = 1;

/** Bounds a stored preference is clamped to, so a bad row cannot draw a 400-segment bar. */
export const TARGET_MAX_CONCEPTS = 20;
export const LEEWAY_MAX = 7;

/**
 * One day of the current Monday-to-Sunday week, for the seven discs on Today.
 * `forgiven` is a miss the leeway covered; `missed` is one it did not (or one
 * outside any streak); `today` is today with nothing done yet, which is not a
 * miss until the day is over.
 */
export type StreakDayState = "done" | "forgiven" | "missed" | "today" | "future";

export interface StreakDay {
  /** `YYYY-MM-DD`. */
  date: string;
  state: StreakDayState;
}

export interface Streak {
  /** Days with at least one event in the current run. Forgiven days do not add to it. */
  days: number;
  /** Free misses per week, from the `dailyLeeway` preference. */
  leeway: number;
  /** Free misses left in the current week. */
  leewayLeft: number;
  /** Whether anything has been recorded today. */
  activeToday: boolean;
  /** Monday to Sunday of the current week. */
  week: StreakDay[];
}

export interface TargetProgress {
  target: DailyTarget;
  /** Distinct concepts with a teach or probe observation today. */
  conceptsDone: number;
  /** Cards due now. */
  dueReviews: number;
  reviewsCleared: boolean;
  /** Units met, counting the review queue as one unit when the target includes it. */
  done: number;
  total: number;
}

export interface Habit {
  streak: Streak;
  target: TargetProgress;
  /** False when the catalog could not be read; every number is then zero. */
  reachable: boolean;
}

/* -------------------------------------------------------------------------- */
/* Day keys                                                                   */
/* -------------------------------------------------------------------------- */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string | undefined): Intl.DateTimeFormat {
  const key = timeZone ?? "";
  let f = formatters.get(key);
  if (f === undefined) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(key, f);
  }
  return f;
}

/** The calendar day an instant falls on, in `timeZone` (the process's zone when omitted). */
export function dayKey(instant: Date | string, timeZone?: string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  const parts = formatter(timeZone).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function keyToUtc(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcToKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

/** The key `n` days after `key` (before, for a negative `n`). */
export function addDays(key: string, n: number): string {
  return utcToKey(keyToUtc(key) + n * DAY_MS);
}

/** The Monday of the ISO week holding `key`. */
export function weekStart(key: string): string {
  const weekday = new Date(keyToUtc(key)).getUTCDay(); // 0 is Sunday
  return addDays(key, -((weekday + 6) % 7));
}

/* -------------------------------------------------------------------------- */
/* Preferences                                                                */
/* -------------------------------------------------------------------------- */

function wholeNumber(value: unknown, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(max, Math.max(0, Math.round(value)));
}

/** The `dailyTarget` preference, or the default for any field that is missing or malformed. */
export function parseDailyTarget(value: unknown): DailyTarget {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_DAILY_TARGET };
  }
  const raw = value as Record<string, unknown>;
  return {
    concepts: wholeNumber(raw.concepts, TARGET_MAX_CONCEPTS) ?? DEFAULT_DAILY_TARGET.concepts,
    reviews: typeof raw.reviews === "boolean" ? raw.reviews : DEFAULT_DAILY_TARGET.reviews,
  };
}

/** The `dailyLeeway` preference: free misses per week, 0 to 7. */
export function parseLeeway(value: unknown): number {
  return wholeNumber(value, LEEWAY_MAX) ?? DEFAULT_DAILY_LEEWAY;
}

/* -------------------------------------------------------------------------- */
/* The streak                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Events that count as the learner having done something. A `void` event is a
 * retraction, not study, and an event inside a voided session was retracted by
 * one; neither keeps a streak alive.
 */
function countedEvents(events: readonly HabitEvent[]): HabitEvent[] {
  const voided = new Set(
    events
      .filter((e) => e.type === "void" && typeof e.session === "string" && e.session !== "")
      .map((e) => e.session as string),
  );
  return events.filter(
    (e) => e.type !== "void" && !(typeof e.session === "string" && voided.has(e.session)),
  );
}

/** The set of day keys with at least one counted event. */
export function activeDays(events: readonly HabitEvent[], timeZone?: string): Set<string> {
  const days = new Set<string>();
  for (const e of countedEvents(events)) {
    const at = new Date(e.at);
    if (!Number.isNaN(at.getTime())) days.add(dayKey(at, timeZone));
  }
  return days;
}

/**
 * The current streak.
 *
 * Walk back from today one day at a time. A day with an event adds one. A day
 * without one is forgiven if its week (Monday to Sunday) still has leeway
 * left, and ends the walk if it does not. Today with nothing done yet is not a
 * miss: the day is not over, so the streak carries through yesterday.
 *
 * Forgiven days do not add to the count: the leeway keeps a streak alive, it
 * does not grow it. A miss forgiven *before* the run's first active day was
 * never protecting anything, so it is dropped again after the walk; otherwise
 * a learner with no history at all would appear to have spent their leeway.
 */
export function computeStreak(
  days: ReadonlySet<string>,
  today: string,
  leeway: number,
): Streak {
  const activeToday = days.has(today);
  const forgiven: string[] = [];
  let count = 0;
  let runStart: string | null = null;

  if (days.size > 0) {
    const earliest = [...days].sort()[0];
    const used = new Map<string, number>();
    if (activeToday) {
      count += 1;
      runStart = today;
    }
    for (let cursor = addDays(today, -1); cursor >= earliest; cursor = addDays(cursor, -1)) {
      if (days.has(cursor)) {
        count += 1;
        runStart = cursor;
        continue;
      }
      const week = weekStart(cursor);
      const spent = used.get(week) ?? 0;
      if (spent >= leeway) break;
      used.set(week, spent + 1);
      forgiven.push(cursor);
    }
  }

  const kept = new Set(runStart === null ? [] : forgiven.filter((d) => d > runStart));
  const monday = weekStart(today);
  const spentThisWeek = [...kept].filter((d) => d >= monday).length;

  const week: StreakDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    let state: StreakDayState;
    if (date > today) state = "future";
    else if (days.has(date)) state = "done";
    else if (date === today) state = "today";
    else if (kept.has(date)) state = "forgiven";
    else state = "missed";
    return { date, state };
  });

  return {
    days: count,
    leeway,
    leewayLeft: Math.max(0, leeway - spentThisWeek),
    activeToday,
    week,
  };
}

/* -------------------------------------------------------------------------- */
/* The target                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Concepts taught or probed on `today`. An observation's `source` is `probe`
 * when the CLI was not told otherwise, so a missing source counts as a probe;
 * `review` does not count, since reviews are the other half of the target.
 */
export function conceptsStudied(
  events: readonly HabitEvent[],
  today: string,
  timeZone?: string,
): number {
  const concepts = new Set<string>();
  for (const e of countedEvents(events)) {
    if (e.type !== "observation" || typeof e.concept !== "string") continue;
    const source = e.source ?? "probe";
    if (source !== "probe" && source !== "teach") continue;
    const at = new Date(e.at);
    if (Number.isNaN(at.getTime()) || dayKey(at, timeZone) !== today) continue;
    concepts.add(e.concept);
  }
  return concepts.size;
}

export function computeTarget(
  target: DailyTarget,
  conceptsDone: number,
  dueReviews: number,
): TargetProgress {
  const reviewsCleared = dueReviews === 0;
  const total = target.concepts + (target.reviews ? 1 : 0);
  const done =
    Math.min(conceptsDone, target.concepts) + (target.reviews && reviewsCleared ? 1 : 0);
  return { target, conceptsDone, dueReviews, reviewsCleared, done, total };
}

/* -------------------------------------------------------------------------- */
/* Together                                                                   */
/* -------------------------------------------------------------------------- */

export interface HabitInput {
  events: readonly HabitEvent[];
  /** `readPreferences` output: every preference, keyed. */
  preferences: Record<string, unknown>;
  dueReviews: number;
  now: Date;
  timeZone?: string;
}

export function computeHabit(input: HabitInput): Habit {
  const today = dayKey(input.now, input.timeZone);
  const leeway = parseLeeway(input.preferences[PREFERENCE_KEYS.dailyLeeway]);
  const target = parseDailyTarget(input.preferences[PREFERENCE_KEYS.dailyTarget]);
  return {
    streak: computeStreak(activeDays(input.events, input.timeZone), today, leeway),
    target: computeTarget(
      target,
      conceptsStudied(input.events, today, input.timeZone),
      input.dueReviews,
    ),
    reachable: true,
  };
}

/** What the shell shows when the catalog could not be asked: zeros, and the default target. */
export function emptyHabit(now: Date = new Date(), timeZone?: string): Habit {
  const habit = computeHabit({ events: [], preferences: {}, dueReviews: 0, now, timeZone });
  // An empty queue would count as "reviews cleared", which is a claim the app
  // cannot make without having asked. Nothing is done when nothing is known.
  return {
    ...habit,
    target: { ...habit.target, reviewsCleared: false, done: 0 },
    reachable: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Words                                                                      */
/* -------------------------------------------------------------------------- */

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * What the top bar's two pills say, and the fuller sentence behind each as a
 * tooltip. Facts only (DESIGN.md decision 5): no "don't lose your streak".
 */
export function habitLabels(habit: Habit): {
  streak: string;
  streakShort: string;
  streakTitle: string;
  target: string;
  targetTitle: string;
} {
  const { streak, target } = habit;
  if (!habit.reachable) {
    const why = "Not connected to the database, so the streak and target cannot be read.";
    return {
      streak: `${streak.days} day streak`,
      streakShort: String(streak.days),
      streakTitle: why,
      target: `Target ${target.done} / ${target.total}`,
      targetTitle: why,
    };
  }
  const leeway =
    streak.leeway === 0
      ? "No free misses set."
      : `${plural(streak.leewayLeft, "free miss", "free misses")} left this week.`;
  const today = streak.activeToday ? "Studied today." : "Nothing recorded yet today.";
  const goal = [
    target.target.concepts > 0 ? plural(target.target.concepts, "concept", "concepts") : null,
    target.target.reviews ? "due reviews" : null,
  ]
    .filter(Boolean)
    .join(" + ");
  const progress = [
    `${plural(target.conceptsDone, "concept", "concepts")} studied today`,
    target.target.reviews
      ? target.reviewsCleared
        ? "reviews cleared"
        : `${plural(target.dueReviews, "review", "reviews")} due`
      : null,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    streak: `${streak.days} day streak`,
    streakShort: String(streak.days),
    streakTitle: `${plural(streak.days, "day", "days")} in a row. ${today} ${leeway}`,
    target: `Target ${target.done} / ${target.total}`,
    targetTitle: `Today's target: ${goal || "nothing set"}. ${progress}.`,
  };
}
