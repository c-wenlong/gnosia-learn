import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  asPinned,
  isAppPath,
  mergeStreams,
  moduleVisits,
  recentGroups,
  recentItems,
  recentPage,
  RECENT_PAGE,
  splitPinned,
  titleMatches,
  withPin,
  type PinnedRow,
  type RecentItem,
  type RecentModel,
  type RecentSources,
} from "./recent-core";

/**
 * Recent (L7 of docs/proposals/library-by-type-and-day.md): the list behind
 * the sidebar's Recent and Home's "Pick up where you left off". Its five
 * sources, the visit events merged with the preference they replace, the
 * resume rule for a video, the day headings, the pages, the pins, and the
 * server read that puts them together for one owner.
 */

const AT = (day: number, hour = 12) => new Date(Date.UTC(2026, 9, day, hour)).toISOString();

const none: RecentSources = { modules: [], place: () => null, videos: [], drafts: [], concepts: [], sessions: [] };
const place = () => ({ courseCode: "CS3230", courseTitle: "Algorithms", moduleTitle: "Divide and conquer", moduleOrder: 3 });

describe("the five sources", () => {
  it("makes a row of a module visit, naming the course and module, and leaves out a visit whose module is gone", () => {
    const rows = recentItems({
      ...none,
      modules: [
        { courseSlug: "cs3230", moduleSlug: "m3", at: AT(3) },
        { courseSlug: "gone", moduleSlug: "m1", at: AT(2) },
      ],
      place: (visit) => (visit.courseSlug === "gone" ? null : place()),
    });
    expect(rows).toEqual([
      {
        key: "module:cs3230/m3",
        kind: "module",
        title: "Divide and conquer",
        detail: "CS3230 · Module 3",
        href: "/courses/cs3230/m3",
        at: AT(3),
        courseSlug: "cs3230",
        moduleSlug: "m3",
      },
    ]);
  });

  it("makes a row of a video with somewhere to resume, and of no video finished, barely started or marked watched", () => {
    const video = (assetId: string, position: number, watchedAt: string | null = null) => ({
      assetId,
      title: assetId,
      position,
      duration: 600,
      watchedAt,
      updatedAt: AT(3),
    });
    const rows = recentItems({
      ...none,
      videos: [
        video("halfway", 300),
        // Within five seconds of the start, and ten of the end: the player starts these from the top.
        video("barely", 3),
        video("nearly-done", 595),
        video("watched", 300, AT(3)),
        { ...video("no-asset", 300), title: null },
      ],
    });
    expect(rows.map((r) => [r.key, r.detail, r.percent, r.href])).toEqual([["video:halfway", "5:00 of 10:00", 50, "/library/halfway"]]);
  });

  it("makes a row of a studio draft, a concept answered on, and a tutor session", () => {
    const rows = recentItems({
      ...none,
      drafts: [{ id: "d1", kind: "video", title: "TCP slow start", updatedAt: AT(3) }],
      concepts: [{ id: "recurrences", title: "Recurrences", bucket: "learning", pL: 0.4, at: AT(2) }],
      sessions: [{ id: "web-1", title: "Big-O", href: "/learn/big-o", updatedAt: AT(1) }],
    });
    expect(rows.map((r) => [r.key, r.kind, r.title, r.detail, r.href])).toEqual([
      ["draft:d1", "draft", "TCP slow start", "Video draft", "/studio?draft=d1"],
      ["concept:recurrences", "concept", "Recurrences", null, "/learn/recurrences"],
      ["session:web-1", "session", "Big-O", "Tutor session", "/learn/big-o"],
    ]);
    expect(rows[1]).toMatchObject({ bucket: "learning", pL: 0.4, conceptId: "recurrences" });
  });

  it("merges every kind newest first, keeping the sources' order for rows touched in one instant", () => {
    const rows = recentItems({
      ...none,
      modules: [{ courseSlug: "cs3230", moduleSlug: "m3", at: AT(1) }],
      place,
      drafts: [{ id: "d1", kind: "diagram", title: "A", updatedAt: AT(4) }],
      concepts: [{ id: "c", title: "C", bucket: "learning", pL: 0.1, at: AT(1) }],
      sessions: [{ id: "s", title: "S", href: "/learn/s", updatedAt: AT(2) }],
    });
    expect(rows.map((r) => r.kind)).toEqual(["draft", "session", "module", "concept"]);
  });
});

