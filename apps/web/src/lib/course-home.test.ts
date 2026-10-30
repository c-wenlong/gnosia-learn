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

/** A knowledge-base concept, as `loadKnowledgeBase` answers one. */
function kbConcept(id: string, over: Record<string, unknown> = {}) {
  return { id, title: `Title of ${id}`, domain: "algorithms", pL: 0.25, mastery: "gap", observations: 0, topics: [], positions: {}, requires: [], assumes: [], ...over };
}

function topicEntry(slug: string, concepts: string[], summary: string | null = null) {
  return { slug, title: slug, domain: "algorithms", summary, aliases: [], relations: [], maps: { manimkc: [], courses: [], concepts } };
}

function knowledgeBase(concepts: ReturnType<typeof kbConcept>[], frontier: string[] = [], reachable = true) {
  return { kb: { concepts, frontier, stats: { total: concepts.length, mastered: 0, learning: 0, untouched: concepts.length } }, reachable };
}

describe("loadCourseHome", () => {
  it("resolves each lesson's mastery from the concepts its list names, and leaves a lesson with none out", async () => {
    const c = course([{ ...module("m1", "growth", []), topics: [
      { id: "m1-t1", title: "One", concepts: ["big-o", "theta"], subtopics: [] },
      { id: "m1-t2", title: "Two", concepts: [], subtopics: [] },
    ] }]);
    reads.courses.mockResolvedValue([c]);
    reads.assets.mockResolvedValue(unreachable);
    reads.kb.mockResolvedValue(
      knowledgeBase([
        kbConcept("big-o", { topics: ["m1-t1"], positions: { "m1-t1": 1 }, mastery: "mastered", pL: 0.97, observations: 3 }),
        kbConcept("theta", { topics: ["m1-t1"], positions: { "m1-t1": 2 }, observations: 1, pL: 0.4 }),
      ]),
    );
    const data = await loadCourseHome(c);
    expect(Object.keys(data.mastery)).toEqual(["m1-t1"]);
    expect(data.mastery["m1-t1"]).toMatchObject({ bucket: "learning", pL: 0.4, next: "theta" });
    expect(data.modules.m1?.guidebook).toBe("big-o");
  });

  it("falls back to the module topic's authored concepts for the Guidebook, only ones the knowledge base holds while it answers", async () => {
    const c = course([module("m1", "growth", [])]);
    reads.courses.mockResolvedValue([c]);
    reads.assets.mockResolvedValue(unreachable);
    reads.topics.mockResolvedValue([topicEntry("growth", ["gone", "theta"], "  How functions grow.  ")]);
    reads.kb.mockResolvedValue(knowledgeBase([kbConcept("theta")]));
    const data = await loadCourseHome(c);
    expect(data.modules.m1?.guidebook).toBe("theta");
    expect(data.modules.m1?.description).toBe("How functions grow.");

    // With the knowledge base down, the first authored concept, unchecked.
    reads.kb.mockResolvedValue(knowledgeBase([], [], false));
    expect((await loadCourseHome(c)).modules.m1?.guidebook).toBe("gone");
  });

  it("sends the module's concepts and their direct prerequisites, with only the fields the path reads", async () => {
    const c = course([module("m1", "growth", ["theta"])]);
    reads.courses.mockResolvedValue([c]);
    reads.assets.mockResolvedValue(unreachable);
    reads.kb.mockResolvedValue(
      knowledgeBase([
        kbConcept("theta", { requires: ["big-o"], assumes: ["limits", "unreadable"] }),
        kbConcept("big-o", { requires: ["functions"] }),
        kbConcept("limits"),
        kbConcept("functions"),
        kbConcept("elsewhere"),
      ]),
    );
    const { modules } = await loadCourseHome(c);
    expect(modules.m1?.concepts.map((k) => k.id)).toEqual(["theta", "big-o", "limits"]);
    expect(Object.keys(modules.m1!.concepts[0]!).sort()).toEqual(["assumes", "id", "mastery", "observations", "pL", "requires", "title"]);
  });

  it("hands on the module's assets and path, and only the check counts of the concepts it teaches", async () => {
    const c = course([module("m1", "growth", ["theta"]), module("m2", "bounds", ["big-o"])]);
    const other = { ...course([module("other-m1", "growth", [])]), id: "c2", slug: "c2" };
    reads.courses.mockResolvedValue([c, other]);
    const path = { byConcept: {}, listed: {}, topicVideos: [], topicShared: false };
    reads.assets.mockResolvedValue({
      reachable: true,
      byTopic: { growth: { count: 2, libraryHref: "/library?topic=growth" } },
      paths: { m1: path },
      checks: { theta: 2, "big-o": 1 },
    });
    const data = await loadCourseHome(c);
    expect(data.assetsReachable).toBe(true);
    expect(data.modules.m1).toMatchObject({ assets: { count: 2 }, path, checks: { theta: 2 } });
    expect(data.modules.m2).toMatchObject({ assets: null, path: null, checks: { "big-o": 1 } });
    // Every live module of every course goes to the asset read, for the shared-topic rule.
    expect(reads.assets.mock.calls[0]?.[1]).toEqual([...c.modules, ...other.modules]);
  });

  it("names related courses by the labels of the tags they share, and the ids when the tags cannot be read", async () => {
    const here = { ...course([]), tags: ["agentic-ai", "systems"] };
    const other = { ...course([]), id: "c2", slug: "c2", code: "C2", title: "Course two", tags: ["agentic-ai", "maths"] };
    reads.courses.mockResolvedValue([here, other]);
    reads.assets.mockResolvedValue(unreachable);
    reads.tags.mockResolvedValue([{ id: "agentic-ai", label: "Agentic AI", description: "" }]);
    expect((await loadCourseHome(here)).related).toEqual([{ slug: "c2", code: "C2", title: "Course two", shared: ["Agentic AI"] }]);

    reads.tags.mockRejectedValue(new Error("tags unreadable"));
    expect((await loadCourseHome(here)).related[0]?.shared).toEqual(["agentic-ai"]);
  });
});
