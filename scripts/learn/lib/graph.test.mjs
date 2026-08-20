import { describe, expect, it } from "vitest";
import {
  ancestors,
  buildGraph,
  danglingEdges,
  findCycles,
  frontier,
  planPath,
  summarize,
  topoSort,
  prerequisiteDistances,
} from "./graph.mjs";

const concepts = [
  { id: "arithmetic", title: "Arithmetic", requires: [] },
  { id: "algebra", title: "Algebra", requires: ["arithmetic"] },
  { id: "calculus", title: "Calculus", requires: ["algebra", "limits"] },
  { id: "limits", title: "Limits", requires: ["algebra"] },
  { id: "unrelated", title: "Unrelated", requires: [] },
];

const graph = () => buildGraph(concepts);

const modelWith = (pairs) => ({
  params: { pL0: 0.25 },
  concepts: Object.fromEntries(
    Object.entries(pairs).map(([id, pL]) => [id, { pL, observations: 1, correct: 1 }]),
  ),
});

describe("buildGraph", () => {
  it("indexes nodes and inverts edges into dependents", () => {
    const g = graph();
    expect(g.nodes.size).toBe(5);
    expect(g.dependents.get("algebra")).toEqual(
      expect.arrayContaining(["calculus", "limits"]),
    );
  });

  it("accepts a comma-separated requires string", () => {
    const g = buildGraph([{ id: "x", requires: "a, b" }]);
    expect(g.nodes.get("x").requires).toEqual(["a", "b"]);
  });
});

describe("topoSort", () => {
  it("orders every prerequisite before its dependent", () => {
    const g = graph();
    const { order, incomplete } = topoSort(g);
    expect(incomplete).toBe(false);
    const at = (id) => order.indexOf(id);
    expect(at("arithmetic")).toBeLessThan(at("algebra"));
    expect(at("algebra")).toBeLessThan(at("limits"));
    expect(at("limits")).toBeLessThan(at("calculus"));
  });

  it("is deterministic across runs", () => {
    const a = topoSort(graph()).order;
    const b = topoSort(graph()).order;
    expect(a).toEqual(b);
  });

  it("reports incompleteness when a cycle blocks progress", () => {
    const g = buildGraph([
      { id: "a", requires: ["b"] },
      { id: "b", requires: ["a"] },
    ]);
    expect(topoSort(g).incomplete).toBe(true);
  });
});

describe("findCycles", () => {
  it("finds nothing in an acyclic graph", () => {
    expect(findCycles(graph())).toEqual([]);
  });

  it("detects a two-node cycle", () => {
    const g = buildGraph([
      { id: "a", requires: ["b"] },
      { id: "b", requires: ["a"] },
    ]);
    expect(findCycles(g).length).toBeGreaterThan(0);
  });

  it("detects a longer cycle", () => {
    const g = buildGraph([
      { id: "a", requires: ["c"] },
      { id: "b", requires: ["a"] },
      { id: "c", requires: ["b"] },
    ]);
    const cycles = findCycles(g);
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles[0].length).toBeGreaterThanOrEqual(3);
  });

  it("does not mistake a diamond for a cycle", () => {
    // calculus depends on algebra by two distinct routes.
    expect(findCycles(graph())).toEqual([]);
  });
});

describe("danglingEdges", () => {
  it("reports prerequisites that do not exist", () => {
    const g = buildGraph([{ id: "a", requires: ["ghost"] }]);
    expect(danglingEdges(g)).toEqual([{ from: "a", missing: "ghost" }]);
  });
});

describe("ancestors", () => {
  it("collects the transitive prerequisite closure", () => {
    expect(ancestors(graph(), "calculus").sort()).toEqual([
      "algebra",
      "arithmetic",
      "limits",
    ]);
  });

  it("is empty for a root", () => {
    expect(ancestors(graph(), "arithmetic")).toEqual([]);
  });
});

