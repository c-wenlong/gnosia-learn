import { describe, expect, it, vi } from "vitest";
import {
  findTopic,
  getAllTopicIds,
  getCourse,
  getCourses,
  getCourseTopicIds,
  getModule,
  getModuleTopicIds,
  getRelatedCourses,
  totalTopicCount,
} from "@/data/courses";
import { getTags, tagFor, tagsFor } from "@/data/content";

// The app reads courses from the database only; this suite tests logic over
// real course data, so it reads the export tree instead (`@/test/content-files`).
vi.mock("@/data/source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/source")>()),
  contentSource: (await import("@/test/content-files")).fileContentSource,
}));

/**
 * What is left of this module once the course literals moved to
 * `content/courses/*.yaml`: the lookups the pages call, over whatever the
 * reader returned. The curriculum's own invariants — the shortlist is
 * complete, topic ids are unique, `inferred` is set only where it should be —
 * are `packages/content`'s tests now, because they are facts about the files
 * rather than about this module.
 */

const courses = await getCourses();

describe("course lookups", () => {
  it("resolves courses and modules by slug", async () => {
    const course = await getCourse("cs2111");
    expect(course?.code).toBe("CS2111");
    const mod = getModule(course!, course!.modules[0].slug);
    expect(mod?.id).toBe(course!.modules[0].id);
  });

  it("returns undefined for a slug no course has", async () => {
    expect(await getCourse("nope")).toBeUndefined();
    expect(getModule(courses[0], "nope")).toBeUndefined();
  });

  it("counts every topic in the shortlist", () => {
    const ids = getAllTopicIds(courses);
    expect(new Set(ids).size).toBe(ids.length);
    expect(totalTopicCount(courses)).toBe(ids.length);
  });

  it("scopes topic ids to one course when given one", async () => {
    const course = (await getCourse("cs2111"))!;
    expect(getCourseTopicIds(course)).toEqual(getAllTopicIds([course]));
    expect(getCourseTopicIds(course).length).toBeLessThan(getAllTopicIds(courses).length);
  });

  it("lists a module's topic ids", () => {
    const mod = courses[0].modules[0];
    expect(getModuleTopicIds(mod)).toEqual(mod.topics.map((t) => t.id));
  });

  it("finds a topic and the module it belongs to", async () => {
    const course = (await getCourse("cs4263"))!;
    const wanted = course.modules[1].topics[0];
    const found = findTopic(course, wanted.id);
    expect(found?.module.id).toBe(course.modules[1].id);
    expect(found?.topic.title).toBe(wanted.title);
    expect(findTopic(course, "cs2111-m1-t1")).toBeUndefined();
  });

  it("links related courses via shared tags", async () => {
    const course = await getCourse("cp4284");
    expect(course).toBeTruthy();
    const related = getRelatedCourses(courses, course!);
    expect(related.some((c) => c.code === "CP4283")).toBe(true);
    expect(related.some((c) => c.code === "CS3227" || c.code === "CS3216")).toBe(
      true,
    );
    expect(related.some((c) => c.id === course!.id)).toBe(false);
  });
});

describe("tag lookups", () => {
  it("reads the cross-course themes", async () => {
    const tags = await getTags();
    expect(tags.map((t) => t.id)).toContain("hci");
    expect(tagFor(tags, "hci").label).toBe("HCI");
  });

  it("falls back to the raw id for a theme nothing defines", async () => {
    expect(tagFor(await getTags(), "nope")).toEqual({ id: "nope", label: "nope", description: "" });
  });

  it("resolves a course's tags in the order the course lists them", async () => {
    const course = (await getCourse("cp4284"))!;
    expect(tagsFor(await getTags(), course.tags).map((t) => t.id)).toEqual(course.tags);
  });
});
