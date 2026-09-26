import { describe, expect, it } from "vitest";
import { courses } from "@/data/courses";
import { courseTopicIds, moduleTopicIds } from "@/lib/curriculum";

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