describe("module visits", () => {
  const visit = (course: string, module: string | undefined, at: string) => ({ type: "visit", at, course, ...(module === undefined ? {} : { module }) });

  it("reads the visit events, a module once at its latest visit, a course page as its own entry", () => {
    expect(
      moduleVisits(
        [visit("cs3230", "m1", AT(1)), visit("cs3230", "m1", AT(3)), visit("cs3230", undefined, AT(2)), { type: "observation", at: AT(4), concept: "x" }],
        [],
      ),
    ).toEqual([
      { courseSlug: "cs3230", moduleSlug: "m1", at: AT(3) },
      { courseSlug: "cs3230", at: AT(2) },
    ]);
  });

  it("keeps the five modules the preference held before the first event, merged by course and module, newest first", () => {
    const stored = [
      { courseSlug: "cs3230", moduleSlug: "m5", at: AT(2) },
      { courseSlug: "cs4225", moduleSlug: "m2", at: AT(1, 9) },
    ];
    expect(moduleVisits([visit("cs3230", "m5", AT(1)), visit("cs2111", "m1", AT(3))], stored)).toEqual([
      { courseSlug: "cs2111", moduleSlug: "m1", at: AT(3) },
      // The preference's later time wins over the older event.
      { courseSlug: "cs3230", moduleSlug: "m5", at: AT(2) },
      { courseSlug: "cs4225", moduleSlug: "m2", at: AT(1, 9) },
    ]);
  });

  it("keeps a visit older than the five the preference could hold", () => {
    const events = Array.from({ length: 7 }, (_, at) => visit("cs3230", `m${at + 1}`, AT(at + 1)));
    expect(moduleVisits(events, []).map((v) => v.moduleSlug)).toEqual(["m7", "m6", "m5", "m4", "m3", "m2", "m1"]);
  });
});

describe("pages and day headings", () => {
  const rows = (n: number): RecentItem[] =>
    Array.from({ length: n }, (_, at) => ({ key: `concept:${at}`, kind: "concept", title: `${at}`, detail: null, href: "/", at: AT(1) }));

  it("answers fifty rows a page, and says when there are more", () => {
    expect(RECENT_PAGE).toBe(50);
    expect(recentPage(rows(120), 1)).toMatchObject({ more: true });
    expect(recentPage(rows(120), 1).items).toHaveLength(50);
    expect(recentPage(rows(120), 2).items).toHaveLength(100);
    expect(recentPage(rows(120), 3)).toMatchObject({ more: false });
    expect(recentPage(rows(50), 1)).toMatchObject({ more: false });
    // A page count from a URL is bounded.
    expect(recentPage(rows(120), 0).items).toHaveLength(50);
  });

  it("puts rows under Today, Yesterday, the previous 7 and 30 days and Older, by local calendar day", () => {
    const now = new Date(2026, 9, 10, 9);
    const at = (daysAgo: number) => ({ at: new Date(2026, 9, 10 - daysAgo, 20).toISOString() });
    const groups = recentGroups([at(0), at(1), at(2), at(7), at(8), at(30), at(31)], now);
    expect(groups.map((g) => [g.label, g.rows.length])).toEqual([
      ["Today", 1],
      ["Yesterday", 1],
      ["Previous 7 days", 2],
      ["Previous 30 days", 2],
      ["Older", 1],
    ]);
  });

  it("merges two paged lists without showing a row the unread page of the other could outrank", () => {
    const row = (key: string, day: number): RecentItem => ({ key, kind: "concept", title: key, detail: null, href: "/", at: AT(day) });
    const merged = mergeStreams([
      { items: [row("a", 9), row("b", 5)], more: true },
      { items: [row("x", 8), row("y", 2)], more: false },
    ]);
    // "y" is older than the first list's last row read, which has more behind it.
    expect(merged.items.map((r) => r.key)).toEqual(["a", "x", "b"]);
    expect(merged.more).toBe(true);
    expect(mergeStreams([{ items: [row("a", 9)], more: false }, { items: [row("y", 2)], more: false }])).toMatchObject({ more: false });
  });
});

