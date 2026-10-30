import { describe, expect, it } from "vitest";

import { bucketOf, masteryCaption } from "../src/mastery-bucket";

describe("bucketOf", () => {
  it("keeps mastered as mastered, observed or not", () => {
    expect(bucketOf({ mastery: "mastered", observations: 9 })).toBe("mastered");
    expect(bucketOf({ mastery: "mastered", observations: 0 })).toBe("mastered");
    expect(bucketOf({ mastery: "mastered" })).toBe("mastered");
  });

  it("calls a concept with no observations untouched, whatever its label", () => {
    expect(bucketOf({ mastery: "gap", observations: 0 })).toBe("untouched");
    expect(bucketOf({ mastery: "solid", observations: 0 })).toBe("untouched");
    expect(bucketOf({ mastery: "weak" })).toBe("untouched");
  });

  it("puts every other observed label in learning", () => {
    for (const mastery of ["solid", "shaky", "weak", "gap"] as const) {
      expect(bucketOf({ mastery, observations: 1 })).toBe("learning");
    }
  });
});

describe("masteryCaption", () => {
  it("adds p(L) to two places", () => {
    expect(masteryCaption("learning", 0.4213)).toBe("Learning · p(L) 0.42");
  });

  it("leaves the number off an untouched concept and a missing one", () => {
    expect(masteryCaption("untouched", 0.25)).toBe("Not started");
    expect(masteryCaption("mastered")).toBe("Mastered");
    expect(masteryCaption("learning", Number.NaN)).toBe("Learning");
  });
});
