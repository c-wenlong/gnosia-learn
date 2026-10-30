import { describe, expect, it, vi } from "vitest";
import {
  findTopic,
  getAllTopicIds,
  getCourse,
  getCourses,
  getModule,
  getRelatedCourses,
} from "@/data/courses";
import { courseTopicIds } from "@/lib/course-path";
import { getTags, tagFor, tagsFor } from "@/data/content";
import type { Course } from "@gnosia/tutor/types";

// The app reads courses from the database only; this suite tests logic over
// real course data, so it reads the export tree instead (`@/test/content-files`).
vi.mock("@/data/source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/source")>()),
  contentSource: (await import("@/test/content-files")).fileContentSource,
}));

/**
 * The lookups the pages call, over whatever the reader returned. The
 * curriculum's own invariants (the shortlist is complete, topic ids are
 * unique, `inferred` is set only where it should be) are `packages/content`'s
 * tests, because they are facts about the files rather than about this module.
 *
 * The tree is `seed/`, which holds one course, `cp4284`, cut to two modules.
 * The lookups that compare courses are given a second one, `other`, built here
 * from the first with its ids renamed and its tags chosen by each test.
 */

const courses = await getCourses();

/** A second course, from the seed's one, with every id renamed so none collides. */
function otherCourse(tags: string[]): Course {
  const base = courses[0]!;
  const rename = (id: string) => id.replace(base.id, "xx9999");
  return {
    ...base,
    id: "xx9999",
    slug: "xx9999",
    code: "XX9999",
    tags,
    modules: base.modules.map((m) => ({
      ...m,
      id: rename(m.id),
      topics: m.topics.map((t) => ({ ...t, id: rename(t.id) })),
    })),
  };
}

describe("course lookups", () => {
  it("resolves courses and modules by slug", async () => {
    const course = await getCourse("cp4284");
    expect(course?.code).toBe("CP4284");
    const mod = getModule(course!, course!.modules[0].slug);
    expect(mod?.id).toBe(course!.modules[0].id);
  });

  it("returns undefined for a slug no course has", async () => {
    expect(await getCourse("nope")).toBeUndefined();
    expect(getModule(courses[0], "nope")).toBeUndefined();
  });

  it("counts every topic in the shortlist", () => {
    const ids = getAllTopicIds(courses);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("scopes topic ids to one course when given one", async () => {
    const course = (await getCourse("cp4284"))!;
    const both = [course, otherCourse([])];
    expect(courseTopicIds(course)).toEqual(getAllTopicIds([course]));
    expect(courseTopicIds(course)).toEqual(course.modules.flatMap((m) => m.topics.map((t) => t.id)));
    expect(courseTopicIds(course).length).toBeLessThan(getAllTopicIds(both).length);
  });

  it("finds a topic and the module it belongs to", async () => {
    const course = (await getCourse("cp4284"))!;
    const wanted = course.modules[1].topics[0];
    const found = findTopic(course, wanted.id);
    expect(found?.module.id).toBe(course.modules[1].id);
    expect(found?.topic.title).toBe(wanted.title);
    expect(findTopic(course, otherCourse([]).modules[0].topics[0].id)).toBeUndefined();
  });

  it("links related courses via shared tags", async () => {
    const course = (await getCourse("cp4284"))!;
    const sharing = otherCourse(["transformers"]);
    const apart = { ...otherCourse(["hci"]), id: "yy9999", code: "YY9999" };
    const related = getRelatedCourses([course, sharing, apart], course);
    expect(related.map((c) => c.code)).toEqual(["XX9999"]);
    expect(getRelatedCourses([course, sharing], { ...course, tags: [] })).toEqual([]);
  });
});

describe("tag lookups", () => {
  it("reads the cross-course themes", async () => {
    const tags = await getTags();
    expect(tags.map((t) => t.id)).toEqual(["agentic-ai", "transformers"]);
    expect(tagFor(tags, "agentic-ai").label).toBe("Agentic AI");
  });

  it("falls back to the raw id for a theme nothing defines", async () => {
    expect(tagFor(await getTags(), "nope")).toEqual({ id: "nope", label: "nope", description: "" });
  });

  it("resolves a course's tags in the order the course lists them", async () => {
    const course = (await getCourse("cp4284"))!;
    expect(tagsFor(await getTags(), course.tags).map((t) => t.id)).toEqual(course.tags);
  });
});
