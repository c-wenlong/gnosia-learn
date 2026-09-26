import { describe, expect, it } from "vitest";

import {
  assignLayers,
  backlinksOf,
  courseScope,
  defaultSelection,
  dependantsOf,
  layoutGraph,
  neighbourhood,
  reduceEdges,
  wrapLabel,
  type GraphEdge,
  type GraphNode,
} from "@/lib/concept-graph";

const node = (id: string, courses: string[] = [], domain: string | null = "d"): GraphNode => ({
  id,
  title: id.toUpperCase(),
  bucket: "untouched",
  pL: 0.1,
  courses,
  domain,
});

// vector -> dot -> attention -> block, softmax -> attention, block ..> tools (assumes)
const nodes = [
  node("vector", ["cp4284"]),
  node("dot", ["cp4284"]),
  node("softmax", ["cp4284"]),
  node("attention", ["cp4284"]),
  node("block", ["cp4284"]),
  node("tools", ["agents"]),
  node("loner", [], "algorithms"),
  node("other", [], "algorithms"),
];
const edges: GraphEdge[] = [
  { from: "vector", to: "dot", kind: "requires" },
  { from: "dot", to: "attention", kind: "requires" },
  { from: "softmax", to: "attention", kind: "requires" },
  { from: "attention", to: "block", kind: "requires" },
  { from: "block", to: "tools", kind: "assumes" },
];

describe("neighbourhood", () => {
  it("is the concept, what it needs and what needs it, with the edges among them", () => {
    const n = neighbourhood(nodes, edges, "attention");
    expect(n.nodes.map((x) => x.id).sort()).toEqual(["attention", "block", "dot", "softmax"]);
    expect(n.edges).toHaveLength(3);
    // Two hops away is not the neighbourhood.
    expect(n.nodes.some((x) => x.id === "vector")).toBe(false);
  });

  it("includes background edges in both directions", () => {
    expect(neighbourhood(nodes, edges, "block").nodes.map((x) => x.id).sort()).toEqual(["attention", "block", "tools"]);
  });

  it("is empty for an unknown concept", () => {
    expect(neighbourhood(nodes, edges, "nope")).toEqual({ nodes: [], edges: [] });
  });
});

describe("courseScope", () => {
  it("takes every concept sharing a course", () => {
    const s = courseScope(nodes, edges, "dot");
    expect(s.basis).toBe("course");
    expect(s.nodes.map((x) => x.id).sort()).toEqual(["attention", "block", "dot", "softmax", "vector"]);
  });

  it("falls back to the folder for a concept in no course", () => {
    const s = courseScope(nodes, edges, "loner");
    expect(s.basis).toBe("domain");
    expect(s.nodes.map((x) => x.id).sort()).toEqual(["loner", "other"]);
  });

  it("shows the concept alone when it has neither", () => {
    const s = courseScope([node("x", [], null)], [], "x");
    expect(s.basis).toBe("self");
    expect(s.nodes.map((x) => x.id)).toEqual(["x"]);
  });

  it("drops edges a longer path already implies", () => {
    const shortcut: GraphEdge = { from: "vector", to: "attention", kind: "requires" };
    const s = courseScope(nodes, [...edges, shortcut], "dot");
    expect(s.edges).not.toContainEqual(shortcut);
    expect(s.edges).toContainEqual({ from: "dot", to: "attention", kind: "requires" });
  });
});

describe("reduceEdges", () => {
  it("keeps an edge that is the only path", () => {
    expect(reduceEdges(edges)).toEqual(edges);
  });
});

describe("dependants and backlinks", () => {
  it("dependants are the concepts that require this one", () => {
    expect(dependantsOf(edges, "attention")).toEqual(["block"]);
    expect(dependantsOf(edges, "block")).toEqual([]);
    expect(dependantsOf(edges, "block", ["requires", "assumes"])).toEqual(["tools"]);
  });

  it("backlinks read both lists off the concepts, not the edges", () => {
    const concepts = [
      { id: "a", requires: ["x"], assumes: [] },
      { id: "b", requires: [], assumes: ["x"] },
      { id: "c", requires: ["y"], assumes: [] },
      // A self-reference is not a backlink.
      { id: "x", requires: ["x"], assumes: [] },
    ];
    expect(backlinksOf(concepts, "x")).toEqual(["a", "b"]);
    expect(backlinksOf(concepts, "z")).toEqual([]);
  });
});

describe("defaultSelection", () => {
  const now = new Date("2026-09-26T12:00:00Z");
  it("picks the most overdue due concept first", () => {
    const concepts = [
      { id: "later", due: "2026-10-01T00:00:00Z" },
      { id: "recent", due: "2026-09-25T00:00:00Z" },
      { id: "oldest", due: "2026-09-01T00:00:00Z" },
    ];
    expect(defaultSelection(concepts, ["later"], now)).toBe("oldest");
  });

  it("then the first frontier concept, then the first row", () => {
    const concepts = [
      { id: "a", due: null },
      { id: "b", due: "2026-12-01T00:00:00Z" },
    ];
    expect(defaultSelection(concepts, ["ghost", "b"], now)).toBe("b");
    expect(defaultSelection(concepts, [], now)).toBe("a");
    expect(defaultSelection([], [], now)).toBeNull();
  });
});

describe("layout", () => {
  it("puts every prerequisite on a row above what needs it", () => {
    const layers = assignLayers(nodes, edges);
    for (const e of edges) expect(layers.get(e.from)!).toBeLessThan(layers.get(e.to)!);
    const { positions } = layoutGraph(nodes, edges);
    for (const e of edges) expect(positions.get(e.from)!.y).toBeLessThan(positions.get(e.to)!.y);
  });

  it("survives a cycle", () => {
    const cyclic: GraphEdge[] = [
      { from: "a", to: "b", kind: "requires" },
      { from: "b", to: "a", kind: "requires" },
    ];
    expect(assignLayers([{ id: "a" }, { id: "b" }], cyclic).size).toBe(2);
  });

  it("wraps a label to two lines at most", () => {
    expect(wrapLabel("Dot product")).toEqual(["Dot product"]);
    const lines = wrapLabel("Amortised cost and the aggregate method");
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith("…")).toBe(true);
  });
});
