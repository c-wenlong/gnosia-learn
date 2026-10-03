import { describe, expect, it } from "vitest";

import type { Course, TagMeta } from "@/lib/types";

import {
  activeOnly,
  ALL_COURSES,
  continueLearning,
  courseStatus,
  coverLine,
  coverUrl,
  coverVersion,
  filterCourses,
  isInProgress,
  partnerLine,
  splitByActive,
  toCourseSummary,
  usedTags,
} from "./course-summary";

const TAGS: TagMeta[] = [
  { id: "hci", label: "HCI", description: "" },
  { id: "graphics", label: "Graphics", description: "" },
  { id: "unused", label: "Unused", description: "" },
];

function course(slug: string, code: string, title: string, tags: string[], topics: string[][]): Course {
  return {
    id: slug,
    slug,
    code,
    title,
    credits: 4,
    order: 1,
    inferred: false,
    tags,
    capstone: "",
    // Each module's `order` field disagrees with its place in the list, to
    // check the summary follows the list, as the course page does.
    modules: topics
      .map((names, i) => ({
        id: `${slug}-m${i + 1}`,
        slug: `m${i + 1}`,
        title: `Module ${i + 1}`,
        order: topics.length - i,
        topic: "",
        resources: [],
        topics: names.map((name, j) => ({ id: `${slug}-m${i + 1}-t${j + 1}`, title: name, subtopics: [] })),
      })),
  } as unknown as Course;
}

const SHA = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

const graphics = toCourseSummary(
  course("cp4281", "CP4281", "Computer Graphics", ["graphics"], [["Vectors", "Dot product"], ["Barycentric"]]),
  [TAGS[1]],
  SHA,
);
const hci = toCourseSummary(course("cs2111", "CS2111", "Interaction Design", ["hci"], [["Personas"]]), [TAGS[0]]);

describe("toCourseSummary", () => {
  it("keeps the course's module order and counts", () => {
    expect(graphics.moduleCount).toBe(2);
    expect(graphics.topics.map((t) => t.title)).toEqual(["Vectors", "Dot product", "Barycentric"]);
    expect(graphics.topics.map((t) => `${t.moduleSlug} ${t.moduleTitle}`)).toEqual([
      "m1 Module 1",
      "m1 Module 1",
      "m2 Module 2",
    ]);
    expect(graphics.tags).toEqual([{ id: "graphics", label: "Graphics" }]);
  });

  it("points a course with a stored cover at the cover route, versioned by the image's hash", () => {
    expect(graphics.cover).toBe(`/api/courses/cp4281/cover?v=${SHA.slice(0, 16)}`);
    expect(coverVersion(SHA)).toBe("9f86d081884c7d65");
    // A course with no cover in the blob store falls back to the placeholder.
    expect(toCourseSummary(course("zz0000", "ZZ0000", "No cover", [], [["A"]]), []).cover).toBeNull();
    expect(toCourseSummary(course("zz0000", "ZZ0000", "No cover", [], [["A"]]), [], null).cover).toBeNull();
  });

  it("encodes the slug, so the URL names one path segment", () => {
    expect(coverUrl("a/b c", SHA)).toBe(`/api/courses/a%2Fb%20c/cover?v=${SHA.slice(0, 16)}`);
  });
});

describe("courseStatus", () => {
  it("says not started with nothing done", () => {
    expect(courseStatus(graphics, {})).toMatchObject({ percent: 0, label: "Not started" });
  });

  it("names the first undone topic in course order", () => {
    const status = courseStatus(graphics, { "cp4281-m1-t1": true, "cp4281-m2-t1": true });
    expect(status).toMatchObject({ completed: 2, total: 3, percent: 67, label: "Next: Dot product" });
  });

  it("says completed when every topic is done", () => {
    expect(courseStatus(hci, { "cs2111-m1-t1": true })).toMatchObject({ percent: 100, next: null, label: "Completed" });
  });

  it("counts a mastered topic without a tick, and not a ticked one whose concepts are unmastered", () => {
    const standing = { mastered: ["cp4281-m1-t1"], withConcepts: ["cp4281-m1-t1", "cp4281-m1-t2"] };
    // t1 mastered and unticked; t2 ticked but its concepts are not mastered;
    // the module-2 topic has no concepts, so its tick counts.
    const status = courseStatus(graphics, { "cp4281-m1-t2": true, "cp4281-m2-t1": true }, standing);
    expect(status).toMatchObject({ completed: 2, total: 3, percent: 67, label: "Next: Dot product" });
  });
});

describe("filterCourses", () => {
  const all = [graphics, hci];

  it("matches every word against code, title and tag labels", () => {
    expect(filterCourses(all, "cp4281", ALL_COURSES)).toEqual([graphics]);
    expect(filterCourses(all, "  interaction   hci ", ALL_COURSES)).toEqual([hci]);
    expect(filterCourses(all, "graphics hci", ALL_COURSES)).toEqual([]);
  });

  it("filters by tag, and combines the tag with the search", () => {
    expect(filterCourses(all, "", { tag: "hci" })).toEqual([hci]);
    expect(filterCourses(all, "computer", { tag: "graphics" })).toEqual([graphics]);
    expect(filterCourses(all, "computer", { tag: "hci" })).toEqual([]);
  });
});

