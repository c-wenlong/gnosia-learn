import { describe, expect, it } from "vitest";
import { getCourses } from "@/data/courses";
import { courseTopicIds, moduleTopicIds } from "@/lib/curriculum";

// Read once for the file: the list is per request in the app, and a test file is one request.
const courses = await getCourses();

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
