import { describe, expect, it } from "vitest";

import { dayKey } from "../src/days";

describe("dayKey", () => {
  it("reads an instant in the zone it is given", () => {
    // 20:00 UTC on the 25th is already the 26th in Singapore.
    expect(dayKey("2026-09-25T20:00:00Z", "UTC")).toBe("2026-09-25");
    expect(dayKey("2026-09-25T20:00:00Z", "Asia/Singapore")).toBe("2026-09-26");
  });

  it("takes a Date as well as a string", () => {
    expect(dayKey(new Date("2026-12-31T23:59:59Z"), "UTC")).toBe("2026-12-31");
  });
});
