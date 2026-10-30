import { describe, expect, it, vi } from "vitest";

describe("appTimeZone", () => {
  it("takes a valid IANA zone and ignores anything else", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { appTimeZone } = await import("../src/server/time-zone");
    expect(appTimeZone({ HABIT_TIME_ZONE: "Asia/Singapore" })).toBe("Asia/Singapore");
    expect(appTimeZone({ HABIT_TIME_ZONE: "  " })).toBeUndefined();
    expect(appTimeZone({ HABIT_TIME_ZONE: "Not/AZone" })).toBeUndefined();
    expect(appTimeZone({})).toBeUndefined();
  });
});
