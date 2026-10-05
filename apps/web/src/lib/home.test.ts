import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * How `readHome` degrades. An unreachable database is the empty page
 * with `reachable: false`, which the shell's banner explains. Courses that are
 * not flipped are not an outage: the database answered, so no banner shows,
 * and an empty page would read as a learner with no courses. That one is
 * rethrown for the page's error boundary.
 */
const getCourses = vi.hoisted(() => vi.fn());
const catalogDatabase = vi.hoisted(() => vi.fn());
const readLearnerSnapshot = vi.hoisted(() => vi.fn());
const recentDrafts = vi.hoisted(() => vi.fn());

vi.mock("@/data/courses", () => ({ getCourses }));
vi.mock("@/data/topics", () => ({ getTopics: async () => [] }));
vi.mock("@/lib/learner-store", () => ({ catalogDatabase }));
// A signed-in request, so the owner seam (`@/lib/owner`) resolves `local`.
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));
vi.mock("@self-learn/catalog/state", () => ({
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

describe("readHome", () => {
  beforeEach(() => {
    getCourses.mockReset();
    catalogDatabase.mockReset();
    catalogDatabase.mockResolvedValue({});
    readLearnerSnapshot.mockReset();
    readLearnerSnapshot.mockResolvedValue({ completed: {}, inactiveCourses: [] });
    recentDrafts.mockReset();
    recentDrafts.mockResolvedValue([]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
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
    const state = await import("@self-learn/catalog/state");
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
    vi.unstubAllEnvs();
  });

  it("reads the event log folded per module and concept, bounded by the threads it lists", async () => {
    getCourses.mockResolvedValueOnce([]);
    const state = await import("@self-learn/catalog/state");
    const { readHome } = await import("./home");
    await readHome();
    expect(state.recentActivity).toHaveBeenCalledWith(expect.anything(), "local", { limit: 5 });
  });
});
