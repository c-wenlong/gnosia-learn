import { describe, expect, it } from "vitest";
import { PREFERENCE_KEYS } from "@gnosia/schema/shared";

import { recentCourseSlugs } from "@/lib/recent-courses";

/** Written before `recent-courses.ts`: the courses G5's ready highlight reads (docs/proposals/knowledge-map.md). */
describe("recentCourseSlugs", () => {
  it("lists the courses of the recent module visits, newest first, each once", () => {
    const prefs = {
      [PREFERENCE_KEYS.recentModules]: [
        { courseSlug: "cs3230", moduleSlug: "m2", at: "2026-10-04T05:00:00Z" },
        { courseSlug: "cp4284", moduleSlug: "m1", at: "2026-10-03T05:00:00Z" },
        { courseSlug: "cs3230", moduleSlug: "m1", at: "2026-10-02T05:00:00Z" },
      ],
    };
    expect(recentCourseSlugs(prefs)).toEqual(["cs3230", "cp4284"]);
  });

  it("falls back to the one visit lastVisited holds for an owner with no list yet", () => {
    expect(recentCourseSlugs({ [PREFERENCE_KEYS.lastVisited]: { courseSlug: "cs4223", at: "2026-10-01T00:00:00Z" } })).toEqual([
      "cs4223",
    ]);
  });

  it("is empty with neither, or with a value that is not a visit", () => {
    expect(recentCourseSlugs({})).toEqual([]);
    expect(recentCourseSlugs({ [PREFERENCE_KEYS.recentModules]: "nonsense" })).toEqual([]);
  });
});
