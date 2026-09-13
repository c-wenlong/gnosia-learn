import { describe, expect, it } from "vitest";
import {
  courses,
  getAllTopicIds,
  getCourse,
  getModule,
  getModuleTopicIds,
  getRelatedCourses,
  findTopic,
  totalTopicCount,
} from "@/data/courses";
import { getTag, getTags, tags } from "@/data/content";

/**
 * What is left of this module once the course literals moved to
 * `content/courses/*.yaml`: the lookups the pages call, over whatever the
 * reader returned. The curriculum's own invariants — the shortlist is
 * complete, topic ids are unique, `inferred` is set only where it should be —
 * are `packages/content`'s tests now, because they are facts about the files
 * rather than about this module.
 */

describe("course lookups", () => {
  it("resolves courses and modules by slug", () => {
    const course = getCourse("cs2111");
    expect(course?.code).toBe("CS2111");
    const mod = getModule(course!, course!.modules[0].slug);
    expect(mod?.id).toBe(course!.modules[0].id);
  });

  it("returns undefined for a slug no course has", () => {
    expect(getCourse("nope")).toBeUndefined();
    expect(getModule(courses[0], "nope")).toBeUndefined();
  });

  it("counts every topic in the shortlist", () => {
    const ids = getAllTopicIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(totalTopicCount()).toBe(ids.length);
  });

  it("scopes topic ids to one course when given one", () => {
    const course = getCourse("cs2111")!;
    expect(getAllTopicIds(course).length).toBeLessThan(getAllTopicIds().length);
  });

  it("lists a module's topic ids", () => {
    const mod = courses[0].modules[0];
    expect(getModuleTopicIds(mod)).toEqual(mod.topics.map((t) => t.id));
  });

  it("finds a topic and the module it belongs to", () => {
    const course = getCourse("cs4263")!;
    const wanted = course.modules[1].topics[0];
    const found = findTopic(course, wanted.id);
    expect(found?.module.id).toBe(course.modules[1].id);
    expect(found?.topic.title).toBe(wanted.title);
    expect(findTopic(course, "cs2111-m1-t1")).toBeUndefined();
  });

  it("links related courses via shared tags", () => {
    const course = getCourse("cp4284");
    expect(course).toBeTruthy();
    const related = getRelatedCourses(course!);
    expect(related.some((c) => c.code === "CP4283")).toBe(true);
    expect(related.some((c) => c.code === "CS3227" || c.code === "CS3216")).toBe(
      true,
    );
    expect(related.some((c) => c.id === course!.id)).toBe(false);
  });
});

describe("tag lookups", () => {
  it("reads the cross-course themes", () => {
    expect(tags.map((t) => t.id)).toContain("hci");
    expect(getTag("hci").label).toBe("HCI");
  });

  it("falls back to the raw id for a theme nothing defines", () => {
    expect(getTag("nope")).toEqual({ id: "nope", label: "nope", description: "" });
  });

  it("resolves a course's tags in the order the course lists them", () => {
    const course = getCourse("cp4284")!;
    expect(getTags(course.tags).map((t) => t.id)).toEqual(course.tags);
  });
});
