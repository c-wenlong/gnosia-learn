import { describe, expect, it } from "vitest";
import { courses } from "@/data/courses";
import {
  courseTopicIds,
  moduleTopicIds,
  navCourseTopicIds,
  navTopicIds,
  toCourseNav,
} from "@/lib/curriculum";

const course = courses[0];

describe("topic ids", () => {
  it("lists a module's topics in order", () => {
    expect(moduleTopicIds(course.modules[0])).toEqual(
      course.modules[0].topics.map((t) => t.id),
    );
  });

  it("flattens a course's modules", () => {
    const ids = courseTopicIds(course);
    expect(ids.length).toBe(
      course.modules.reduce((n, m) => n + m.topics.length, 0),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("the sidebar projection", () => {
  const nav = toCourseNav(courses);

  it("keeps every course and module, in order", () => {
    expect(nav.map((c) => c.slug)).toEqual(courses.map((c) => c.slug));
    expect(nav[0].modules.map((m) => m.slug)).toEqual(
      courses[0].modules.map((m) => m.slug),
    );
  });

  it("carries only what the nav renders", () => {
    expect(Object.keys(nav[0]).sort()).toEqual(
      ["code", "id", "modules", "slug", "title"].sort(),
    );
    expect(Object.keys(nav[0].modules[0]).sort()).toEqual(
      ["id", "order", "slug", "title", "topicIds"].sort(),
    );
  });

  it("carries every topic id, so progress counts still add up", () => {
    expect(navTopicIds(nav).sort()).toEqual(
      courses.flatMap(courseTopicIds).sort(),
    );
    expect(navCourseTopicIds(nav[0])).toEqual(courseTopicIds(courses[0]));
  });

  it("survives an empty shortlist", () => {
    expect(toCourseNav([])).toEqual([]);
    expect(navTopicIds([])).toEqual([]);
  });
});
