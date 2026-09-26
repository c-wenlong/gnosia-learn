import { describe, expect, it } from "vitest";

import { computeHabit, emptyHabit, type HabitEvent } from "@/lib/habit-core";
import {
  activityRows,
  countCheckBlocks,
  coursesInProgress,
  dayDiff,
  dueLabel,
  estimateMinutes,
  futureDayLabel,
  lastSeenLabel,
  leewayLine,
  nextUpEyebrows,
  pastDayLabel,
  reviewKindLabel,
  streakStrip,
  targetRows,
} from "@/lib/today-core";

// Every date here is read in UTC so the suite means the same on any machine.
const TZ = "UTC";
// A Saturday.
const NOW = new Date("2026-09-26T10:00:00Z");
const TODAY = "2026-09-26";

const TITLES: Record<string, string> = {
  "cross-product": "Cross product",
  "dot-product": "Dot product",
  softmax: "Softmax",
  "self-attention": "Self-attention",
};
const title = (id: string) => TITLES[id] ?? id;

function obs(at: string, concept: string, extra: Partial<HabitEvent> = {}): HabitEvent {
  return { at, type: "observation", concept, source: "probe", correct: true, ...extra };
}

describe("day words", () => {
  it("counts whole calendar days", () => {
    expect(dayDiff("2026-09-20", TODAY)).toBe(6);
    expect(dayDiff(TODAY, "2026-09-20")).toBe(-6);
    // Across a month and a year boundary.
    expect(dayDiff("2025-12-31", "2026-01-01")).toBe(1);
  });

  it("names a past day the way the activity list does", () => {
    expect(pastDayLabel(TODAY, TODAY)).toBe("Today");
    expect(pastDayLabel("2026-09-25", TODAY)).toBe("Yesterday");
    expect(pastDayLabel("2026-09-21", TODAY)).toBe("Mon");
    expect(pastDayLabel("2026-09-19", TODAY)).toBe("19 Sep");
    expect(pastDayLabel("2025-12-30", TODAY)).toBe("30 Dec 2025");
  });

  it("names a coming day", () => {
    expect(futureDayLabel(TODAY, TODAY)).toBe("today");
    expect(futureDayLabel("2026-09-27", TODAY)).toBe("tomorrow");
    expect(futureDayLabel("2026-10-02", TODAY)).toBe("Fri");
    expect(futureDayLabel("2026-10-12", TODAY)).toBe("12 Oct");
  });

  it("says when a concept was last seen", () => {
    expect(lastSeenLabel(null, NOW, TZ)).toBeNull();
    expect(lastSeenLabel("2026-09-26T01:00:00Z", NOW, TZ)).toBe("today");
    expect(lastSeenLabel("2026-09-25T23:00:00Z", NOW, TZ)).toBe("yesterday");
    expect(lastSeenLabel("2026-09-23T12:00:00Z", NOW, TZ)).toBe("3 days ago");
    expect(lastSeenLabel("2026-08-20T12:00:00Z", NOW, TZ)).toBe("on 20 Aug");
  });

  it("counts days in the habit's zone, not UTC", () => {
    // 20:00 UTC on the 25th is already the 26th in Singapore.
    expect(lastSeenLabel("2026-09-25T20:00:00Z", NOW, "Asia/Singapore")).toBe("today");
  });
});

