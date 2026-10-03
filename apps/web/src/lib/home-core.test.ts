import { describe, expect, it } from "vitest";

import type { LogEvent } from "@/lib/days";
import {
  clock,
  conceptTouches,
  countCheckBlocks,
  coursesInProgress,
  dayDiff,
  estimateMinutes,
  homeThreads,
  lastSeenLabel,
  nextUpEyebrows,
  pastDayLabel,
  reviewKindLabel,
  type ModulePlace,
  type ModuleVisit,
} from "@/lib/home-core";

// Every date here is read in UTC so the suite means the same on any machine.
const TZ = "UTC";
// A Saturday.
const NOW = new Date("2026-09-26T10:00:00Z");
const TODAY = "2026-09-26";

describe("day words", () => {
  it("counts whole calendar days", () => {
    expect(dayDiff("2026-09-20", TODAY)).toBe(6);
    expect(dayDiff(TODAY, "2026-09-20")).toBe(-6);
    // Across a month and a year boundary.
    expect(dayDiff("2025-12-31", "2026-01-01")).toBe(1);
  });

  it("names a past day the way a thread does", () => {
    expect(pastDayLabel(TODAY, TODAY)).toBe("Today");
    expect(pastDayLabel("2026-09-25", TODAY)).toBe("Yesterday");
    expect(pastDayLabel("2026-09-21", TODAY)).toBe("Mon");
    expect(pastDayLabel("2026-09-19", TODAY)).toBe("19 Sep");
    expect(pastDayLabel("2025-12-30", TODAY)).toBe("30 Dec 2025");
  });

  it("says when a concept was last seen", () => {
    expect(lastSeenLabel(null, NOW, TZ)).toBeNull();
    expect(lastSeenLabel("2026-09-26T01:00:00Z", NOW, TZ)).toBe("today");
    expect(lastSeenLabel("2026-09-25T23:00:00Z", NOW, TZ)).toBe("yesterday");
    expect(lastSeenLabel("2026-09-23T12:00:00Z", NOW, TZ)).toBe("3 days ago");
    expect(lastSeenLabel("2026-08-20T12:00:00Z", NOW, TZ)).toBe("on 20 Aug");
  });

  it("counts days in the app's zone, not UTC", () => {
    // 20:00 UTC on the 25th is already the 26th in Singapore.
    expect(lastSeenLabel("2026-09-25T20:00:00Z", NOW, "Asia/Singapore")).toBe("today");
  });
});

