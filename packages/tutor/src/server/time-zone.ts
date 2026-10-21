/**
 * The zone a "day" is counted in. `HABIT_TIME_ZONE` (an IANA name such as
 * `Asia/Singapore`) when it is set and valid, otherwise the server's own zone.
 * The difference matters on a host that runs in UTC: without it a learner
 * eight hours east has their day end at 8 in the morning.
 *
 * The variable keeps the name it had when the streak counted days in it, so a
 * deployment that already sets it needs no change.
 */
export function appTimeZone(env: Record<string, string | undefined> = process.env): string | undefined {
  const zone = env.HABIT_TIME_ZONE?.trim();
  if (!zone) return undefined;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
    return zone;
  } catch {
    console.warn(`time zone: HABIT_TIME_ZONE="${zone}" is not a time zone; using the server's own.`);
    return undefined;
  }
}
