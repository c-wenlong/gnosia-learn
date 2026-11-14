import { describe, expect, it } from "vitest";

import {
  openByDefault,
  revealConcept,
  spineLit,
  spineOf,
  toggleOpen,
  type SpineEdge,
  type SpineGroup,
  type SpineStanding,
} from "@/lib/domain-spine";

/**
 * D12 to D16 of docs/proposals/domain-map.md: the Path layout's maths. The
 * order of the topics, the order of a topic's concepts, the labels for edges
 * that cannot sit on the line, what starts folded and where the view opens.
 */

const g = (topic: string, ...concepts: string[]): SpineGroup => ({ topic, title: topic.toUpperCase(), concepts });
const e = (from: string, to: string): SpineEdge => ({ from, to });
const standing = (spec: Record<string, SpineStanding["bucket"] | "ready">): Map<string, SpineStanding> =>
  new Map(Object.entries(spec).map(([id, v]) => [id, { bucket: v === "ready" ? "untouched" : v, ready: v === "ready" }]));
const topics = (spine: ReturnType<typeof spineOf>) => spine.nodes.map((n) => n.topic);

// Basics feeds Lists and Trees; Sorting needs both Lists and Trees; Extras needs nothing.
const groups = [g("sorting", "s1", "s2"), g("extras", "x1"), g("trees", "t1", "t2"), g("lists", "l1", "l2"), g("basics", "b1")];
const edges = [e("b1", "l1"), e("l1", "l2"), e("b1", "t1"), e("t1", "t2"), e("l2", "s1"), e("t2", "s1"), e("s1", "s2")];