describe("reviews due", () => {
  it("says due today or how many days overdue", () => {
    expect(dueLabel("2026-09-26T00:00:00Z", NOW, TZ)).toEqual({ overdueDays: 0, long: "due today", short: "today" });
    expect(dueLabel("2026-09-25T09:00:00Z", NOW, TZ)).toEqual({ overdueDays: 1, long: "overdue 1d", short: "1d late" });
    expect(dueLabel("2026-08-21T06:38:51Z", NOW, TZ).long).toBe("overdue 36d");
  });

  it("estimates 45 seconds a card, at least a minute", () => {
    expect(estimateMinutes(0)).toBe(0);
    expect(estimateMinutes(1)).toBe(1);
    expect(estimateMinutes(12)).toBe(9);
  });

  it("labels a card by the checks its note holds", () => {
    expect(reviewKindLabel(0)).toBe("recall");
    expect(reviewKindLabel(2)).toBe("check · 2");
  });

  it("counts check blocks the way the CLI parses them", () => {
    const body = [
      "# Dot product",
      "",
      "## Checks",
      "",
      "```check",
      "q: What is a · b for orthogonal vectors?",
      "a: Zero.",
      "```",
      "",
      "```check",
      "q:",
      "  continued on the next line",
      "why: a question can wrap",
      "```",
      "",
      "```check",
      "a: an answer with no question is not a check",
      "```",
      "",
      "```ts",
      "q: not a check block",
      "```",
    ].join("\n");
    expect(countCheckBlocks(body)).toBe(2);
    expect(countCheckBlocks("")).toBe(0);
  });
});

