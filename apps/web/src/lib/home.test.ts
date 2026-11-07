import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * How `readHome` degrades. An unreachable database is the empty page
 * with `reachable: false`, which the shell's banner explains. Courses that are
 * not flipped are not an outage: the database answered, so no banner shows,
 * and an empty page would read as a learner with no courses. That one is
 * rethrown for the page's error boundary.
 */
const getCourses = vi.hoisted(() => vi.fn());
const getTopics = vi.hoisted(() => vi.fn());
const catalogDatabase = vi.hoisted(() => vi.fn());
const readLearnerSnapshot = vi.hoisted(() => vi.fn());
const recentDrafts = vi.hoisted(() => vi.fn());

vi.mock("@/data/courses", () => ({ getCourses }));
vi.mock("@/data/topics", () => ({ getTopics }));
vi.mock("@/lib/learner-store", () => ({ catalogDatabase }));
// A signed-in request, so the owner seam (`@/lib/owner`) resolves `local`.
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));
vi.mock("@gnosia/catalog/state", () => ({
  asLastVisited: vi.fn(() => undefined),
  asRecentModules: vi.fn(() => undefined),
  assetsByIds: vi.fn(async () => []),
  dueReviews: vi.fn(async () => []),
  recentActivity: vi.fn(async () => []),
  readKnowledgeBase: vi.fn(async () => ({ concepts: [], frontier: [] })),
  readLearnerSnapshot,
  readPreferences: vi.fn(async () => ({})),
  recentDrafts,
  recentTutorSessions: vi.fn(async () => []),
}));

/** A `KbConcept` row, loose as the mock is: the fields `readHome` reads, with the ones a case cares about overridden. */
const concept = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: id,
  summary: "",
  requires: [] as string[],
  assumes: [] as string[],
  pL: 0.2,
  mastery: "gap",
  observations: 0,
  correct: 0,
  lastSeen: null,
  due: null,
  lapses: 0,
  leech: false,
  topics: [] as string[],
  positions: {} as Record<string, number>,
  domain: null,
  topic: null,
  ...extra,
});