describe("frontier", () => {
  it("starts at the roots when nothing is known", () => {
    const ids = frontier(graph(), modelWith({})).map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(["arithmetic", "unrelated"]));
    expect(ids).not.toContain("algebra");
  });

  it("advances as prerequisites are mastered", () => {
    const ids = frontier(graph(), modelWith({ arithmetic: 0.99 })).map((f) => f.id);
    expect(ids).toContain("algebra");
    expect(ids).not.toContain("arithmetic");
    expect(ids).not.toContain("calculus");
  });

  it("requires every prerequisite, not just one", () => {
    const model = modelWith({ arithmetic: 0.99, algebra: 0.99 });
    const ids = frontier(graph(), model).map((f) => f.id);
    expect(ids).toContain("limits");
    // calculus still needs limits.
    expect(ids).not.toContain("calculus");
  });

  it("narrows to the goal's dependency cone when a goal is given", () => {
    const ids = frontier(graph(), modelWith({}), { goal: "calculus" }).map((f) => f.id);
    expect(ids).toContain("arithmetic");
    expect(ids).not.toContain("unrelated");
  });

  it("puts the weakest concept first", () => {
    const model = modelWith({ arithmetic: 0.5, unrelated: 0.1 });
    expect(frontier(graph(), model)[0].id).toBe("unrelated");
  });
});

describe("planPath", () => {
  it("returns a prerequisite-ordered path to the goal", () => {
    const plan = planPath(graph(), modelWith({}), "calculus");
    const ids = plan.steps.map((s) => s.id);
    expect(ids).toEqual(["arithmetic", "algebra", "limits", "calculus"]);
    expect(ids).not.toContain("unrelated");
  });

  it("skips what is already mastered", () => {
    const plan = planPath(graph(), modelWith({ arithmetic: 0.99, algebra: 0.99 }), "calculus");
    expect(plan.steps.map((s) => s.id)).toEqual(["limits", "calculus"]);
    expect(plan.skipped).toBe(2);
  });

  it("keeps the goal even when the goal itself is mastered", () => {
    const plan = planPath(graph(), modelWith({ arithmetic: 0.99 }), "arithmetic");
    expect(plan.steps.map((s) => s.id)).toEqual(["arithmetic"]);
  });

  it("throws on an unknown goal", () => {
    expect(() => planPath(graph(), modelWith({}), "nope")).toThrow(/Unknown concept/);
  });
});

describe("summarize", () => {
  it("splits concepts into mastered, learning and untouched", () => {
    const model = {
      params: { pL0: 0.25 },
      concepts: {
        arithmetic: { pL: 0.99, observations: 3 },
        algebra: { pL: 0.6, observations: 2 },
        limits: { pL: 0.25, observations: 0 },
      },
    };
    expect(summarize(graph(), model)).toEqual({
      total: 5,
      mastered: 1,
      learning: 1,
      untouched: 3,
    });
  });
});

describe("prerequisiteDistances", () => {
  // A diamond: two routes from `top` down to `base`.
  const diamond = buildGraph([
    { id: "base", requires: [] },
    { id: "left", requires: ["base"] },
    { id: "right", requires: ["base"] },
    { id: "top", requires: ["left", "right"] },
  ]);

  it("returns each prerequisite exactly once, however many routes reach it", () => {
    const d = prerequisiteDistances(diamond, "top");
    expect([...d.keys()].sort()).toEqual(["base", "left", "right"]);
    expect(d.size).toBe(3);
  });

  it("uses the shortest distance", () => {
    const d = prerequisiteDistances(diamond, "top");
    expect(d.get("left")).toBe(1);
    expect(d.get("right")).toBe(1);
    expect(d.get("base")).toBe(2);
  });

  it("takes the short route when routes differ in length", () => {
    const skew = buildGraph([
      { id: "base", requires: [] },
      { id: "mid", requires: ["base"] },
      { id: "top", requires: ["base", "mid"] },
    ]);
    expect(prerequisiteDistances(skew, "top").get("base")).toBe(1);
  });

  it("excludes the concept itself and ignores dangling prerequisites", () => {
    const d = prerequisiteDistances(diamond, "top");
    expect(d.has("top")).toBe(false);
    const dangling = buildGraph([{ id: "a", requires: ["ghost"] }]);
    expect(prerequisiteDistances(dangling, "a").size).toBe(0);
  });

  it("terminates on a cycle rather than looping forever", () => {
    const cyclic = buildGraph([
      { id: "a", requires: ["b"] },
      { id: "b", requires: ["a"] },
    ]);
    expect([...prerequisiteDistances(cyclic, "a").keys()]).toEqual(["b"]);
  });
});
