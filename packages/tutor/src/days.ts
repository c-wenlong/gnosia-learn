/**
 * Calendar days, for every label that says "today", "yesterday" or "3 days
 * ago": an instant turned into a `YYYY-MM-DD` key in one time zone
 * (`appTimeZone()` in `time-zone.ts`), so two labels on one page never
 * disagree about which day it is.
 *
 * Pure and React-free. It was the habit layer's arithmetic until the streak
 * and the daily target were removed (H1 of docs/proposals/home-page.md); the
 * day keys are what outlived them.
 */

/** The fields of an `EventRecord` the Home page reads. */
export interface LogEvent {
  at: string;
  type: string;
  concept?: string | null;
  session?: string | null;
  [key: string]: unknown;
}

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
