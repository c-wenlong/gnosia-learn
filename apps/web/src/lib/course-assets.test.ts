import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AssetRef } from "@gnosia/catalog/state";
import type { Course, Module, Topic } from "@gnosia/tutor/types";

/**
 * What a course page reads from the catalog per module (`loadCourseAssets`),
 * with the four catalog reads stubbed: a topic's assets, the concepts'
 * assets, the listed videos by id and the check counts.
 */

const catalog = vi.hoisted(() => ({
  forTopic: vi.fn(),
  forConcepts: vi.fn(),
  byIds: vi.fn(),
  checkCounts: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/lib/owner", () => ({ currentScope: async () => ({ owner: "local", readable: ["local", "commons"] }) }));
vi.mock("@/lib/learner-store", () => ({ catalogDatabase: async () => ({}) }));
vi.mock("@gnosia/catalog/state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@gnosia/catalog/state")>()),
  assetsForTopic: catalog.forTopic,
  assetsForConcepts: catalog.forConcepts,
  assetsByIds: catalog.byIds,
  conceptCheckCounts: catalog.checkCounts,
}));

const { loadCourseAssets } = await import("./course-assets");

function row(id: string, kind: string, title: string | null = `Title of ${id}`): AssetRef {
  return { id, kind, path: null, url: null, bytes: null, title, sourceRepo: "manimkc" };
}

function lesson(id: string, concepts: string[], videos?: string[]): Topic {
  return { id, title: `Lesson ${id}`, concepts, subtopics: [], ...(videos ? { videos } : {}) };
}

function module(id: string, topic: string, topics: Topic[], videos?: string[]): Module {
  return { id, slug: id, title: `Module ${id}`, order: 1, topic, topics, resources: [], ...(videos ? { videos } : {}) };
}

function course(modules: Module[]): Course {
  return { id: "c1", slug: "c1", code: "C1", title: "Course one", credits: 4, order: 1, inferred: false, tags: [], modules, capstone: "" };
}

beforeEach(() => {
  for (const read of Object.values(catalog)) read.mockReset();
  catalog.forTopic.mockResolvedValue([]);
  catalog.forConcepts.mockResolvedValue({});
  catalog.byIds.mockResolvedValue([]);
  catalog.checkCounts.mockResolvedValue({});
});

describe("loadCourseAssets", () => {
  it("counts a topic's assets without the companions, links the library to the topic, and keeps its videos as the fallback", async () => {
    catalog.forTopic.mockResolvedValue([row("v1", "video"), row("v1.transcript", "transcript"), row("p1", "poster"), row("d1", "diagram_svg"), row("n1", "note")]);
    const c = course([module("m1", "growth", [lesson("m1-t1", ["big-o"])])]);
    const assets = await loadCourseAssets(c, c.modules);
    expect(assets.reachable).toBe(true);
    expect(assets.byTopic).toEqual({ growth: { count: 3, libraryHref: "/library?topic=growth" } });
    expect(assets.paths.m1?.topicVideos.map((a) => a.id)).toEqual(["v1"]);
    expect(catalog.forTopic).toHaveBeenCalledTimes(1);
  });

  it("reads each distinct topic once, however many modules name it", async () => {
    const c = course([module("m1", "growth", []), module("m2", "growth", []), module("m3", "graphs", [])]);
    await loadCourseAssets(c, c.modules);
    expect(catalog.forTopic.mock.calls.map((call) => call[1])).toEqual(["growth", "graphs"]);
  });

  it("puts a concept's diagrams and videos on its own module's path only, and leaves its sidecars and notes off", async () => {
    catalog.forConcepts.mockResolvedValue({
      "big-o": [row("v1", "video"), row("v1.captions", "captions"), row("d1", "diagram_svg"), row("n1", "note")],
      theta: [row("d2", "diagram_svg")],
      "no-steps": [row("n2", "note")],
    });
    const c = course([module("m1", "growth", [lesson("m1-t1", ["big-o", "no-steps"])]), module("m2", "bounds", [lesson("m2-t1", ["theta"])])]);
    const assets = await loadCourseAssets(c, c.modules);
    expect(catalog.forConcepts.mock.calls[0]?.[1]).toEqual(["big-o", "no-steps", "theta"]);
    const ids = (m: string) => Object.fromEntries(Object.entries(assets.paths[m]!.byConcept).map(([slug, list]) => [slug, list.map((a) => a.id)]));
    expect(ids("m1")).toEqual({ "big-o": ["v1", "d1"] });
    expect(ids("m2")).toEqual({ theta: ["d2"] });
  });

  it("resolves a listed video only to a video, and only on the module that lists it, on the module or a lesson", async () => {
    catalog.byIds.mockResolvedValue([row("v1", "video"), row("v2", "video"), row("d1", "diagram_svg")]);
    const c = course([
      module("m1", "growth", [lesson("m1-t1", [], ["v2"])], ["v1", "d1", "gone"]),
      module("m2", "bounds", [lesson("m2-t1", [])]),
    ]);
    const assets = await loadCourseAssets(c, c.modules);
    expect(catalog.byIds.mock.calls[0]?.[1]).toEqual(["v1", "d1", "gone", "v2"]);
    expect(Object.keys(assets.paths.m1!.listed).sort()).toEqual(["v1", "v2"]);
    expect(assets.paths.m2!.listed).toEqual({});
  });

  it("draws a listed video with its title, its library link, its kind and its family", async () => {
    catalog.byIds.mockResolvedValue([row("manimkc:out/a b.mp4", "video", "Big-O in pictures"), row("untitled", "video", null)]);
    const c = course([module("m1", "growth", [], ["manimkc:out/a b.mp4", "untitled"])]);
    const { paths } = await loadCourseAssets(c, c.modules);
    expect(paths.m1!.listed["manimkc:out/a b.mp4"]).toEqual({
      id: "manimkc:out/a b.mp4",
      href: "/library/manimkc%3Aout%2Fa%20b.mp4",
      title: "Big-O in pictures",
      titled: true,
      kindLabel: "Video",
      family: "video",
    });
    expect(paths.m1!.listed.untitled?.titled).toBe(false);
  });

  it("calls a topic shared when another live module, of any course, names it", async () => {
    const c = course([module("m1", "growth", []), module("m2", "graphs", [])]);
    const elsewhere = [...c.modules, { id: "other-m1", topic: "growth" }];
    const { paths } = await loadCourseAssets(c, elsewhere);
    expect(paths.m1!.topicShared).toBe(true);
    expect(paths.m2!.topicShared).toBe(false);
  });

  it("asks for the check counts of the course's concepts and hands them on as they came", async () => {
    catalog.checkCounts.mockResolvedValue({ "big-o": 3 });
    const c = course([module("m1", "growth", [lesson("m1-t1", ["big-o", "theta"])])]);
    const assets = await loadCourseAssets(c, c.modules);
    expect(catalog.checkCounts.mock.calls[0]?.[1]).toEqual(["big-o", "theta"]);
    expect(assets.checks).toEqual({ "big-o": 3 });
  });

  it("reads as unreachable, with nothing for any module, when one read fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    catalog.checkCounts.mockRejectedValue(new Error("SQLITE_CANTOPEN"));
    const c = course([module("m1", "growth", [lesson("m1-t1", ["big-o"])])]);
    expect(await loadCourseAssets(c, c.modules)).toEqual({ reachable: false, byTopic: {}, paths: {}, checks: null });
  });
});