describe("recent activity", () => {
  it("groups a session's answers into one row per kind, newest first", () => {
    const events: HabitEvent[] = [
      { at: "2026-09-25T09:00:00Z", type: "session-start", session: "s1" },
      obs("2026-09-25T09:01:00Z", "cross-product", { session: "s1", source: "teach", pLBefore: 0.31, pLAfter: 0.4 }),
      obs("2026-09-25T09:02:00Z", "cross-product", { session: "s1", source: "teach", correct: false, pLBefore: 0.4, pLAfter: 0.35 }),
      obs("2026-09-25T09:03:00Z", "cross-product", { session: "s1", source: "teach", pLBefore: 0.35, pLAfter: 0.55 }),
      { at: "2026-09-25T09:10:00Z", type: "session-close", session: "s1" },
      obs("2026-09-21T09:00:00Z", "softmax", { session: "s0", pLBefore: 0.2, pLAfter: 0.28 }),
    ];
    const rows = activityRows(events, { now: NOW, timeZone: TZ, title });
    expect(rows.map((r) => [r.day, r.text, r.detail])).toEqual([
      ["Yesterday", "Teach · Cross product · 2 of 3 right", "p(L) 0.31 to 0.55"],
      ["Mon", "Probe · Softmax · 1 of 1 right", "p(L) 0.20 to 0.28"],
    ]);
    expect(rows[0].short).toBe("Teach · Cross product · 2/3");
    expect(rows[0].kind).toBe("Teach");
  });

  it("sums a many-concept probe instead of listing every concept", () => {
    const events = [
      obs("2026-09-25T09:00:00Z", "softmax", { session: "s", pLBefore: 0.25, pLAfter: 0.6 }),
      obs("2026-09-25T09:01:00Z", "self-attention", { session: "s", correct: false, pLBefore: 0.3, pLAfter: 0.05 }),
      obs("2026-09-25T09:02:00Z", "dot-product", { session: "s", correct: false, pLBefore: 0.26, pLAfter: 0.04 }),
    ];
    const [row] = activityRows(events, { now: NOW, timeZone: TZ, title });
    expect(row.text).toBe("Probe · 3 concepts · 1 of 3 right");
    expect(row.detail).toBe("p(L) 1 up · 2 down");
  });

  it("reads a day of graded cards as one review row with the next due day", () => {
    const events: HabitEvent[] = [
      { at: "2026-09-25T08:00:00Z", type: "review", concept: "dot-product", grade: 4 },
      { at: "2026-09-25T08:01:00Z", type: "review", concept: "cross-product", grade: 2 },
      { at: "2026-09-25T08:02:00Z", type: "review", concept: "softmax", grade: 1 },
    ];
    const due: Record<string, string> = {
      "dot-product": "2026-10-10T00:00:00Z",
      "cross-product": "2026-10-02T00:00:00Z",
      softmax: "2026-10-03T00:00:00Z",
    };
    const [row] = activityRows(events, { now: NOW, timeZone: TZ, title, nextDue: (id) => due[id] ?? null });
    expect(row.text).toBe("Review · 3 cards · 2 again");
    expect(row.short).toBe("Review · 3 cards");
    expect(row.detail).toBe("next due Fri");
  });

  it("counts a card failed then passed once, and splits a morning and an evening review", () => {
    const events: HabitEvent[] = [
      { at: "2026-09-25T08:00:00Z", type: "review", concept: "softmax", grade: 1 },
      { at: "2026-09-25T08:05:00Z", type: "review", concept: "softmax", grade: 4 },
      { at: "2026-09-25T08:06:00Z", type: "review", concept: "dot-product", grade: 5 },
      // Five hours later: a second sitting, not more of the first.
      { at: "2026-09-25T13:06:00Z", type: "review", concept: "cross-product", grade: 2 },
    ];
    const rows = activityRows(events, { now: NOW, timeZone: TZ, title });
    expect(rows.map((r) => r.text)).toEqual(["Review · 1 card · 1 again", "Review · 2 cards · 1 again"]);
  });

  it("names a watched or read library asset, and runs several together", () => {
    const events: HabitEvent[] = [
      { at: "2026-09-21T08:00:00Z", type: "watched", asset: "manimkc:out/dot.mp4", kind: "video" },
      { at: "2026-09-25T08:00:00Z", type: "watched", asset: "note:learn/a.md", kind: "note" },
      { at: "2026-09-25T08:10:00Z", type: "watched", asset: "link:b", kind: "link" },
    ];
    const titles: Record<string, string> = { "manimkc:out/dot.mp4": "Dot product explainer" };
    const rows = activityRows(events, { now: NOW, timeZone: TZ, title, assetTitle: (id) => titles[id] ?? null });
    expect(rows.map((r) => [r.day, r.text, r.detail])).toEqual([
      ["Yesterday", "Read · 2 assets", null],
      ["Mon", "Watched · Dot product explainer", null],
    ]);
  });

  it("leaves out a voided session and the bookkeeping events", () => {
    const events: HabitEvent[] = [
      { at: "2026-09-25T09:00:00Z", type: "session-start", session: "gone" },
      obs("2026-09-25T09:01:00Z", "softmax", { session: "gone" }),
      { at: "2026-09-25T09:05:00Z", type: "void", session: "gone", reason: "smoke test" },
      { at: "2026-09-25T10:00:00Z", type: "session-close", session: "other" },
    ];
    expect(activityRows(events, { now: NOW, timeZone: TZ, title })).toEqual([]);
  });

  it("stops at the limit and keeps answers outside a session apart by day", () => {
    const events = [
      obs("2026-09-22T09:00:00Z", "softmax"),
      obs("2026-09-23T09:00:00Z", "softmax"),
      obs("2026-09-24T09:00:00Z", "softmax"),
      obs("2026-09-24T10:00:00Z", "dot-product"),
      obs("2026-09-25T09:00:00Z", "softmax"),
      obs("2026-09-26T09:00:00Z", "softmax"),
    ];
    const rows = activityRows(events, { now: NOW, timeZone: TZ, title, limit: 4 });
    expect(rows.map((r) => r.day)).toEqual(["Today", "Yesterday", "Thu", "Wed"]);
    expect(rows[2].text).toBe("Probe · 2 concepts · 2 of 2 right");
  });

  it("prints no p(L) when the payload has none", () => {
    const [row] = activityRows([obs("2026-09-26T09:00:00Z", "softmax")], { now: NOW, timeZone: TZ, title });
    expect(row.detail).toBeNull();
  });
});

describe("next up", () => {
  it("names the course and module when a curriculum item links the concept", () => {
    expect(nextUpEyebrows({ courseCode: "CP4281", moduleOrder: 2 })).toEqual({
      eyebrow: "Next on your path · CP4281 · Module 2",
      eyebrowShort: "Next up · CP4281 M2",
    });
  });

  it("falls back to the note's folder, then to nothing", () => {
    expect(nextUpEyebrows({ domain: "foundations" }).eyebrow).toBe("Next on your path · foundations");
    expect(nextUpEyebrows({}).eyebrowShort).toBe("Next up");
  });
});

