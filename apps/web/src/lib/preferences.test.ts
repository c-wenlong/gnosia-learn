import { describe, expect, it } from "vitest";

import {
  DEFAULT_MOTION_MODE,
  DEFAULT_TUTOR_STYLE,
  describeLeeway,
  describeTarget,
  InvalidPreference,
  leewayChoices,
  parseMotionMode,
  parseTutorStyle,
  targetChoices,
  targetKey,
  validateDailyTarget,
  validateLeeway,
  validateMotionMode,
  validateTutorStyle,
} from "@/lib/preferences";

describe("the preference validators", () => {
  it("accepts a daily target in range and returns exactly its two fields", () => {
    expect(validateDailyTarget({ concepts: 2, reviews: false, extra: "dropped" })).toEqual({
      concepts: 2,
      reviews: false,
    });
    expect(validateDailyTarget({ concepts: 0, reviews: true })).toEqual({ concepts: 0, reviews: true });
  });

  it.each([
    [null],
    [[1, true]],
    [{ concepts: 21, reviews: true }],
    [{ concepts: -1, reviews: true }],
    [{ concepts: 1.5, reviews: true }],
    [{ concepts: "1", reviews: true }],
    [{ concepts: 1 }],
    [{ concepts: 1, reviews: "yes" }],
  ])("refuses the daily target %j", (value) => {
    expect(() => validateDailyTarget(value)).toThrow(InvalidPreference);
  });

  it("accepts a leeway of 0 to 7 and nothing else", () => {
    expect(validateLeeway(0)).toBe(0);
    expect(validateLeeway(7)).toBe(7);
    for (const bad of [8, -1, 1.5, "2", null]) {
      expect(() => validateLeeway(bad)).toThrow(InvalidPreference);
    }
  });

  it("accepts only the listed tutor styles and motion modes", () => {
    expect(validateTutorStyle("socratic")).toBe("socratic");
    expect(() => validateTutorStyle("chatty")).toThrow(/guide-concise/);
    expect(validateMotionMode("always")).toBe("always");
    expect(() => validateMotionMode("never")).toThrow(InvalidPreference);
    // Not an own key of anything: the vocabulary is a list, not an object.
    expect(() => validateTutorStyle("constructor")).toThrow(InvalidPreference);
  });

  it("reads a missing or unknown stored value as the default", () => {
    expect(parseTutorStyle(undefined)).toBe(DEFAULT_TUTOR_STYLE);
    expect(parseTutorStyle("direct")).toBe("direct");
    expect(parseMotionMode(42)).toBe(DEFAULT_MOTION_MODE);
  });
});

describe("the words Settings and Today print", () => {
  it("describes a target the way the hi-fi does", () => {
    expect(describeTarget({ concepts: 1, reviews: true })).toBe("One concept + due reviews");
    expect(describeTarget({ concepts: 2, reviews: false })).toBe("Two concepts");
    expect(describeTarget({ concepts: 0, reviews: true })).toBe("Due reviews only");
    expect(describeTarget({ concepts: 0, reviews: false })).toBe("No target");
    expect(describeTarget({ concepts: 12, reviews: false })).toBe("12 concepts");
  });

  it("describes the leeway", () => {
    expect(describeLeeway(0)).toBe("No free misses");
    expect(describeLeeway(1)).toBe("1 free miss per week");
    expect(describeLeeway(3)).toBe("3 free misses per week");
    expect(leewayChoices()).toHaveLength(8);
  });

  it("offers every target once, and always the stored one", () => {
    const choices = targetChoices({ concepts: 1, reviews: true });
    expect(new Set(choices.map((c) => c.value)).size).toBe(choices.length);
    expect(choices.map((c) => c.value)).toContain("1+r");

    const odd = targetChoices({ concepts: 9, reviews: false });
    expect(odd.find((c) => c.value === targetKey({ concepts: 9, reviews: false }))?.label).toBe("Nine concepts");
  });
});
