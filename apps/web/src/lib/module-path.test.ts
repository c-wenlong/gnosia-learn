import { describe, expect, it } from "vitest";

import { conceptsForTopic, resolveTopicMastery, type KbConceptLike, type TopicMastery } from "./course-path";
import {
  conceptMeta,
  moduleConcepts,
  modulePath,
  pathSequence,
  quizHref,
  weekCheckHref,
  weekCheckMeta,
  type ModulePathAssets,
  type ModulePathInput,
  type PathAsset,
  type PathKbConcept,
} from "./module-path";
import type { Module, Resource, Topic } from "@gnosia/tutor/types";

/**
 * Phase 3 of docs/proposals/module-learning-path.md: the module page as one
 * ordered path. Each case below is one line of the proposal's test list, or
 * one rule of "The path, step by step" and "Videos name their concepts".
 */

/** A knowledge-base concept: what the path reads, and what `conceptsForTopic` reads to resolve mastery. */
type Kb = PathKbConcept & KbConceptLike;

function concept(id: string, over: Partial<Kb> & { items?: string[] } = {}): Kb {
  return {
    id,
    title: `Title of ${id}`,
    pL: over.mastery === "mastered" ? 0.97 : 0.25,
    mastery: "gap",
    observations: 0,
    topics: over.items ?? [],
    positions: over.positions ?? {},
    requires: [],
    assumes: [],
    ...over,
  };
}

function lesson(id: string, concepts: string[], extra: Partial<Topic> = {}): Topic {
  return { id, title: `Lesson ${id}`, concepts, subtopics: [], ...extra };
}

function reading(id: string, type: Resource["type"] = "book", lessons?: string[]): Resource {
  const r: Resource = { id, title: `Reading ${id}`, url: `https://example.com/${id}`, type };
  if (lessons) r.lessons = lessons;
  return r;
}

function video(id: string): PathAsset {
  return { id, href: `/library/${encodeURIComponent(id)}`, title: `Video ${id}`, titled: true, kindLabel: "Video", family: "video" };
}

function diagram(id: string): PathAsset {
  return { id, href: `/library/${encodeURIComponent(id)}`, title: `Diagram ${id}`, titled: true, kindLabel: "Diagram", family: "diagram" };
}

/** Week 1, shaped like CS3230's: three lessons of two concepts each. */
function week(extra: Partial<Module> = {}): Module {
  return {
    id: "m1",
    slug: "m1",
    title: "Week one",
    order: 1,
    topic: "growth",
    topics: [
      lesson("m1-t1", ["big-o", "big-omega"]),
      lesson("m1-t2", ["theta", "little-o"]),
      lesson("m1-t3", ["compare", "log-base"]),
    ],
    resources: [],
    ...extra,
  };
}

/** The knowledge base: the six concepts of week 1, linked to their items in order, plus outsiders. */
function knowledgeBase(over: Record<string, Partial<Kb>> = {}): Kb[] {
  const placed: [string, string, number][] = [
    ["big-o", "m1-t1", 1],
    ["big-omega", "m1-t1", 2],
    ["theta", "m1-t2", 1],
    ["little-o", "m1-t2", 2],
    ["compare", "m1-t3", 1],
    ["log-base", "m1-t3", 2],
  ];
  const inModule = placed.map(([id, item, at]) =>
    concept(id, { items: [item], positions: { [item]: at }, ...(over[id] ?? {}) }),
  );
  const outside = ["machine-model", "logarithms", "limits", "functions"].map((id) => concept(id, over[id] ?? {}));
  return [...inModule, ...outside];
}

function masteryOf(module: Module, concepts: Kb[]): Record<string, TopicMastery> {
  const out: Record<string, TopicMastery> = {};
  for (const t of module.topics) {
    const m = resolveTopicMastery(conceptsForTopic(concepts, t.id));
    if (m) out[t.id] = m;
  }
  return out;
}

function noAssets(extra: Partial<ModulePathAssets> = {}): ModulePathAssets {
  return { byConcept: {}, listed: {}, topicVideos: [], topicShared: false, ...extra };
}