describe("readHome", () => {
  beforeEach(() => {
    getCourses.mockReset();
    getTopics.mockReset();
    getTopics.mockResolvedValue([]);
    catalogDatabase.mockReset();
    catalogDatabase.mockResolvedValue({});
    readLearnerSnapshot.mockReset();
    readLearnerSnapshot.mockResolvedValue({ completed: {}, inactiveCourses: [] });
    recentDrafts.mockReset();
    recentDrafts.mockResolvedValue([]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    // `vi.stubEnv` outlives the test it ran in until this runs, so a failed
    // assertion cannot leak `STUDIO_ENABLED` into the tests after it.
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rethrows courses that are not flipped, for the error boundary", async () => {
    const { ContentUnavailableError } = await import("@/data/source");
    const refused = new ContentUnavailableError("not-flipped", "courses", "run `npm run catalog -- flip courses`");
    getCourses.mockRejectedValueOnce(refused);
    const { readHome } = await import("./home");
    await expect(readHome()).rejects.toBe(refused);
  });

  it("is the empty page when the database cannot be read", async () => {
    const { ContentUnavailableError } = await import("@/data/source");
    getCourses.mockRejectedValueOnce(new ContentUnavailableError("unreachable", null, "connect ECONNREFUSED"));
    const { readHome } = await import("./home");
    const home = await readHome();
    expect(home.reachable).toBe(false);
    expect(home.courses.total).toBe(0);
    expect(home.threads).toEqual([]);
  });

  it("leaves a course set aside off the courses card, however far along", async () => {
    const course = (slug: string, order: number) => ({
      slug,
      code: slug.toUpperCase(),
      title: slug,
      order,
      modules: [{ topics: [{ id: `${slug}-m1-t1` }, { id: `${slug}-m1-t2` }] }],
    });
    getCourses.mockResolvedValueOnce([course("cs3230", 1), course("cs2111", 2)]);
    // CS2111 is further along, and would come first if it were active.
    readLearnerSnapshot.mockResolvedValueOnce({
      completed: { "cs3230-m1-t1": true, "cs2111-m1-t1": true, "cs2111-m1-t2": true },
      inactiveCourses: ["cs2111"],
    });
    const { readHome } = await import("./home");
    const home = await readHome();
    expect(home.reachable).toBe(true);
    expect(home.courses.rows.map((r) => r.slug)).toEqual(["cs3230"]);
    expect(home.courses.total).toBe(1);
  });

  it("lists a course opened with no topic done on the courses card, as the sidebar lists it", async () => {
    const state = await import("@gnosia/catalog/state");
    vi.mocked(state.recentActivity).mockResolvedValueOnce([
      { type: "visit", course: "cs3230", module: "m1", at: new Date().toISOString() },
    ] as never);
    getCourses.mockResolvedValueOnce([
      { slug: "cs3230", code: "CS3230", title: "Algorithms", order: 1, modules: [{ slug: "m1", title: "One", order: 1, topics: [{ id: "t1" }] }] },
      { slug: "cs2111", code: "CS2111", title: "Other", order: 2, modules: [{ slug: "m1", title: "One", order: 1, topics: [{ id: "t2" }] }] },
    ]);
    const { readHome } = await import("./home");
    const home = await readHome();
    expect(home.courses.rows.map((r) => [r.slug, r.completed, r.total])).toEqual([["cs3230", 0, 1]]);
  });

  it("loses only the draft threads when the studio's drafts cannot be read", async () => {
    vi.stubEnv("STUDIO_ENABLED", "1");
    getCourses.mockResolvedValueOnce([]);
    recentDrafts.mockRejectedValueOnce(new Error('relation "draft" does not exist'));
    const { readHome } = await import("./home");
    const home = await readHome();
    expect(recentDrafts).toHaveBeenCalled();
    expect(home.reachable).toBe(true);
    expect(home.threads).toEqual([]);
  });

  it("reads the event log folded per module and concept, bounded by the threads it lists", async () => {
    getCourses.mockResolvedValueOnce([]);
    const state = await import("@gnosia/catalog/state");
    const { readHome } = await import("./home");
    await readHome();
    expect(state.recentActivity).toHaveBeenCalledWith(expect.anything(), "local", { limit: 5 });
  });

  it("is the empty page when the database itself cannot be opened", async () => {
    catalogDatabase.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    const { readHome } = await import("./home");
    const home = await readHome();
    expect(home.reachable).toBe(false);
    expect(home.threads).toEqual([]);
    expect(home.courses.total).toBe(0);
  });

  it("loses only the session rows when the tutor sessions cannot be read", async () => {
    const state = await import("@gnosia/catalog/state");
    getCourses.mockResolvedValueOnce([]);
    vi.mocked(state.recentTutorSessions).mockRejectedValueOnce(new Error('relation "tutor_session" does not exist'));
    const { readHome } = await import("./home");
    const home = await readHome();
    expect(home.reachable).toBe(true);
    expect(home.threads).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("tutor sessions unavailable"));
  });

  it("reads the frontier's first concept as Next up, with where it sits on the path", async () => {
    const state = await import("@gnosia/catalog/state");
    // CS3230 is set aside: nothing opens "Next from here", but `placeOf` still
    // reads the full course list, so the pick's eyebrow names its module.
    getCourses.mockResolvedValueOnce([
      {
        slug: "cs3230",
        code: "CS3230",
        title: "Algorithms",
        order: 1,
        modules: [
          {
            id: "cs3230-m1",
            slug: "m1",
            title: "One",
            order: 1,
            topic: "algorithms",
            topics: [{ id: "cs3230-m1-t1", title: "Topic one" }],
          },
        ],
      },
    ]);
    readLearnerSnapshot.mockResolvedValueOnce({ completed: {}, inactiveCourses: ["cs3230"] });
    vi.mocked(state.readKnowledgeBase).mockResolvedValueOnce({
      concepts: [concept("c-graph", { title: "Graph cuts", topics: ["cs3230-m1-t1"] })],
      frontier: ["c-graph"],
    } as never);
    const { readHome } = await import("./home");
    const home = await readHome();
    expect(home.next).toEqual([]);
    expect(home.nextUp).toMatchObject({
      id: "c-graph",
      title: "Graph cuts",
      eyebrow: "Next on your path · CS3230 · Module 1",
      eyebrowShort: "Next up · CS3230 M1",
    });
  });

  it("names the note's domain when the next concept sits on no curriculum item", async () => {
    const state = await import("@gnosia/catalog/state");
    getCourses.mockResolvedValueOnce([]);
    vi.mocked(state.readKnowledgeBase).mockResolvedValueOnce({
      concepts: [concept("c-free", { title: "Free note", domain: "probability" })],
      frontier: ["c-free"],
    } as never);
    const { readHome } = await import("./home");
    const home = await readHome();
    expect(home.nextUp).toMatchObject({ id: "c-free", eyebrow: "Next on your path · probability" });
  });

  it("walks a visited module's next topic by the topic vocabulary's authored order", async () => {
    const state = await import("@gnosia/catalog/state");
    vi.mocked(state.recentActivity).mockResolvedValueOnce([
      { type: "visit", course: "cs3230", module: "m1", at: new Date().toISOString() },
    ] as never);
    getCourses.mockResolvedValueOnce([
      {
        slug: "cs3230",
        code: "CS3230",
        title: "Algorithms",
        order: 1,
        modules: [
          {
            id: "cs3230-m1",
            slug: "m1",
            title: "One",
            order: 1,
            topic: "algorithms",
            topics: [{ id: "cs3230-m1-t1", title: "Topic one" }],
          },
        ],
      },
    ]);
    // Both concepts are level (same p(L), no note positions): the authored
    // order in `maps.concepts` is the only thing that puts Zulu first. A read
    // that ignored the vocabulary would fall to the title sort and open Alpha.
    getTopics.mockResolvedValueOnce([{ slug: "algorithms", maps: { concepts: ["c-zulu", "c-alpha"] } }]);
    vi.mocked(state.readKnowledgeBase).mockResolvedValueOnce({
      concepts: [
        concept("c-alpha", { title: "Alpha", topics: ["cs3230-m1-t1"] }),
        concept("c-zulu", { title: "Zulu", topics: ["cs3230-m1-t1"] }),
      ],
      frontier: [],
    } as never);
    const { readHome } = await import("./home");
    const home = await readHome();
    expect(home.nextUp).toBeNull();
    expect(home.next).toEqual([
      {
        key: "module:cs3230/m1",
        heading: "After One",
        steps: [
          expect.objectContaining({
            key: "topic:cs3230-m1-t1",
            title: "Topic one",
            detail: "CS3230 · Module 1",
            href: "/learn/c-zulu/session",
          }),
        ],
      },
    ]);
  });

  it("opens the frontier concepts a concept thread unlocks, so Next up stands down", async () => {
    const state = await import("@gnosia/catalog/state");
    vi.mocked(state.recentActivity).mockResolvedValueOnce([
      { type: "observation", concept: "c-seen", at: new Date().toISOString() },
    ] as never);
    getCourses.mockResolvedValueOnce([]);
    vi.mocked(state.readKnowledgeBase).mockResolvedValueOnce({
      concepts: [
        concept("c-seen", { title: "Seen", observations: 3 }),
        concept("c-next", { title: "Unlocked", requires: ["c-seen"] }),
      ],
      frontier: ["c-next"],
    } as never);
    const { readHome } = await import("./home");
    const home = await readHome();
    expect(home.nextUp).toBeNull();
    expect(home.next).toEqual([
      {
        key: "concept:c-seen",
        heading: "After Seen",
        steps: [expect.objectContaining({ key: "concept:c-next", title: "Unlocked", href: "/learn/c-next" })],
      },
    ]);
  });
});
