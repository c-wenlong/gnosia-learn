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

vi.mock("@/data/courses", () => ({ getCourses }));
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
  readEvents: vi.fn(async () => []),
  readKnowledgeBase: vi.fn(async () => ({ concepts: [], frontier: [] })),
  readLearnerSnapshot,
  readPreferences: vi.fn(async () => ({})),
  recentDrafts: vi.fn(async () => []),
}));

describe("readHome", () => {
  beforeEach(() => {
    getCourses.mockReset();
    catalogDatabase.mockReset();
    catalogDatabase.mockResolvedValue({});
    readLearnerSnapshot.mockReset();
    readLearnerSnapshot.mockResolvedValue({ completed: {}, inactiveCourses: [] });
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
});
