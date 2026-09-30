import { describe, expect, it } from "vitest";

import { replayOf } from "../src/drafts";

/**
 * What a fresh planner session is handed when the stored one cannot be
 * resumed (C3). A chat message has no length cap, so the replay keeps whole
 * messages rather than a character tail that could start mid-message.
 */

describe("replayOf", () => {
  it("keeps every entry when they fit", () => {
    expect(replayOf(["person: a", "planner: b"], 100)).toBe("person: a\n\nplanner: b");
  });

  it("drops the oldest whole entries, never part of one, and says how many", () => {
    const entries = ["person: " + "x".repeat(50), "planner: ok", "person: " + "y".repeat(50)];
    const text = replayOf(entries, 80);
    expect(text).toBe(`(1 earlier entry left out for length)\n\nplanner: ok\n\nperson: ${"y".repeat(50)}`);
  });

  it("keeps the newest entry whole however long it is", () => {
    const long = "person: " + "z".repeat(500);
    expect(replayOf(["person: hi", "planner: hello", long], 100)).toBe(`(2 earlier entries left out for length)\n\n${long}`);
  });
});