describe("the spine's order", () => {
  it("puts every topic after the topics it needs: by level, the more needed first among equals, then the order given", () => {
    const spine = spineOf(groups, edges, new Map(), "algorithms");
    // Basics and Extras need nothing, and Basics is needed by two. Lists and Trees tie, so Trees (given first) leads.
    expect(topics(spine)).toEqual(["basics", "extras", "trees", "lists", "sorting"]);
    expect(spine.nodes.map((n) => n.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it("is the same whatever order the concepts and the edges arrive in, and asking twice gives one answer", () => {
    const a = spineOf(groups, edges, new Map(), "algorithms");
    const b = spineOf(
      groups.map((x) => ({ ...x, concepts: [...x.concepts].reverse() })),
      [...edges].reverse(),
      new Map(),
      "algorithms",
    );
    expect(b).toEqual(a);
    expect(spineOf(groups, edges, new Map(), "algorithms")).toEqual(a);
  });

  it("orders the topics the graph decides the same when the vocabulary lists them the other way round", () => {
    const spine = spineOf([...groups].reverse(), edges, new Map(), "algorithms");
    const at = (t: string) => topics(spine).indexOf(t);
    expect(at("basics")).toBeLessThan(at("lists"));
    expect(at("basics")).toBeLessThan(at("trees"));
    expect(Math.max(at("lists"), at("trees"))).toBeLessThan(at("sorting"));
  });

  it("breaks a tie by the order the topics came in", () => {
    const spine = spineOf([g("b", "b1"), g("a", "a1"), g("c", "c1")], [], new Map(), "d");
    expect(topics(spine)).toEqual(["b", "a", "c"]);
  });

  it("does not throw on topics that need each other, and keeps both on the same level", () => {
    const loop = [g("a", "a1"), g("b", "b1"), g("c", "c1")];
    const spine = spineOf(loop, [e("a1", "b1"), e("b1", "a1"), e("b1", "c1")], new Map(), "d");
    expect(topics(spine).sort()).toEqual(["a", "b", "c"]);
    // c needs the loop, so it comes after both.
    expect(topics(spine)[2]).toBe("c");
    // Each of the pair needs the other: one of them is labelled as needing a topic further down.
    const [first, second] = spine.nodes;
    expect(first.needs).toEqual([expect.objectContaining({ later: true })]);
    expect(second.needs).toEqual([]);
  });

  it("copes with a topic that needs itself, an empty topic and an empty domain", () => {
    expect(topics(spineOf([g("a", "a1")], [e("a1", "a1")], new Map(), "d"))).toEqual(["a"]);
    const spine = spineOf([g("a"), g("b", "b1")], [], new Map(), "d");
    expect(spine.nodes.find((n) => n.topic === "a")).toMatchObject({ concepts: [], steps: [], done: false });
    expect(spineOf([], [], new Map(), "d")).toEqual({ nodes: [], frontier: null });
  });
});

describe("a topic's branch", () => {
  it("lists concepts by step: each after the ones it needs inside the topic", () => {
    const spine = spineOf(
      [g("t", "d", "c", "b", "a")],
      [e("a", "b"), e("a", "c"), e("b", "d"), e("c", "d")],
      new Map(),
      "x",
    );
    expect(spine.nodes[0].steps).toEqual([["a"], ["b", "c"], ["d"]]);
    expect(spine.nodes[0].concepts).toEqual(["a", "b", "c", "d"]);
  });

  it("puts concepts that need each other in one step, and concepts with no edges in the first", () => {
    const spine = spineOf([g("t", "p", "q", "r", "z")], [e("p", "q"), e("q", "p"), e("q", "r")], new Map(), "x");
    expect(spine.nodes[0].steps).toEqual([["p", "q", "z"], ["r"]]);
  });

  it("ignores edges to concepts outside the topic when it places a concept in its step", () => {
    const spine = spineOf(groups, edges, new Map(), "algorithms");
    const sorting = spine.nodes.find((n) => n.topic === "sorting");
    expect(sorting?.steps).toEqual([["s1"], ["s2"]]);
  });
});

describe("edges that cannot sit on the line", () => {
  it("labels the other topics a node needs, and leaves the one just above it to the line", () => {
    const spine = spineOf(groups, edges, new Map(), "algorithms");
    const node = (t: string) => spine.nodes.find((n) => n.topic === t);
    // Sorting needs Lists and Trees. Lists sits just above it, which the line says; Trees is the label.
    expect(node("sorting")?.needs).toEqual([{ topic: "trees", title: "TREES", later: false }]);
    // A node's single prerequisite directly above it is not a label.
    expect(node("basics")?.needs).toEqual([]);
    expect(node("extras")?.needs).toEqual([]);
  });

  it("lists prerequisites and dependants in other domains, with their domain, and never counts them as joins", () => {
    const spine = spineOf(
      [g("a", "a1"), g("b", "b1")],
      [e("a1", "b1"), e("m1", "a1"), e("b1", "z1"), e("q", "b1")],
      new Map(),
      "algorithms",
      { m1: "math", z1: "ml", q: "algorithms-elsewhere", a1: "algorithms", b1: "algorithms" },
      (slug) => slug.toUpperCase(),
    );
    expect(spine.nodes[0].outside).toEqual([{ id: "m1", domain: "math", kind: "needs" }]);
    expect(spine.nodes[1].outside).toEqual([
      { id: "q", domain: "algorithms-elsewhere", kind: "needs" },
      { id: "z1", domain: "ml", kind: "leads-to" },
    ]);
    // An unknown concept's edge is skipped, and one in this domain is a join, not an outside label.
    const bare = spineOf([g("a", "a1")], [e("ghost", "a1")], new Map(), "algorithms", {});
    expect(bare.nodes[0].outside).toEqual([]);
  });

  it("reads a concept named like an Object.prototype key as unknown, not as a domain", () => {
    const spine = spineOf([g("a", "a1")], [e("constructor", "a1")], new Map(), "algorithms", {});
    expect(spine.nodes[0].outside).toEqual([]);
  });
});

describe("what is mastered, and where the view opens", () => {
  const rows = standing({ b1: "mastered", l1: "mastered", l2: "mastered", t1: "ready", t2: "untouched", s1: "ready", s2: "untouched", x1: "learning" });
  const spine = spineOf(groups, edges, rows, "algorithms");
  const node = (t: string) => spine.nodes.find((n) => n.topic === t) as NonNullable<(typeof spine.nodes)[number]>;

  it("counts mastered and started concepts, and marks a topic done when every concept is mastered", () => {
    expect(node("basics")).toMatchObject({ mastered: 1, started: 1, done: true });
    expect(node("lists")).toMatchObject({ mastered: 2, started: 2, done: true });
    expect(node("trees")).toMatchObject({ mastered: 0, started: 0, done: false, ready: ["t1"] });
    expect(node("extras")).toMatchObject({ mastered: 0, started: 1, done: false });
  });

  it("starts every topic folded whose concepts are all mastered, and no other", () => {
    expect([...openByDefault(spine)].sort()).toEqual(["extras", "sorting", "trees"]);
  });

  it("opens at the first topic, in spine order, holding a concept ready to learn", () => {
    // Trees and Sorting each hold one; the spine reaches Trees first.
    expect(spine.frontier).toBe("trees");
  });

  it("does not count a mastered concept as ready, and has no frontier when nothing is ready", () => {
    const none = spineOf(groups, edges, new Map([["t1", { bucket: "mastered", ready: true }]]), "algorithms");
    expect(none.frontier).toBeNull();
    expect(none.nodes.every((n) => n.ready.length === 0)).toBe(true);
    expect(spineOf(groups, edges, new Map(), "algorithms").frontier).toBeNull();
  });

  it("is not done when it has no concepts", () => {
    expect(spineOf([g("a")], [], new Map(), "d").nodes[0].done).toBe(false);
  });
});

describe("folding", () => {
  const spine = spineOf(groups, edges, standing({ b1: "mastered" }), "algorithms");

  it("opens a folded topic with one press and folds an open one, leaving the original alone", () => {
    const open = openByDefault(spine);
    expect(open.has("basics")).toBe(false);
    const opened = toggleOpen(open, "basics");
    expect(opened.has("basics")).toBe(true);
    expect(open.has("basics")).toBe(false);
    expect(toggleOpen(opened, "basics").has("basics")).toBe(false);
  });

  it("opens the topic holding a chosen concept, and nothing else, so a selection is never hidden", () => {
    const open = openByDefault(spine);
    const next = revealConcept(open, spine, "b1");
    expect(next.has("basics")).toBe(true);
    expect(revealConcept(open, spine, null)).toBe(open);
    expect(revealConcept(open, spine, "nobody")).toBe(open);
    // Already open: the same set comes back, so nothing is redrawn.
    expect(revealConcept(open, spine, "t1")).toBe(open);
  });
});

describe("what stays lit", () => {
  const spine = spineOf(groups, edges, new Map(), "algorithms");
  const none = { hover: null, hoverTopic: null, preview: null };

  it("keeps a hovered concept and its neighbours, before a preview or a topic", () => {
    const lit = spineLit(spine, edges, { hover: "l1", hoverTopic: "trees", preview: new Set(["x1"]) });
    expect([...(lit as Set<string>)].sort()).toEqual(["b1", "l1", "l2"]);
  });

  it("keeps what a legend chip previews, then a hovered topic's concepts, then nothing", () => {
    expect([...(spineLit(spine, edges, { ...none, preview: new Set(["x1"]) }) as Set<string>)]).toEqual(["x1"]);
    expect([...(spineLit(spine, edges, { ...none, hoverTopic: "trees" }) as Set<string>)].sort()).toEqual(["t1", "t2"]);
    expect(spineLit(spine, edges, { ...none, hoverTopic: "nope" })).toBeNull();
    expect(spineLit(spine, edges, none)).toBeNull();
  });
});
