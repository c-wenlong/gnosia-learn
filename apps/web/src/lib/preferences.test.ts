import { describe, expect, it } from "vitest";

import {
  DEFAULT_MOTION_MODE,
  DEFAULT_TUTOR_STYLE,
  InvalidPreference,
  parseMotionMode,
  parseTutorStyle,
  validateMotionMode,
  validateTutorStyle,
} from "@/lib/preferences";

describe("the preference validators", () => {
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