function input(over: Partial<ModulePathInput> & { module?: Module; concepts?: Kb[] } = {}): ModulePathInput {
  const mod = over.module ?? week();
  const concepts = over.concepts ?? knowledgeBase();
  return {
    module: mod,
    concepts,
    mastery: over.mastery ?? masteryOf(mod, concepts),
    completed: over.completed ?? {},
    assets: over.assets === undefined ? noAssets() : over.assets,
    checks: over.checks === undefined ? {} : over.checks,
  };
}

/** Every video id on the page, wherever it landed, in page order. */
function videosOnPage(path: ReturnType<typeof modulePath>): string[] {
  return pathSequence(path)
    .filter((s) => s.kind === "video" || s.kind === "asset")
    .map((s) => s.id);
}

describe("moduleConcepts", () => {
  it("is every lesson's concepts in lesson order, each once", () => {
    const lessons = { topics: [{ concepts: ["a", "b"] }, { concepts: [] }, { concepts: ["b", "c", "a", "d"] }] } as unknown as Pick<Module, "topics">;
    expect(moduleConcepts(lessons)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("modulePath: the order of the steps", () => {
  it("runs before you start, watch, read alongside, the lessons with their concept steps, then practice", () => {
    const mod = week({
      videos: ["manimkc:week-1.mp4"],
      resources: [reading("r1", "book"), reading("r2", "docs", ["m1-t3"]), reading("r3", "practice")],
    });
    const concepts = knowledgeBase({ "big-o": { assumes: ["machine-model"] } });
    const path = modulePath(
      input({
        module: mod,
        concepts,
        assets: noAssets({ listed: { "manimkc:week-1.mp4": video("manimkc:week-1.mp4") }, byConcept: { theta: [diagram("diagram:theta")] } }),
        checks: { "big-o": 2 },
      }),
    );
    expect(pathSequence(path).map((s) => `${s.section} ${s.kind} ${s.id}`)).toEqual([
      "before prerequisite machine-model",
      "watch video manimkc:week-1.mp4",
      "read reading r1",
      "m1-t1 lesson m1-t1",
      "m1-t1 note big-o",
      "m1-t1 note big-omega",
      "m1-t2 lesson m1-t2",
      "m1-t2 note theta",
      "m1-t2 asset diagram:theta",
      "m1-t2 note little-o",
      "m1-t3 lesson m1-t3",
      "m1-t3 note compare",
      "m1-t3 note log-base",
      "m1-t3 reading r2",
      "practice reading r3",
      "check check m1",
    ]);
  });

  it("takes each lesson's concepts in its teaching order, links each note and its Quiz me, and says how many checks", () => {
    const path = modulePath(input({ checks: { "big-o": 3, "big-omega": 0 } }));
    const [first] = path.lessons;
    expect(first?.concepts.map((c) => [c.slug, c.title, c.href, c.quizHref, c.checks])).toEqual([
      ["big-o", "Title of big-o", "/learn/big-o", "/learn/big-o/session?mode=check", 3],
      // No checks: no Quiz me, as the concept workspace offers none either,
      // since with no tutor model the session would ask nothing.
      ["big-omega", "Title of big-omega", "/learn/big-omega", null, 0],
    ]);
    expect(quizHref("a b")).toBe("/learn/a%20b/session?mode=check");
  });

  it("says nothing about a count of checks it could not read", () => {
    const path = modulePath(input({ checks: null }));
    expect(path.lessons[0]?.concepts.map((c) => c.checks)).toEqual([null, null]);
    expect(path.lessons[0]?.concepts.map((c) => c.quizHref)).toEqual([null, null]);
  });

  it("puts a concept's p(L) on its meta line once it has been seen, as the old concept list did", () => {
    expect(conceptMeta({ bucket: "learning", checks: 3, pL: 0.6234 })).toBe("Note · Learning · p(L) 0.62 · 3 checks");
    expect(conceptMeta({ bucket: "mastered", checks: 0, pL: 0.97 })).toBe("Note · Mastered · p(L) 0.97");
    expect(conceptMeta({ bucket: "untouched", checks: 2, pL: 0.25 })).toBe("Note · Not started · 2 checks");
    const concepts = knowledgeBase({ "big-o": { observations: 2, mastery: "weak", pL: 0.41 } });
    expect(modulePath(input({ concepts })).lessons[0]?.concepts[0]?.pL).toBe(0.41);
  });

  it("puts the check count on the note's meta line only when the note has checks", () => {
    const concepts = knowledgeBase({ "big-o": { observations: 2, mastery: "weak" } });
    const path = modulePath(input({ concepts, checks: { "big-o": 3, "big-omega": 1, theta: 0 } }));
    const steps = path.lessons.flatMap((l) => l.concepts);
    expect(steps.slice(0, 3).map(conceptMeta)).toEqual([
      "Note · Learning · p(L) 0.25 · 3 checks",
      "Note · Not started · 1 check",
      "Note · Not started",
    ]);
    expect(modulePath(input({ checks: null })).lessons[0]?.concepts.map(conceptMeta)).toEqual([
      "Note · Not started",
      "Note · Not started",
    ]);
  });

  it("marks a lesson done by topicDone: mastered when it has concepts, the tick when it has none", () => {
    const mod = week({ topics: [...week().topics, lesson("m1-t4", [])] });
    const concepts = knowledgeBase({ "big-o": { mastery: "mastered", observations: 3 }, "big-omega": { mastery: "mastered", observations: 3 } });
    const path = modulePath(input({ module: mod, concepts, completed: { "m1-t2": true, "m1-t4": true } }));
    // m1-t2 is ticked but not mastered: a tick on a lesson with concepts moves nothing.
    expect(path.lessons.map((l) => [l.item.id, l.done])).toEqual([
      ["m1-t1", true],
      ["m1-t2", false],
      ["m1-t3", false],
      ["m1-t4", true],
    ]);
  });
});

describe("modulePath: before you start", () => {
  it("lists requires before assumes, deduplicated, and leaves out mastered and in-module prerequisites", () => {
    const concepts = knowledgeBase({
      // in-module prerequisite: theta requires big-o, which week 1 teaches
      theta: { requires: ["big-o", "limits"], assumes: ["machine-model"] },
      "big-o": { assumes: ["machine-model", "functions"] },
      compare: { requires: ["logarithms"], assumes: ["limits"] },
      // mastered: never listed
      functions: { mastery: "mastered", observations: 4 },
    });
    const path = modulePath(input({ concepts }));
    expect(path.before.map((p) => [p.slug, p.edge, p.href])).toEqual([
      ["limits", "requires", "/learn/limits"],
      ["logarithms", "requires", "/learn/logarithms"],
      ["machine-model", "assumes", "/learn/machine-model"],
    ]);
    expect(path.before[0]?.title).toBe("Title of limits");
  });

  it("is empty when every prerequisite is taught here or mastered, and leaves out one it cannot read", () => {
    const concepts = knowledgeBase({
      theta: { requires: ["big-o", "someone-elses-concept"] },
      "big-o": { assumes: ["machine-model"] },
      "machine-model": { mastery: "mastered", observations: 2 },
    });
    expect(modulePath(input({ concepts })).before).toEqual([]);
  });
});

describe("modulePath: readings", () => {
  it("makes a reading with no lessons module material, and puts one with lessons on each lesson it lists", () => {
    const mod = week({
      resources: [reading("r1", "book"), reading("r2", "docs", ["m1-t1", "m1-t3"]), reading("r3", "paper")],
    });
    const path = modulePath(input({ module: mod }));
    expect(path.readAlongside.map((r) => r.id)).toEqual(["r1", "r3"]);
    expect(path.lessons.map((l) => l.readings.map((r) => r.id))).toEqual([["r2"], [], ["r2"]]);
  });

  it("puts a practice reading with no lessons once, after the last lesson, never under read alongside", () => {
    const mod = week({ resources: [reading("p1", "practice"), reading("r1", "book")] });
    const path = modulePath(input({ module: mod }));
    expect(path.readAlongside.map((r) => r.id)).toEqual(["r1"]);
    expect(path.practice.map((r) => r.id)).toEqual(["p1"]);
    expect(path.lessons.flatMap((l) => l.readings)).toEqual([]);
    const sequence = pathSequence(path);
    expect(sequence.filter((s) => s.id === "p1")).toHaveLength(1);
    // After the lessons, and before only the week check.
    expect(sequence.at(-2)).toEqual({ section: "practice", kind: "reading", id: "p1" });
    expect(sequence.at(-1)?.kind).toBe("check");
  });

  it("closes the last lesson a practice reading lists, after that lesson's other readings, and only there", () => {
    const mod = week({
      resources: [
        reading("p1", "practice", ["m1-t2", "m1-t1"]),
        reading("r1", "book", ["m1-t2"]),
        reading("r2", "docs", ["m1-t2"]),
      ],
    });
    const path = modulePath(input({ module: mod }));
    expect(path.lessons.map((l) => l.readings.map((r) => r.id))).toEqual([[], ["r1", "r2", "p1"], []]);
    expect(path.practice).toEqual([]);
    expect(path.readAlongside).toEqual([]);
    expect(pathSequence(path).filter((s) => s.id === "p1")).toHaveLength(1);
  });
});

describe("modulePath: videos", () => {
  it("lands a concept-linked video and diagram on that concept's step, under its note", () => {
    const assets = noAssets({ byConcept: { "little-o": [video("video:little-o"), diagram("diagram:little-o")] } });
    const path = modulePath(input({ assets }));
    const step = path.lessons[1]?.concepts[1];
    expect(step?.slug).toBe("little-o");
    expect(step?.assets.map((a) => a.id)).toEqual(["video:little-o", "diagram:little-o"]);
    expect(path.watch).toEqual([]);
  });

  it("places a video linked to two concepts of the module on the first one, once", () => {
    const shared = video("video:both");
    const path = modulePath(input({ assets: noAssets({ byConcept: { compare: [shared], "big-omega": [shared] } }) }));
    expect(path.lessons[0]?.concepts[1]?.assets.map((a) => a.id)).toEqual(["video:both"]);
    expect(path.lessons[2]?.concepts[0]?.assets).toEqual([]);
  });

  it("places a video reached by a course listing, a concept link and a topic link once, where the course listed it", () => {
    const v = video("video:everywhere");
    const onLesson = week({ topics: [lesson("m1-t1", ["big-o", "big-omega"]), lesson("m1-t2", ["theta", "little-o"], { videos: ["video:everywhere"] }), lesson("m1-t3", ["compare", "log-base"])] });
    const assets = noAssets({ listed: { "video:everywhere": v }, byConcept: { "big-o": [v] }, topicVideos: [v] });
    const path = modulePath(input({ module: onLesson, assets }));
    expect(videosOnPage(path)).toEqual(["video:everywhere"]);
    expect(path.lessons[1]?.videos.map((a) => a.id)).toEqual(["video:everywhere"]);

    const onModule = week({ videos: ["video:everywhere"] });
    const again = modulePath(input({ module: onModule, assets }));
    expect(videosOnPage(again)).toEqual(["video:everywhere"]);
    expect(again.watch.map((a) => a.id)).toEqual(["video:everywhere"]);
  });

  it("leaves off a listed id that resolves to no readable video", () => {
    const mod = week({
      videos: ["manimkc:not-indexed-yet.mp4", "video:there"],
      topics: [lesson("m1-t1", ["big-o"], { videos: ["video:gone"] }), lesson("m1-t2", ["theta"])],
    });
    const path = modulePath(input({ module: mod, assets: noAssets({ listed: { "video:there": video("video:there") } }) }));
    expect(path.watch.map((a) => a.id)).toEqual(["video:there"]);
    expect(path.lessons[0]?.videos).toEqual([]);
    expect(videosOnPage(path)).toEqual(["video:there"]);
  });

  it("shows no topic-only video on a module on a shared topic that lists a video that resolves", () => {
    const mod = week({ videos: ["video:ours"] });
    const assets = noAssets({
      topicShared: true,
      listed: { "video:ours": video("video:ours") },
      topicVideos: [video("manimkc:other-modules-week.mp4"), video("video:ours")],
    });
    expect(modulePath(input({ module: mod, assets })).watch.map((a) => a.id)).toEqual(["video:ours"]);
  });

  it("counts a video a lesson lists as the module listing one, for the shared-topic rule", () => {
    const mod = week({ topics: [lesson("m1-t1", ["big-o"], { videos: ["video:ours"] })] });
    const assets = noAssets({ topicShared: true, listed: { "video:ours": video("video:ours") }, topicVideos: [video("manimkc:theirs.mp4")] });
    const path = modulePath(input({ module: mod, assets }));
    expect(videosOnPage(path)).toEqual(["video:ours"]);
  });

  it("still shows topic-only videos on a shared topic while every video the module lists is dangling", () => {
    const mod = week({ videos: ["manimkc:not-indexed-yet.mp4"] });
    const assets = noAssets({ topicShared: true, topicVideos: [video("manimkc:week.mp4")] });
    expect(modulePath(input({ module: mod, assets })).watch.map((a) => a.id)).toEqual(["manimkc:week.mp4"]);
    // and on a shared topic that lists nothing at all
    expect(modulePath(input({ assets })).watch.map((a) => a.id)).toEqual(["manimkc:week.mp4"]);
  });

  it("always shows topic-only videos on a topic the module alone names, after the ones it lists, except ones already placed", () => {
    const mod = week({ videos: ["video:ours"] });
    const v = video("video:on-a-concept");
    const assets = noAssets({
      topicShared: false,
      listed: { "video:ours": video("video:ours") },
      byConcept: { theta: [v] },
      topicVideos: [video("manimkc:week.mp4"), v, video("video:ours")],
    });
    const path = modulePath(input({ module: mod, assets }));
    expect(path.watch.map((a) => a.id)).toEqual(["video:ours", "manimkc:week.mp4"]);
    expect(path.lessons[1]?.concepts[0]?.assets.map((a) => a.id)).toEqual(["video:on-a-concept"]);
  });

  it("shows no video at all when the catalog did not answer, and keeps the lessons and readings", () => {
    const mod = week({ videos: ["video:ours"], resources: [reading("r1")] });
    const path = modulePath(input({ module: mod, assets: null }));
    expect(path.watch).toEqual([]);
    expect(path.readAlongside.map((r) => r.id)).toEqual(["r1"]);
    expect(path.lessons).toHaveLength(3);
  });
});

describe("modulePath: a shared topic", () => {
  it("shows only the module's own lessons when another module names its topic", () => {
    const other: Module = { ...week(), id: "m2", slug: "m2", order: 2, topics: [lesson("m2-t1", ["limits"])] };
    const concepts = [...knowledgeBase().filter((c) => c.id !== "limits"), concept("limits", { items: ["m2-t1"], positions: { "m2-t1": 1 } })];
    const assets = noAssets({ topicShared: true });
    const mine = modulePath(input({ module: week(), concepts, assets }));
    const theirs = modulePath(input({ module: other, concepts, assets }));
    expect(mine.lessons.map((l) => l.item.id)).toEqual(["m1-t1", "m1-t2", "m1-t3"]);
    expect(theirs.lessons.map((l) => l.item.id)).toEqual(["m2-t1"]);
    expect(theirs.lessons[0]?.concepts.map((c) => c.slug)).toEqual(["limits"]);
  });
});

describe("modulePath: the week check", () => {
  it("is the last step, after practice, counting the module's concepts and up to three questions each", () => {
    const path = modulePath(input({ module: week({ resources: [reading("r3", "practice")] }) }));
    expect(path.check).toEqual({ concepts: 6, questions: 18 });
    expect(pathSequence(path).at(-1)).toEqual({ section: "check", kind: "check", id: "m1" });
    expect(weekCheckMeta(path.check!)).toBe("6 concepts · up to 18 questions");
    expect(weekCheckHref("cs3230", "week-1")).toBe("/courses/cs3230/week-1/check");
  });

  it("counts a concept two lessons name once, and only concepts it can read", () => {
    const mod = week({ topics: [lesson("m1-t1", ["big-o", "big-omega"]), lesson("m1-t2", ["big-o", "not-in-the-kb"])] });
    expect(modulePath(input({ module: mod })).check).toEqual({ concepts: 2, questions: 6 });
  });

  it("stops at 24 questions however many concepts the module has", () => {
    const slugs = Array.from({ length: 10 }, (_, i) => `c${i}`);
    const mod = week({ topics: [lesson("m1-t1", slugs)] });
    const path = modulePath(input({ module: mod, concepts: slugs.map((id) => concept(id, { items: ["m1-t1"] })) }));
    expect(path.check).toEqual({ concepts: 10, questions: 24 });
    expect(weekCheckMeta({ concepts: 1, questions: 3 })).toBe("1 concept · up to 3 questions");
  });

  it("has no week check when the module names no concept it can read", () => {
    const path = modulePath(input({ module: week({ topics: [lesson("m1-t1", [])] }) }));
    expect(path.check).toBeNull();
    expect(pathSequence(path).some((s) => s.kind === "check")).toBe(false);
  });
});