describe("isInProgress", () => {
  it("reads in-progress from mastery when a standing is given", () => {
    // Nothing ticked: only mastery can start a course. CS2111 is complete by
    // mastery, so it is not in progress; CP4281 has one of three done.
    const standing = { mastered: ["cs2111-m1-t1", "cp4281-m1-t1"], withConcepts: ["cs2111-m1-t1", "cp4281-m1-t1"] };
    expect(isInProgress(hci, {}, standing)).toBe(false);
    expect(isInProgress(graphics, {}, standing)).toBe(true);
    expect(isInProgress(graphics, {})).toBe(false);
  });
});

describe("continueLearning", () => {
  const shaders = toCourseSummary(
    course("cp4282", "CP4282", "Shaders", ["graphics"], [["A", "B", "C", "D"]]),
    [TAGS[1]],
  );
  const all = [graphics, hci, shaders];
  // CP4281 one of three (33%), CP4282 three of four (75%), CS2111 complete.
  const done = {
    "cp4281-m1-t1": true as const,
    "cp4282-m1-t1": true as const,
    "cp4282-m1-t2": true as const,
    "cp4282-m1-t3": true as const,
    "cs2111-m1-t1": true as const,
  };

  it("lists the started, unfinished courses, furthest along first", () => {
    expect(continueLearning(all, done).map((e) => e.summary.slug)).toEqual(["cp4282", "cp4281"]);
  });

  it("puts the course last visited first", () => {
    expect(continueLearning(all, done, undefined, "cp4281").map((e) => e.summary.slug)).toEqual(["cp4281", "cp4282"]);
  });

  it("ignores a last-visited course that is not under way", () => {
    expect(continueLearning(all, done, undefined, "cs2111").map((e) => e.summary.slug)).toEqual(["cp4282", "cp4281"]);
    expect(continueLearning(all, {}, undefined, "cp4281")).toEqual([]);
  });

  it("keeps the given order between courses equally far along", () => {
    const twin = toCourseSummary(course("cp4283", "CP4283", "Twin", [], [["X", "Y", "Z"]]), []);
    const both = { "cp4281-m1-t1": true as const, "cp4283-m1-t1": true as const };
    expect(continueLearning([twin, graphics], both).map((e) => e.summary.slug)).toEqual(["cp4283", "cp4281"]);
  });

  it("leaves out a course set aside, however far along", () => {
    expect(continueLearning(all, done, undefined, "cp4281", ["cp4281"]).map((e) => e.summary.slug)).toEqual([
      "cp4282",
    ]);
  });

  it("carries the next topic and its module", () => {
    const [entry] = continueLearning([graphics], { "cp4281-m1-t1": true, "cp4281-m1-t2": true });
    expect(entry.status.next).toMatchObject({ title: "Barycentric", moduleSlug: "m2", moduleTitle: "Module 2" });
  });
});

describe("activeOnly and splitByActive", () => {
  const courses = [{ slug: "a" }, { slug: "b" }, { slug: "c" }];

  it("keeps every course when none is set aside", () => {
    expect(activeOnly(courses, [])).toEqual(courses);
    expect(splitByActive(courses, [])).toEqual({ active: courses, inactive: [] });
  });

  it("splits in the order given, ignoring a slug no course has", () => {
    expect(activeOnly(courses, ["c", "a", "gone"])).toEqual([{ slug: "b" }]);
    expect(splitByActive(courses, ["c", "a", "gone"])).toEqual({
      active: [{ slug: "b" }],
      inactive: [{ slug: "a" }, { slug: "c" }],
    });
  });
});

describe("coverLine and partnerLine", () => {
  it("says how far along only once a course is started", () => {
    expect(coverLine(graphics, courseStatus(graphics, {})).join(" · ")).toBe("Course · 2 modules · 3 topics");
    expect(coverLine(graphics, courseStatus(graphics, { "cp4281-m1-t1": true })).join(" · ")).toBe(
      "Course · 2 modules · 3 topics · 33% done",
    );
    expect(coverLine(hci, courseStatus(hci, { "cs2111-m1-t1": true })).join(" · ")).toBe("Course · 1 module · 1 topic · Completed");
  });

  it("names the code and the credits", () => {
    expect(partnerLine(graphics)).toBe("CP4281 · 4 MC");
    expect(partnerLine({ ...graphics, credits: 0 })).toBe("CP4281");
  });
});

describe("usedTags", () => {
  it("keeps the vocabulary's order and drops unused tags", () => {
    expect(usedTags(TAGS, [graphics, hci]).map((t) => t.id)).toEqual(["hci", "graphics"]);
  });
});
