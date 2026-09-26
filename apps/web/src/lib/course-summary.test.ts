import { describe, expect, it } from "vitest";

import type { Course, TagMeta } from "@/lib/types";

import { courseStatus, filterCourses, toCourseSummary, usedTags } from "./course-summary";

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
    // Modules deliberately out of order, to check the summary sorts them.
    modules: topics
      .map((names, i) => ({
        id: `${slug}-m${i + 1}`,
        slug: `m${i + 1}`,
        title: `Module ${i + 1}`,
        order: i + 1,
        topic: "",
        resources: [],
        topics: names.map((name, j) => ({ id: `${slug}-m${i + 1}-t${j + 1}`, title: name, subtopics: [] })),
      }))
      .reverse(),
  } as unknown as Course;
}

const graphics = toCourseSummary(
  course("cp4281", "CP4281", "Computer Graphics", ["graphics"], [["Vectors", "Dot product"], ["Barycentric"]]),
  [TAGS[1]],
);
const hci = toCourseSummary(course("cs2111", "CS2111", "Interaction Design", ["hci"], [["Personas"]]), [TAGS[0]]);

describe("toCourseSummary", () => {
  it("keeps module order and counts", () => {
    expect(graphics.moduleCount).toBe(2);
    expect(graphics.topics.map((t) => t.title)).toEqual(["Vectors", "Dot product", "Barycentric"]);
    expect(graphics.tags).toEqual([{ id: "graphics", label: "Graphics" }]);
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
});

describe("filterCourses", () => {
  const all = [graphics, hci];

  it("matches every word against code, title and tag labels", () => {
    expect(filterCourses(all, "cp4281", { kind: "all" }, {})).toEqual([graphics]);
    expect(filterCourses(all, "  interaction   hci ", { kind: "all" }, {})).toEqual([hci]);
    expect(filterCourses(all, "graphics hci", { kind: "all" }, {})).toEqual([]);
  });

  it("filters by tag and by in-progress", () => {
    expect(filterCourses(all, "", { kind: "tag", tag: "hci" }, {})).toEqual([hci]);
    const done = { "cp4281-m1-t1": true as const, "cs2111-m1-t1": true as const };
    // CS2111 is complete, so it is not in progress.
    expect(filterCourses(all, "", { kind: "in-progress" }, done)).toEqual([graphics]);
  });
});

describe("usedTags", () => {
  it("keeps the vocabulary's order and drops unused tags", () => {
    expect(usedTags(TAGS, [graphics, hci]).map((t) => t.id)).toEqual(["hci", "graphics"]);
  });
});
