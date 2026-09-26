import { describe, expect, it } from "vitest";

import {
  activeDays,
  addDays,
  computeHabit,
  computeStreak,
  computeTarget,
  conceptsStudied,
  dayKey,
  emptyHabit,
  habitLabels,
  parseDailyTarget,
  parseLeeway,
  weekStart,
  type HabitEvent,
} from "./habit-core";

// 2026-09-26 is a Saturday; its week runs Monday 21 to Sunday 27.
const SAT = "2026-09-26";
const UTC = "UTC";

function days(...keys: string[]): Set<string> {
  return new Set(keys);
}

/** The keys from `from` back `n` days, inclusive. */
function run(from: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(from, -i));
}

describe("day keys", () => {
  it("reads an instant in the zone it is given", () => {
    // 20:00 UTC on the 25th is already the 26th in Singapore.
    expect(dayKey("2026-09-25T20:00:00Z", UTC)).toBe("2026-09-25");
    expect(dayKey("2026-09-25T20:00:00Z", "Asia/Singapore")).toBe("2026-09-26");
  });

  it("steps across month and year ends", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("puts every day of a week on its Monday", () => {
    expect(weekStart("2026-09-21")).toBe("2026-09-21");
    expect(weekStart(SAT)).toBe("2026-09-21");
    expect(weekStart("2026-09-27")).toBe("2026-09-21");
    expect(weekStart("2026-09-28")).toBe("2026-09-28");
  });
});

describe("computeStreak", () => {
  it("is zero with an empty event log", () => {
    const streak = computeStreak(days(), SAT, 1);
    expect(streak.days).toBe(0);
    expect(streak.leewayLeft).toBe(1);
    expect(streak.activeToday).toBe(false);
    expect(streak.week.map((d) => d.state)).toEqual([
      "missed", "missed", "missed", "missed", "missed", "today", "future",
    ]);
  });

  it("counts an unbroken run back from today", () => {
    const streak = computeStreak(days(...run(SAT, 14)), SAT, 0);
    expect(streak.days).toBe(14);
    expect(streak.activeToday).toBe(true);
  });

  it("does not break on today with nothing done yet", () => {
    const streak = computeStreak(days(...run(addDays(SAT, -1), 5)), SAT, 0);
    expect(streak.days).toBe(5);
    expect(streak.week.at(5)).toEqual({ date: SAT, state: "today" });
  });

  it("breaks on the first miss when there is no leeway", () => {
    const active = [SAT, addDays(SAT, -1), /* miss */ addDays(SAT, -3), addDays(SAT, -4)];
    expect(computeStreak(days(...active), SAT, 0).days).toBe(2);
  });

  it("forgives one miss a week with a leeway of one, without counting it", () => {
    const active = [SAT, addDays(SAT, -1), /* Thu miss */ addDays(SAT, -3), addDays(SAT, -4)];
    const streak = computeStreak(days(...active), SAT, 1);
    expect(streak.days).toBe(4);
    expect(streak.leewayLeft).toBe(0);
    expect(streak.week.find((d) => d.date === "2026-09-24")?.state).toBe("forgiven");
  });

  it("breaks on a second miss in the same week", () => {
    // Thu and Tue missed, both in the week of Monday the 21st.
    const active = [SAT, "2026-09-25", "2026-09-23", "2026-09-21", "2026-09-20"];
    const streak = computeStreak(days(...active), SAT, 1);
    expect(streak.days).toBe(3);
    expect(streak.week.find((d) => d.date === "2026-09-24")?.state).toBe("forgiven");
    expect(streak.week.find((d) => d.date === "2026-09-22")?.state).toBe("missed");
  });

  it("gives each week its own leeway, split at Monday", () => {
    // Misses on Wed 23 (this week) and Fri 18 (last week): one each, both forgiven.
    const active = run(SAT, 14).filter((d) => d !== "2026-09-23" && d !== "2026-09-18");
    const streak = computeStreak(days(...active), SAT, 1);
    expect(streak.days).toBe(12);
    expect(streak.leewayLeft).toBe(0);
  });

  it("treats Sunday and the following Monday as different weeks", () => {
    // Sunday 20 and Monday 21 both missed: one per week, so both forgiven.
    const today = "2026-09-23";
    const active = [today, "2026-09-22", "2026-09-19", "2026-09-18"];
    const streak = computeStreak(days(...active), today, 1);
    expect(streak.days).toBe(4);
  });

  it("does not spend leeway on misses before the run began", () => {
    // Active only today; yesterday is forgiven by the walk and then the walk
    // runs past the earliest day. Nothing was being protected.
    const streak = computeStreak(days(SAT), SAT, 1);
    expect(streak.days).toBe(1);
    expect(streak.leewayLeft).toBe(1);
    expect(streak.week.find((d) => d.date === "2026-09-25")?.state).toBe("missed");
  });

  it("reports a lapsed streak as zero with the leeway untouched", () => {
    const streak = computeStreak(days("2026-08-20"), SAT, 1);
    expect(streak.days).toBe(0);
    expect(streak.leewayLeft).toBe(1);
  });
});

describe("activeDays", () => {
  it("ignores void events and anything in a voided session", () => {
    const events: HabitEvent[] = [
      { at: "2026-09-24T10:00:00Z", type: "observation", concept: "a", session: "s1" },
      { at: "2026-09-25T10:00:00Z", type: "observation", concept: "a", session: "s2" },
      { at: "2026-09-26T10:00:00Z", type: "void", session: "s2" },
      { at: "not a date", type: "observation" },
    ];
    expect([...activeDays(events, UTC)]).toEqual(["2026-09-24"]);
  });
});

describe("the daily target", () => {
  const events: HabitEvent[] = [
    { at: "2026-09-26T09:00:00Z", type: "observation", concept: "dot", source: "teach" },
    { at: "2026-09-26T09:05:00Z", type: "observation", concept: "dot", source: "probe" },
    { at: "2026-09-26T09:10:00Z", type: "observation", concept: "cross" },
    { at: "2026-09-26T09:15:00Z", type: "observation", concept: "norm", source: "review" },
    { at: "2026-09-25T09:00:00Z", type: "observation", concept: "old", source: "teach" },
    { at: "2026-09-26T09:20:00Z", type: "session-start" },
  ];

  it("counts distinct concepts taught or probed today, a missing source as a probe", () => {
    expect(conceptsStudied(events, SAT, UTC)).toBe(2);
  });

  it("counts the review queue as one unit, met when it is empty", () => {
    expect(computeTarget({ concepts: 1, reviews: true }, 0, 4)).toMatchObject({ done: 0, total: 2 });
    expect(computeTarget({ concepts: 1, reviews: true }, 3, 0)).toMatchObject({ done: 2, total: 2 });
    expect(computeTarget({ concepts: 2, reviews: false }, 1, 0)).toMatchObject({ done: 1, total: 2 });
  });

  it("parses the stored preferences, defaulting field by field", () => {
    expect(parseDailyTarget(undefined)).toEqual({ concepts: 1, reviews: true });
    expect(parseDailyTarget({ concepts: 3 })).toEqual({ concepts: 3, reviews: true });
    expect(parseDailyTarget({ concepts: "3", reviews: false })).toEqual({ concepts: 1, reviews: false });
    expect(parseDailyTarget({ concepts: 900 }).concepts).toBe(20);
    expect(parseDailyTarget([1, 2])).toEqual({ concepts: 1, reviews: true });
    expect(parseLeeway(undefined)).toBe(1);
    expect(parseLeeway(2)).toBe(2);
    expect(parseLeeway(-3)).toBe(0);
    expect(parseLeeway(12)).toBe(7);
    expect(parseLeeway("2")).toBe(1);
  });

  it("puts it together from rows", () => {
    const habit = computeHabit({
      events,
      preferences: { dailyTarget: { concepts: 2, reviews: true }, dailyLeeway: 0 },
      dueReviews: 3,
      now: new Date("2026-09-26T12:00:00Z"),
      timeZone: UTC,
    });
    expect(habit.reachable).toBe(true);
    expect(habit.streak).toMatchObject({ days: 2, leeway: 0, activeToday: true });
    expect(habit.target).toMatchObject({ conceptsDone: 2, done: 2, total: 3, reviewsCleared: false });
  });

  it("claims nothing done when the catalog could not be asked", () => {
    const habit = emptyHabit(new Date("2026-09-26T12:00:00Z"), UTC);
    expect(habit.reachable).toBe(false);
    expect(habit.streak.days).toBe(0);
    expect(habit.target).toMatchObject({ done: 0, total: 2, reviewsCleared: false });
  });
});

describe("habitLabels", () => {
  it("states the numbers and the leeway as facts", () => {
    const habit = computeHabit({
      events: [{ at: "2026-09-26T09:00:00Z", type: "observation", concept: "dot", source: "teach" }],
      preferences: {},
      dueReviews: 1,
      now: new Date("2026-09-26T12:00:00Z"),
      timeZone: UTC,
    });
    const labels = habitLabels(habit);
    expect(labels.streak).toBe("1 day streak");
    expect(labels.streakShort).toBe("1");
    expect(labels.streakTitle).toBe("1 day in a row. Studied today. 1 free miss left this week.");
    expect(labels.target).toBe("Target 1 / 2");
    expect(labels.targetTitle).toBe("Today's target: 1 concept + due reviews. 1 concept studied today, 1 review due.");
  });

  it("says why when the catalog is down", () => {
    expect(habitLabels(emptyHabit()).targetTitle).toMatch(/Not connected/);
  });
});