describe("reviews", () => {
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

describe("pick up where you left off", () => {
  const PLACES: Record<string, ModulePlace> = {
    "cs3230/m6": { courseCode: "CS3230", courseTitle: "Algorithms", moduleTitle: "Randomized algorithms", moduleOrder: 6 },
    "cs3230/": { courseCode: "CS3230", courseTitle: "Algorithms", moduleTitle: null, moduleOrder: null },
  };
  const place = (v: ModuleVisit) => PLACES[`${v.courseSlug}/${v.moduleSlug ?? ""}`] ?? null;
  const none = { modules: [], place, videos: [], drafts: [], concepts: [] };

  it("merges every kind into one list, newest first, with the day it was touched", () => {
    const threads = homeThreads(
      {
        modules: [{ courseSlug: "cs3230", moduleSlug: "m6", at: "2026-09-25T09:00:00Z" }],
        place,
        videos: [
          {
            assetId: "manimkc:out/a.mp4",
            title: "Randomized algorithms",
            position: 137.4,
            duration: 696,
            watchedAt: null,
            updatedAt: "2026-09-26T08:00:00Z",
          },
        ],
        drafts: [{ id: "d1", kind: "video", title: "How dengue moves", updatedAt: "2026-09-21T10:00:00Z" }],
        concepts: [{ id: "big-o", title: "Big-O", bucket: "learning", pL: 0.15, at: "2026-09-10T10:00:00Z" }],
      },
      { now: NOW, timeZone: TZ },
    );
    expect(threads.map((t) => [t.kind, t.title, t.detail, t.day, t.href])).toEqual([
      ["video", "Randomized algorithms", "2:17 of 11:36", "Today", "/library/manimkc%3Aout%2Fa.mp4"],
      ["module", "Randomized algorithms", "CS3230 · Module 6", "Yesterday", "/courses/cs3230/m6"],
      ["draft", "How dengue moves", "Video draft", "Mon", "/studio?draft=d1"],
      ["concept", "Big-O", null, "10 Sep", "/learn/big-o"],
    ]);
    expect(threads[0].percent).toBe(20);
    expect(threads[3]).toMatchObject({ bucket: "learning", pL: 0.15 });
  });

  it("names a course visited without a module, and drops a visit whose course or module is gone", () => {
    const threads = homeThreads(
      {
        ...none,
        modules: [
          { courseSlug: "cs3230", at: "2026-09-26T09:00:00Z" },
          { courseSlug: "gone", moduleSlug: "m1", at: "2026-09-26T08:00:00Z" },
        ],
      },
      { now: NOW, timeZone: TZ },
    );
    expect(threads.map((t) => [t.title, t.detail, t.href])).toEqual([["Algorithms", "CS3230", "/courses/cs3230"]]);
  });

  it("keeps only videos with somewhere to resume", () => {
    const video = { title: "V", duration: 600, watchedAt: null, updatedAt: "2026-09-26T08:00:00Z" };
    const threads = homeThreads(
      {
        ...none,
        videos: [
          { ...video, assetId: "head", position: 2 },
          { ...video, assetId: "tail", position: 595 },
          { ...video, assetId: "watched", position: 300, watchedAt: "2026-09-26T08:00:00Z" },
          { ...video, assetId: "gone", position: 300, title: null },
          { ...video, assetId: "middle", position: 300 },
        ],
      },
      { now: NOW, timeZone: TZ },
    );
    expect(threads.map((t) => t.key)).toEqual(["video:middle"]);
  });

  it("stops at the limit", () => {
    const concepts = Array.from({ length: 8 }, (_, i) => ({
      id: `c${i}`,
      title: `C${i}`,
      bucket: "learning" as const,
      pL: 0.5,
      at: `2026-09-2${i % 6}T10:00:00Z`,
    }));
    expect(homeThreads({ ...none, concepts }, { now: NOW, timeZone: TZ })).toHaveLength(5);
    expect(homeThreads({ ...none, concepts }, { now: NOW, timeZone: TZ, limit: 2 })).toHaveLength(2);
  });

  it("reads each concept's latest answer from the log, leaving out voided sessions and other events", () => {
    const events: LogEvent[] = [
      { at: "2026-09-20T10:00:00Z", type: "observation", concept: "softmax", session: "s1" },
      { at: "2026-09-22T10:00:00Z", type: "observation", concept: "softmax", session: "s2" },
      { at: "2026-09-24T10:00:00Z", type: "observation", concept: "softmax", session: "s3" },
      { at: "2026-09-24T11:00:00Z", type: "void", session: "s3" },
      { at: "2026-09-25T10:00:00Z", type: "review", concept: "softmax" },
      { at: "2026-09-25T10:00:00Z", type: "observation", concept: "deleted" },
    ];
    const known = (id: string) => (id === "softmax" ? { title: "Softmax", bucket: "learning" as const, pL: 0.4 } : null);
    expect(conceptTouches(events, known)).toEqual([
      { id: "softmax", title: "Softmax", bucket: "learning", pL: 0.4, at: "2026-09-22T10:00:00Z" },
    ]);
  });

  it("prints a clock", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(137.9)).toBe("2:17");
    expect(clock(3723)).toBe("1:02:03");
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

  it("counts by mastery where a topic has concepts, and by the tick where it has none", () => {
    // a1 mastered and unticked, a2 ticked but not mastered, b1 ticked and bare.
    const standing = { mastered: ["a1"], withConcepts: ["a1", "a2"] };
    expect(coursesInProgress(COURSES, { a2: true, b1: true }, standing)).toEqual([
      { slug: "b", code: "B2", title: "Second", completed: 1, total: 2, percent: 50 },
      { slug: "a", code: "A1", title: "First", completed: 1, total: 4, percent: 25 },
    ]);
  });
});