describe("the habit cards", () => {
  const habitWith = (events: HabitEvent[], dueReviews: number, preferences: Record<string, unknown> = {}) =>
    computeHabit({ events, preferences, dueReviews, now: NOW, timeZone: TZ });

  it("draws the week Monday first, marking today", () => {
    const habit = habitWith(
      [obs("2026-09-21T09:00:00Z", "softmax"), obs("2026-09-22T09:00:00Z", "softmax"), obs("2026-09-24T09:00:00Z", "softmax")],
      0,
    );
    const strip = streakStrip(habit.streak.week, TODAY);
    expect(strip.map((d) => d.letter).join("")).toBe("MTWTFSS");
    // Friday is forgiven (this week's one free miss); Wednesday finds the
    // leeway spent, so the run starts on Thursday and Wednesday is a miss.
    expect(strip.map((d) => d.state)).toEqual(["done", "done", "missed", "done", "forgiven", "today", "future"]);
    expect(strip.filter((d) => d.isToday).map((d) => d.date)).toEqual([TODAY]);
    expect(strip[4].description).toBe("Friday, missed, covered by a free miss");
    expect(habit.streak.days).toBe(1);
    expect(strip[5].description).toBe("Saturday, today, nothing recorded yet");
  });

  it("says today was studied once it was", () => {
    const habit = habitWith([obs("2026-09-26T08:00:00Z", "softmax")], 0);
    const today = streakStrip(habit.streak.week, TODAY).find((d) => d.isToday);
    expect(today?.state).toBe("done");
    expect(today?.description).toBe("Saturday, today, studied");
  });

  it("states the leeway as a fact", () => {
    expect(leewayLine(habitWith([], 0))).toBe("1 free miss left this week");
    expect(leewayLine(habitWith([], 0, { dailyLeeway: 2 }))).toBe("2 free misses left this week");
    expect(leewayLine(habitWith([], 0, { dailyLeeway: 0 }))).toBe("No free misses set");
  });

  it("lists the target's two halves with what is left of each", () => {
    expect(targetRows(habitWith([], 3))).toEqual([
      { id: "reviews", label: "Reviews cleared", done: false, status: "3 due" },
      { id: "concepts", label: "One concept taught", done: false, status: "open" },
    ]);
    const done = habitWith([obs("2026-09-26T08:00:00Z", "softmax")], 0);
    expect(targetRows(done).map((r) => [r.done, r.status])).toEqual([
      [true, "done"],
      [true, "done"],
    ]);
    const three = habitWith([obs("2026-09-26T08:00:00Z", "softmax")], 0, {
      dailyTarget: { concepts: 3, reviews: false },
    });
    expect(targetRows(three)).toEqual([{ id: "concepts", label: "Three concepts taught", done: false, status: "1 of 3" }]);
  });

  it("claims nothing when the database could not be read", () => {
    expect(targetRows(emptyHabit(NOW, TZ)).map((r) => [r.done, r.status])).toEqual([
      [false, "not read"],
      [false, "not read"],
    ]);
  });
});

describe("courses in progress", () => {
  const COURSES = [
    { slug: "a", code: "A1", title: "First", order: 1, topicIds: ["a1", "a2", "a3", "a4"] },
    { slug: "b", code: "B2", title: "Second", order: 2, topicIds: ["b1", "b2"] },
    { slug: "c", code: "C3", title: "Untouched", order: 3, topicIds: ["c1"] },
  ];

  it("keeps courses with a tick, furthest along first", () => {
    expect(coursesInProgress(COURSES, { a1: true, b1: true })).toEqual([
      { slug: "b", code: "B2", title: "Second", completed: 1, total: 2, percent: 50 },
      { slug: "a", code: "A1", title: "First", completed: 1, total: 4, percent: 25 },
    ]);
  });

  it("is empty for a fresh learner", () => {
    expect(coursesInProgress(COURSES, {})).toEqual([]);
  });
});
