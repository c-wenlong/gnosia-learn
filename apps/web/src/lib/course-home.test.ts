import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CourseAssets } from "@/lib/course-assets";
import { ownValue } from "@gnosia/tutor/own-key";
import type { Course, Module } from "@gnosia/tutor/types";

/**
 * What a course page reads from the server, with every read beneath it
 * stubbed: the knowledge base, the course's assets and checks, the topic
 * vocabulary and the tags.
 */

const reads = vi.hoisted(() => ({
  courses: vi.fn(),
  topics: vi.fn(),
  tags: vi.fn(),
  kb: vi.fn(),
  assets: vi.fn(),
}));

vi.mock("@/data/courses", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/courses")>()),
  getCourses: reads.courses,
}));
vi.mock("@/data/topics", () => ({ getTopics: reads.topics }));
vi.mock("@/data/content", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/content")>()),
  getTags: reads.tags,
}));
vi.mock("@/lib/learner-store", () => ({ loadKnowledgeBase: reads.kb }));
vi.mock("@/lib/course-assets", () => ({ loadCourseAssets: reads.assets }));

const { loadCourseHome } = await import("./course-home");

/** The module slugged `constructor`, read as an own key (`.constructor` is typed as the Object function). */
const own = <T>(modules: Record<string, T>): T | undefined => ownValue(modules, "constructor");

function module(id: string, topic: string, concepts: string[]): Module {
  return { id, slug: id, title: `Module ${id}`, order: 1, topic, topics: [{ id: `${id}-t1`, title: "Lesson", concepts, subtopics: [] }], resources: [] };
}

function course(modules: Module[]): Course {
  return { id: "c1", slug: "c1", code: "C1", title: "Course one", credits: 4, order: 1, inferred: false, tags: [], modules, capstone: "" };
}

const unreachable: CourseAssets = { reachable: false, byTopic: {}, paths: {}, checks: null };

beforeEach(() => {
  for (const read of Object.values(reads)) read.mockReset();
  reads.topics.mockResolvedValue([]);
  reads.tags.mockResolvedValue([]);
  reads.kb.mockResolvedValue({
    kb: { concepts: [], frontier: [], stats: { total: 0, mastered: 0, learning: 0, untouched: 0 } },
    reachable: true,
  });
});

describe("loadCourseHome with slugs named like Object.prototype's members", () => {
  it("reads no inherited member for a topic, a module or a concept the catalog has nothing for", async () => {
    // Kebab slugs admit `constructor`; `[slug]` and `in` used to answer with the Object function.
    const c = course([module("constructor", "constructor", ["constructor", "to-string"])]);
    reads.courses.mockResolvedValue([c]);
    reads.assets.mockResolvedValue(unreachable);
    const data = await loadCourseHome(c);
    expect(own(data.modules)?.assets).toBeNull();
    expect(own(data.modules)?.path).toBeNull();
    expect(own(data.modules)?.checks).toBeNull();

    reads.assets.mockResolvedValue({ reachable: true, byTopic: {}, paths: {}, checks: { "to-string": 2 } });
    const read = await loadCourseHome(c);
    // No `constructor` entry holding the Object function, which would fail the page's serialisation.
    expect(own(read.modules)?.checks).toEqual({ "to-string": 2 });
    expect(own(read.modules)?.assets).toBeNull();
  });
});
