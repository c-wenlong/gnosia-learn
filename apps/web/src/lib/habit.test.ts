import { beforeAll, describe, expect, it, vi } from "vitest";

// A signed-in request, so the owner seam (`@/lib/owner`) resolves `local`.
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));

/**
 * The top bar reads the habit numbers on every page, so a database that is
 * down must cost the numbers and not the page. As in `learner-store.test.ts`,
 * `DATABASE_URL` points at a port nothing listens on before the pool opens.
 */
describe("the habit read with no database", () => {
  let habit: typeof import("@/lib/habit");

  beforeAll(async () => {
    process.env.DATABASE_URL = "postgres://localhost:59999/nothing";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    habit = await import("@/lib/habit");
  });

  it("returns zeros and says it could not ask", async () => {
    const result = await habit.readHabit(new Date("2026-09-26T12:00:00Z"));
    expect(result.reachable).toBe(false);
    expect(result.streak.days).toBe(0);
    expect(result.target).toMatchObject({ done: 0, total: 2, reviewsCleared: false });
  });
});

describe("habitTimeZone", () => {
  it("takes a valid IANA zone and ignores anything else", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { habitTimeZone } = await import("@/lib/habit");
    expect(habitTimeZone({ HABIT_TIME_ZONE: "Asia/Singapore" })).toBe("Asia/Singapore");
    expect(habitTimeZone({ HABIT_TIME_ZONE: "  " })).toBeUndefined();
    expect(habitTimeZone({ HABIT_TIME_ZONE: "Not/AZone" })).toBeUndefined();
    expect(habitTimeZone({})).toBeUndefined();
  });
});
