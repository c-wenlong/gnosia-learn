import { describe, expect, it } from "vitest";

import type { LogEvent } from "@/lib/days";
import {
  clock,
  conceptTouches,
  coursesInProgress,
  dayDiff,
  homeThreads,
  lastSeenLabel,
  nearThreads,
  nextFromHere,
  nextUpEyebrows,
  pastDayLabel,
  recallHref,
  readIsStale,
  recallPicks,
  type GraphConcept,
  type ModulePlace,
  type ModuleVisit,
  type PathCourse,
  type Thread,
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

describe("next from here", () => {
  const concept = (id: string, extra: Partial<GraphConcept> = {}): GraphConcept => ({
    id,
    title: id.toUpperCase(),
    pL: 0.25,
    mastery: "gap",
    observations: 0,
    lastSeen: null,
    requires: [],
    topics: [],
    ...extra,
  });
  const CONCEPTS = [
    concept("dot", { pL: 0.8, mastery: "shaky", observations: 3 }),
    concept("softmax", { requires: ["dot"] }),
    concept("attention", { requires: ["dot", "softmax"] }),
    concept("cosine", { requires: ["dot"] }),
    concept("other"),
  ];
  const COURSE: PathCourse = {
    slug: "cs3230",
    code: "CS3230",
    order: 1,
    modules: [
      { slug: "m1", order: 1, topics: [{ id: "t1", title: "Big-O" }, { id: "t2", title: "Recurrences" }] },
      { slug: "m2", order: 2, topics: [{ id: "t3", title: "Divide and conquer" }, { id: "t4", title: "Master theorem" }] },
    ],
  };
  const thread = (extra: Partial<Thread>): Thread => ({
    key: `t:${extra.title}`,
    kind: "concept",
    title: "x",
    detail: null,
    href: "/",
    at: "2026-09-26T09:00:00Z",
    day: "Today",
    ...extra,
  });
  const graph = (done: string[] = []) => ({
    concepts: CONCEPTS,
    frontier: ["softmax", "cosine", "other"],
    courses: [COURSE],
    done: (id: string) => done.includes(id),
    topicHref: (c: PathCourse, m: string, t: string) => `/courses/${c.slug}/${m}#${t}`,
  });

  it("lists what a concept opens on the frontier, and a module's next open topic then the next module's", () => {
    const groups = nextFromHere(
      [
        thread({ title: "Dot product", conceptId: "dot" }),
        thread({ kind: "module", title: "Module one", courseSlug: "cs3230", moduleSlug: "m1" }),
      ],
      graph(["t1"]),
    );
    expect(groups.map((g) => [g.heading, g.steps.map((s) => s.title)])).toEqual([
      ["After Dot product", ["SOFTMAX", "COSINE"]],
      ["After Module one", ["Recurrences", "Divide and conquer"]],
    ]);
    expect(groups[0].steps[0]).toMatchObject({ href: "/learn/softmax", bucket: "untouched" });
    expect(groups[1].steps[1]).toMatchObject({ detail: "CS3230 · Module 2", href: "/courses/cs3230/m2#t3" });
  });

  it("skips a thread that opens nothing, a step already shown, and a step that is itself a thread", () => {
    const groups = nextFromHere(
      [
        thread({ title: "Other", conceptId: "other" }),
        thread({ title: "Dot", conceptId: "dot" }),
        thread({ title: "Dot again", conceptId: "dot", key: "again" }),
        thread({ title: "Cosine", conceptId: "cosine" }),
      ],
      graph(),
      { groups: 3 },
    );
    expect(groups.map((g) => [g.heading, g.steps.map((s) => s.title)])).toEqual([["After Dot", ["SOFTMAX"]]]);
  });

  it("caps a group after taking out what an earlier group showed, so an overlap does not empty it", () => {
    const groups = nextFromHere(
      [
        thread({ kind: "module", title: "Module one", courseSlug: "cs3230", moduleSlug: "m1" }),
        thread({ kind: "module", title: "The course", courseSlug: "cs3230" }),
      ],
      graph(),
      { perGroup: 1 },
    );
    expect(groups.map((g) => [g.heading, g.steps.map((s) => s.title)])).toEqual([
      ["After Module one", ["Big-O"]],
      ["After The course", ["Divide and conquer"]],
    ]);
  });

  it("starts a page with no threads at the first course's first open topic", () => {
    expect(nextFromHere([], graph(["t1"]))).toEqual([
      { key: "start", heading: "Start here", steps: [expect.objectContaining({ title: "Recurrences" })] },
    ]);
    expect(nextFromHere([], { ...graph(), courses: [] })).toEqual([]);
  });

  it("finds the concepts near the threads, and picks the recall cards nearest first, longest unseen first", () => {
    const concepts = [
      ...CONCEPTS.filter((c) => c.id !== "other"),
      concept("other", { lastSeen: "2026-08-01T00:00:00Z" }),
      concept("topic-bound", { topics: ["t2"], lastSeen: "2026-09-01T00:00:00Z" }),
      concept("far", { lastSeen: "2026-09-20T00:00:00Z" }),
    ];
    const threads = [
      thread({ title: "Softmax", conceptId: "softmax" }),
      thread({ kind: "module", title: "M1", courseSlug: "cs3230", moduleSlug: "m1" }),
    ];
    const near = nearThreads(threads, [], concepts, [COURSE]);
    expect([...near].sort()).toEqual(["attention", "dot", "softmax", "topic-bound"]);
    // A topic "Next from here" lists brings its concepts near, even in a module not visited.
    const later = [...concepts, concept("in-m2", { topics: ["t3"] })];
    const listed = [{ key: "g", heading: "After M1", steps: [{ key: "topic:t3", title: "D&C", detail: null, href: "/" }] }];
    expect(nearThreads(threads, listed, later, [COURSE]).has("in-m2")).toBe(true);
    expect(nearThreads(threads, [], later, [COURSE]).has("in-m2")).toBe(false);

    const picks = recallPicks(
      [{ conceptId: "far" }, { conceptId: "other" }, { conceptId: "topic-bound" }, { conceptId: "gone" }, { conceptId: "dot" }],
      near,
      concepts,
      { now: NOW, timeZone: TZ },
    );
    // Near first (dot was never seen, so it leads), then the far ones by age.
    expect(picks.map((p) => p.conceptId)).toEqual(["dot", "topic-bound", "other"]);
    expect(picks[1].lastSeen).toBe("25 days ago");
    expect(recallHref(picks)).toBe("/review?only=dot,topic-bound,other");
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

describe("readIsStale", () => {
  it("is stale past the age, fresh within it, and stale when the time cannot be read", () => {
    expect(readIsStale("2026-09-26T09:58:00Z", NOW, 60_000)).toBe(true);
    expect(readIsStale("2026-09-26T09:59:30Z", NOW, 60_000)).toBe(false);
    expect(readIsStale("not a time", NOW, 60_000)).toBe(true);
  });
});
