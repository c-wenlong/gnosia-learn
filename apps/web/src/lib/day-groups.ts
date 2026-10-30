import { dayKey } from "@gnosia/tutor/days";

/**
 * Rows under a heading per calendar day, newest day first: the Library's
 * groups (L2 of docs/proposals/library-by-type-and-day.md), "4 Oct (5)".
 *
 * The chat history's `historyGroups` (`studio-draft-list.ts`) is the model,
 * with one difference that is the point: it buckets by distance from today
 * (Today, Yesterday, Previous 7 days, Previous 30 days, Older), and a
 * library is browsed back months, where a bucket called Older holding most of
 * the collection says nothing. So every day is its own group, named by its
 * date.
 *
 * The day is the calendar day in `timeZone`, the zone `appTimeZone()` names
 * (the one Home counts days in), so an asset made at 01:00 in Singapore is
 * under that day and not under the day before, which is what a UTC day would
 * do to anything made before 08:00.
 *
 * Pure and React-free: a server page, a client list and a test all call it.
 */

/** A run of rows under one day. */
export interface DayGroup<T> {
  /** `YYYY-MM-DD` in the zone, or `""` for rows whose instant does not parse. */
  key: string;
  /** "4 Oct", with the year when it is not this year: "28 Dec 2025". "No date" for the unparseable. */
  label: string;
  rows: T[];
}

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Whole days from `from` to `to` (both `YYYY-MM-DD`); negative when `to` is earlier. Exact across a clock change. */
export function dayDiff(from: string, to: string): number {
  const utc = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

function parsed(instant: string): Date | null {
  const time = Date.parse(instant);
  return Number.isNaN(time) ? null : new Date(time);
}

/**
 * A day key as a heading: "4 Oct", or "4 Oct 2025" when its year is not the
 * year of `today` (another day key). The key is a calendar date already, so
 * it is formatted at UTC noon, where no zone can move it to another day.
 * Home's thread days and its "on 20 Aug" use it too, so the two never spell
 * a date differently.
 */
export function dayLabel(key: string, today: string): string {
  const date = new Date(`${key}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "No date";
  return key.slice(0, 4) === today.slice(0, 4) ? DAY_MONTH.format(date) : DAY_MONTH_YEAR.format(date);
}

/**
 * `rows` grouped by the calendar day `at` names, groups newest first, a
 * row's place within its group kept from the input. So the caller sorts the
 * rows how it likes (by time, or by title, which the Library's sort menu
 * offers) and the groups stay in date order either way. Rows whose instant
 * does not parse go last, under "No date", rather than vanishing.
 */
export function dayGroups<T>(
  rows: readonly T[],
  at: (row: T) => string,
  options: { now: Date; timeZone?: string },
): DayGroup<T>[] {
  const today = dayKey(options.now, options.timeZone);
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const date = parsed(at(row));
    const key = date === null ? "" : dayKey(date, options.timeZone);
    const list = groups.get(key);
    if (list === undefined) groups.set(key, [row]);
    else list.push(row);
  }
  // `YYYY-MM-DD` sorts as a date; the empty key sorts first, so it is moved last.
  const keys = [...groups.keys()].filter((k) => k !== "").sort().reverse();
  if (groups.has("")) keys.push("");
  return keys.map((key) => ({ key, label: key === "" ? "No date" : dayLabel(key, today), rows: groups.get(key) ?? [] }));
}

const clocks = new Map<string, Intl.DateTimeFormat>();

function clock(timeZone: string | undefined): Intl.DateTimeFormat {
  const key = timeZone ?? "";
  let f = clocks.get(key);
  if (f === undefined) {
    f = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });
    clocks.set(key, f);
  }
  return f;
}

/** The time of day an instant falls at in `timeZone`, on a 24-hour clock: "18:12". Null when it does not parse. */
export function timeOfDay(instant: string, timeZone?: string): string | null {
  const date = parsed(instant);
  return date === null ? null : clock(timeZone).format(date);
}

/** How far apart the two instants must be before a row says it was edited. */
export const EDITED_AFTER_MS = 86_400_000;

/**
 * "edited 2 Oct" when `editedAt` is more than a day after `createdAt`, else
 * null: a note revised a month after it was written says so, and a row the
 * same writer touched again a minute later does not. The day is counted in
 * `timeZone`, with the year when it is not this year.
 *
 * `editedAt` is when a person last changed the asset, and null when the last
 * change was an import or an indexer refresh (`editedAt` on the catalog's
 * `AssetWithTopics`, the owner's call of 2026-10-05). Never
 * `asset.updated_at`: every import moves that, so it said "edited" on nearly
 * every row.
 */
export function editedLabel(
  createdAt: string,
  editedAt: string | null,
  options: { now: Date; timeZone?: string },
): string | null {
  if (editedAt === null) return null;
  const made = parsed(createdAt);
  const changed = parsed(editedAt);
  if (made === null || changed === null) return null;
  if (changed.getTime() - made.getTime() <= EDITED_AFTER_MS) return null;
  return `edited ${dayLabel(dayKey(changed, options.timeZone), dayKey(options.now, options.timeZone))}`;
}
