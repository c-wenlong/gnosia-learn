import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * How `readToday` degrades. An unreachable database is the empty dashboard
 * with `reachable: false`, which the shell's banner explains. Courses that are
 * not flipped are not an outage: the database answered, so no banner shows,
 * and an empty dashboard would read as a learner with no courses. That one is
 * rethrown for the page's error boundary.
 */
const getCourses = vi.hoisted(() => vi.fn());
const catalogDatabase = vi.hoisted(() => vi.fn());

vi.mock("@/data/courses", () => ({ getCourses }));
vi.mock("@/lib/learner-store", () => ({ catalogDatabase }));
// A signed-in request, so the owner seam (`@/lib/owner`) resolves `local`.
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));
vi.mock("@self-learn/catalog/state", () => ({
  assetsByIds: vi.fn(async () => ({})),
  dueReviews: vi.fn(async () => []),
  readEvents: vi.fn(async () => []),
  readKnowledgeBase: vi.fn(async () => ({ concepts: [], frontier: [] })),
  readLearnerSnapshot: vi.fn(async () => ({ completed: [] })),
  readPreferences: vi.fn(async () => ({})),
}));

describe("readToday", () => {
  beforeEach(() => {
    getCourses.mockReset();
    catalogDatabase.mockReset();
    catalogDatabase.mockResolvedValue({});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("rethrows courses that are not flipped, for the error boundary", async () => {
    const { ContentUnavailableError } = await import("@/data/source");
    const refused = new ContentUnavailableError("not-flipped", "courses", "run `npm run catalog -- flip courses`");
    getCourses.mockRejectedValueOnce(refused);
    const { readToday } = await import("./today");
    await expect(readToday()).rejects.toBe(refused);
  });

  it("is the empty dashboard when the database cannot be read", async () => {
    const { ContentUnavailableError } = await import("@/data/source");
    getCourses.mockRejectedValueOnce(new ContentUnavailableError("unreachable", null, "connect ECONNREFUSED"));
    const { readToday } = await import("./today");
    const today = await readToday();
    expect(today.reachable).toBe(false);
    expect(today.courses.total).toBe(0);
  });
});
