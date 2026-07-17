import { describe, expect, it } from "vitest";
import {
  courses,
  getAllTopicIds,
  getCourse,
  getModule,
  getRelatedCourses,
} from "@/data/courses";

describe("curriculum data integrity", () => {
  it("includes the full AY2026/27 shortlist", () => {
    const codes = courses.map((c) => c.code).sort();
    expect(codes).toEqual(
      [
        "CP4281",
        "CP4282",
        "CP4283",
        "CP4284",
        "CP4285",
        "CS2111",
        "CS3216",
        "CS3227",
        "CS3249",
        "CS4263",
      ].sort(),
    );
  });

  it("flags inferred syllabi only for known courses", () => {
    const inferred = courses.filter((c) => c.inferred).map((c) => c.code).sort();
    expect(inferred).toEqual(["CS2111", "CS3227", "CS4263"].sort());
  });

  it("gives every course modules with unique topic ids", () => {
    const seen = new Set<string>();
    for (const course of courses) {
      expect(course.modules.length).toBeGreaterThan(0);
      for (const mod of course.modules) {
        expect(mod.topics.length).toBeGreaterThan(0);
        for (const topic of mod.topics) {
          expect(seen.has(topic.id)).toBe(false);
          seen.add(topic.id);
        }
      }
    }
    expect(getAllTopicIds().length).toBe(seen.size);
  });

  it("resolves courses and modules by slug", () => {
    const course = getCourse("cs2111");
    expect(course?.code).toBe("CS2111");
    const mod = getModule(course!, course!.modules[0].slug);
    expect(mod?.id).toBe(course!.modules[0].id);
  });

  it("links related courses via shared tags", () => {
    const course = getCourse("cp4284");
    expect(course).toBeTruthy();
    const related = getRelatedCourses(course!);
    expect(related.some((c) => c.code === "CP4283")).toBe(true);
    expect(related.some((c) => c.code === "CS3227" || c.code === "CS3216")).toBe(
      true,
    );
  });
});