describe("pins and names", () => {
  const pin: PinnedRow = { key: "video:abc", kind: "video", title: "Master theorem", href: "/library/abc", at: AT(1) };

  it("reads stored pins defensively: a row that is not a pin, or links off the app, is dropped", () => {
    expect(
      asPinned([
        pin,
        { ...pin, key: "video:other", href: "//evil.example/x" },
        { ...pin, key: "concept:x" },
        { ...pin, key: "video:abc" },
        "nonsense",
      ]),
    ).toEqual([pin]);
    expect(isAppPath("/library/a")).toBe(true);
    expect(["//x", "https://x", "/\\x", "x", "/a\nb"].map(isAppPath)).toEqual([false, false, false, false, false]);
  });

  it("puts a new pin first, once, and moves a pinned row out of Recent, titled as it is now", () => {
    const other = { ...pin, key: "concept:c", kind: "concept" as const, title: "C", href: "/learn/c" };
    expect(withPin([other, pin], { ...pin, at: AT(3) }).map((p) => p.key)).toEqual(["video:abc", "concept:c"]);
    const live: RecentItem = { key: "video:abc", kind: "video", title: "Renamed upstream", detail: null, href: "/library/abc", at: AT(2) };
    const split = splitPinned([live], [pin]);
    expect(split.recent).toEqual([]);
    expect(split.pinned[0].title).toBe("Renamed upstream");
  });

  it("calls a conversation by its name, else its title, and leaves out one with neither", () => {
    const items = recentItems({
      modules: [],
      place: () => null,
      videos: [],
      concepts: [],
      drafts: [
        { id: "named", kind: "diagram", name: "Transport layer", title: "Planner's title", updatedAt: AT(3) },
        { id: "titled", kind: "video", name: null, title: "Planner's title", updatedAt: AT(2) },
        { id: "blank", kind: "diagram", name: "  ", title: null, updatedAt: AT(1) },
      ],
    });
    expect(items.map((r) => [r.key, r.title, r.detail])).toEqual([
      ["draft:named", "Transport layer", "Diagram draft"],
      ["draft:titled", "Planner's title", "Video draft"],
    ]);
  });

  it("searches titles in any case", () => {
    expect(titleMatches("Master Theorem", "  master  theorem")).toBe(true);
    expect(titleMatches("Master theorem", "recurrence")).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* The server read                                                            */
/* -------------------------------------------------------------------------- */

const state = vi.hoisted(() => ({
  recentActivity: vi.fn(),
  readPreferences: vi.fn(),
  recentConcepts: vi.fn(),
  readLearnerSnapshot: vi.fn(),
  recentDrafts: vi.fn(),
  recentTutorSessions: vi.fn(),
  assetsByIds: vi.fn(),
  getCourses: vi.fn(),
  catalogDatabase: vi.fn(),
}));
vi.mock("@self-learn/catalog/state", () => ({
  asLastVisited: (value: unknown) => (value !== null && typeof value === "object" && "courseSlug" in value ? value : undefined),
  asRecentModules: (value: unknown) => (Array.isArray(value) ? value : undefined),
  recentActivity: state.recentActivity,
  readPreferences: state.readPreferences,
  recentConcepts: state.recentConcepts,
  readLearnerSnapshot: state.readLearnerSnapshot,
  recentDrafts: state.recentDrafts,
  recentTutorSessions: state.recentTutorSessions,
  assetsByIds: state.assetsByIds,
}));
vi.mock("@/data/courses", () => ({ getCourses: state.getCourses }));
vi.mock("@/lib/learner-store", () => ({ catalogDatabase: state.catalogDatabase }));
// A signed-in request, so the owner seam (`@/lib/owner`) resolves `local`.
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));

const COURSES = [
  {
    slug: "cs3230",
    code: "CS3230",
    title: "Algorithms",
    order: 1,
    modules: [
      { slug: "m1", title: "Asymptotics", order: 1, topics: [{ id: "cs3230-m1-t1" }] },
      { slug: "m3", title: "Divide and conquer", order: 3, topics: [] },
    ],
  },
  { slug: "cs4225", code: "CS4225", title: "Big data", order: 2, modules: [{ slug: "m1", title: "Map", order: 1, topics: [{ id: "cs4225-m1-t1" }] }] },
];

describe("readRecent", () => {
  beforeEach(() => {
    for (const fn of Object.values(state)) fn.mockReset();
    state.catalogDatabase.mockResolvedValue({});
    state.recentActivity.mockResolvedValue([
      { type: "visit", at: AT(3), course: "cs3230", module: "m3" },
      { type: "observation", at: AT(2), concept: "recurrences" },
    ]);
    state.readPreferences.mockResolvedValue({
      recentModules: [{ courseSlug: "cs3230", moduleSlug: "m1", at: AT(1) }],
      "playback:video:abc": { position: 300, duration: 600, watchedAt: null, updatedAt: AT(4) },
      "playback:video:done": { position: 300, duration: 600, watchedAt: AT(4), updatedAt: AT(4) },
      pinned: [{ key: "concept:recurrences", kind: "concept", title: "Recurrences", href: "/learn/recurrences", at: AT(4) }],
    });
    state.recentConcepts.mockResolvedValue([{ id: "recurrences", title: "Recurrences", pL: 0.5, mastery: "weak", observations: 2 }]);
    state.readLearnerSnapshot.mockResolvedValue({ completed: {}, inactiveCourses: [] });
    state.recentDrafts.mockResolvedValue([{ id: "d1", kind: "diagram", state: "open", name: "My name", title: "Planner title", updatedAt: AT(5) }]);
    state.recentTutorSessions.mockResolvedValue([
      { id: "2026-08-19-react-agents", title: null, goal: null, logAssetId: null, state: "closed", updatedAt: AT(1, 6) },
      { id: "web-x", title: null, goal: "recurrences", logAssetId: null, state: "closed", updatedAt: AT(1, 5) },
      { id: "smoke", title: null, goal: null, logAssetId: null, state: "interrupted", updatedAt: AT(1, 4) },
    ]);
    state.assetsByIds.mockImplementation(async (_db: unknown, ids: string[]) =>
      [
        { id: "video:abc", title: "Master theorem" },
        { id: "video:done", title: "Done video" },
        { id: "session:learn/sessions/2026-08-19-react-agents.md", title: "ReAct agents" },
      ].filter((row) => ids.includes(row.id)),
    );
    state.getCourses.mockResolvedValue(COURSES);
    vi.stubEnv("STUDIO_ENABLED", "1");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("puts the five sources together for the owner, named, with the pins and the courses opened", async () => {
    const { readRecent } = await import("./recent");
    const recent: RecentModel = await readRecent();
    expect(recent.reachable).toBe(true);
    expect(recent.items.map((r) => [r.key, r.title])).toEqual([
      ["draft:d1", "My name"],
      ["video:video:abc", "Master theorem"],
      ["module:cs3230/m3", "Divide and conquer"],
      ["concept:recurrences", "Recurrences"],
      // From the preference, merged with the visit events.
      ["module:cs3230/m1", "Asymptotics"],
      // The log's title, and the log in the Library, for a CLI session; the concept for a web one.
      ["session:2026-08-19-react-agents", "ReAct agents"],
      ["session:web-x", "Recurrences"],
    ]);
    expect(recent.items.find((r) => r.key === "session:2026-08-19-react-agents")?.href).toBe(
      "/library/session%3Alearn%2Fsessions%2F2026-08-19-react-agents.md",
    );
    expect(recent.items.find((r) => r.key === "session:web-x")?.href).toBe("/learn/recurrences");
    expect(recent.pinned.map((p) => p.key)).toEqual(["concept:recurrences"]);
    // One row per course, opening the module visited last in it.
    expect(recent.courses).toEqual([
      {
        slug: "cs3230",
        code: "CS3230",
        title: "Algorithms",
        href: "/courses/cs3230",
        open: "/courses/cs3230/m3",
        resume: { title: "Divide and conquer", order: 3 },
      },
    ]);
    // Every read is the owner's, and bounded by the page: the newest 51
    // concepts and sessions, and the concepts those name, once each.
    for (const fn of [state.readPreferences, state.readLearnerSnapshot]) {
      expect(fn).toHaveBeenCalledWith(expect.anything(), "local");
    }
    expect(state.recentTutorSessions).toHaveBeenCalledWith(expect.anything(), "local", 51);
    expect(state.recentActivity).toHaveBeenCalledWith(expect.anything(), "local", { limit: 51 });
    expect(state.recentConcepts).toHaveBeenCalledWith(expect.anything(), "local", ["recurrences"]);
  });

  it("leaves the conversations to the runner when asked, and reads the next pages on Show older", async () => {
    const { readRecent } = await import("./recent");
    const recent = await readRecent({ withoutDrafts: true, pages: 2 });
    expect(state.recentDrafts).not.toHaveBeenCalled();
    expect(recent.items.some((r) => r.kind === "draft")).toBe(false);
    expect(state.recentTutorSessions).toHaveBeenCalledWith(expect.anything(), "local", 101);
    expect(state.recentActivity).toHaveBeenCalledWith(expect.anything(), "local", { limit: 101 });
  });

  it("searches every row's title, not only the pages shown", async () => {
    const { readRecent } = await import("./recent");
    const recent = await readRecent({ q: "theorem" });
    expect(recent.items.map((r) => r.key)).toEqual(["video:video:abc"]);
    // A search reads every concept answered on, not the newest page of them.
    expect(state.recentActivity).toHaveBeenCalledWith(expect.anything(), "local", {});
  });

  it("finds a renamed conversation by its name without a runner, and leaves conversations to the runner with one", async () => {
    const { readRecent } = await import("./recent");
    expect((await readRecent({ q: "my name" })).items.map((r) => [r.key, r.title])).toEqual([["draft:d1", "My name"]]);
    // The planner's title is under the name, and no longer what the row is called.
    expect((await readRecent({ q: "planner" })).items).toEqual([]);
    state.recentDrafts.mockClear();
    const withRunner = await readRecent({ withoutDrafts: true, q: "my name" });
    expect(state.recentDrafts).not.toHaveBeenCalled();
    expect(withRunner.items).toEqual([]);
  });

  it("falls back to the courses with a tick when none was opened, leaving a course set aside out", async () => {
    state.recentActivity.mockResolvedValue([]);
    state.readPreferences.mockResolvedValue({});
    state.readLearnerSnapshot.mockResolvedValue({ completed: { "cs3230-m1-t1": true, "cs4225-m1-t1": true }, inactiveCourses: ["cs4225"] });
    const { readRecent } = await import("./recent");
    const { courses } = await readRecent();
    expect(courses.map((c) => c.slug)).toEqual(["cs3230"]);
    // With no module visited, the row opens the course page and names no module.
    expect(courses[0]).toMatchObject({ open: "/courses/cs3230", resume: null });
  });

  it("opens a course at the newest visit whose module still exists", async () => {
    state.recentActivity.mockResolvedValue([
      { type: "visit", at: AT(5), course: "cs3230", module: "gone" },
      { type: "visit", at: AT(4), course: "cs3230" },
      { type: "visit", at: AT(3), course: "cs3230", module: "m1" },
    ]);
    state.readPreferences.mockResolvedValue({});
    const { readRecent } = await import("./recent");
    expect((await readRecent()).courses[0]).toMatchObject({ open: "/courses/cs3230/m1", resume: { title: "Asymptotics", order: 1 } });
  });

  it("loses only the rows a failed read held, and is the empty answer when the database cannot be reached", async () => {
    state.recentTutorSessions.mockRejectedValue(new Error('relation "session" does not exist'));
    state.getCourses.mockRejectedValue(new Error("not flipped"));
    const { readRecent } = await import("./recent");
    const partial = await readRecent();
    expect(partial.reachable).toBe(true);
    expect(partial.items.some((r) => r.kind === "session" || r.kind === "module")).toBe(false);
    expect(partial.items.some((r) => r.kind === "video")).toBe(true);

    state.recentConcepts.mockRejectedValue(new Error("connect ECONNREFUSED"));
    expect((await readRecent()).reachable).toBe(false);

    state.catalogDatabase.mockRejectedValue(new Error("connect ECONNREFUSED"));
    expect(await readRecent()).toEqual({ reachable: false, items: [], more: false, pinned: [], courses: [] });
  });
});

describe("conceptsNamed", () => {
  it("names each concept answered on and each session's goal once, and nothing else", async () => {
    const { conceptsNamed } = await import("./recent");
    const session = (goal: string | null) => ({ id: "s", title: null, goal, logAssetId: null, state: "closed", updatedAt: AT(1) });
    expect(
      conceptsNamed(
        [
          { type: "observation", at: AT(1), concept: "a" },
          { type: "visit", at: AT(1), course: "cs3230" },
          { type: "observation", at: AT(2), concept: "" },
          { type: "observation", at: AT(2), concept: "b" },
        ],
        [session("b"), session("c"), session(null), session("")],
      ),
    ).toEqual(["a", "b", "c"]);
  });
});
