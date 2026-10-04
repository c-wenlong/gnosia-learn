import { describe, expect, it } from "vitest";

import { layoutGraph, type GraphEdge, type GraphNode } from "@/lib/concept-graph";
import { cachedMapLayout, clusters, crossings, islandTitle, mapLayout } from "@/lib/concept-map";

/**
 * Written before `concept-map.ts` (phase 1 of docs/proposals/knowledge-map.md),
 * from the proposal's G3 and G7, so the tests say what the layout promises
 * rather than what an implementation happened to do.
 */

const node = (id: string, courses: string[] = [], domain: string | null = "d"): GraphNode => ({
  id,
  title: id,
  bucket: "untouched",
  pL: 0.25,
  courses,
  domain,
});
const req = (from: string, to: string): GraphEdge => ({ from, to, kind: "requires" });
const bg = (from: string, to: string): GraphEdge => ({ from, to, kind: "assumes" });

const codes = { cs3230: "CS3230", cp4284: "CP4284", cp4282: "CP4282", cp4285: "CP4285" };

// Three clusters: a CS3230 chain, a mixed CP island, a CS3230 pair, and a loner in no course.
const nodes: GraphNode[] = [
  node("cost", [], "algorithms"),
  node("big-o", ["cs3230"]),
  node("theta", ["cs3230"]),
  node("recurrence", ["cs3230"]),
  node("vector", [], "foundations"),
  node("dot", [], "foundations"),
  node("attention", ["cp4284"]),
  node("splat", ["cp4282"]),
  node("block", ["cp4284"]),
  node("ranker", ["cp4285"]),
  node("dp", ["cs3230"]),
  node("knapsack", ["cs3230"]),
  node("loner", [], "classical-ai"),
];
const edges: GraphEdge[] = [
  req("cost", "big-o"),
  req("big-o", "theta"),
  req("big-o", "recurrence"),
  bg("cost", "recurrence"),
  req("vector", "dot"),
  req("dot", "attention"),
  req("vector", "splat"),
  req("attention", "block"),
  req("block", "ranker"),
  req("dp", "knapsack"),
];

const layout = () => mapLayout(nodes, edges, { courseCodes: codes });


describe("clusters", () => {
  it("splits the graph into its connected components, both kinds of edge joining", () => {
    const found = clusters(nodes, edges).map((c) => [...c].sort());
    expect(found).toHaveLength(4);
    expect(found).toContainEqual(["big-o", "cost", "recurrence", "theta"]);
    expect(found).toContainEqual(["attention", "block", "dot", "ranker", "splat", "vector"]);
    expect(found).toContainEqual(["dp", "knapsack"]);
    expect(found).toContainEqual(["loner"]);
  });

  it("ignores an edge whose end is not a node", () => {
    expect(clusters([node("a"), node("b")], [req("a", "ghost"), req("ghost", "b")])).toHaveLength(2);
  });

  it("is the same whatever order the nodes and edges arrive in", () => {
    const a = clusters(nodes, edges);
    const b = clusters([...nodes].reverse(), [...edges].reverse());
    expect(b).toEqual(a);
  });
});

describe("islandTitle (G7)", () => {
  const byId = new Map(nodes.map((n) => [n.id, n]));

  it("names the course most of the island belongs to, by its code", () => {
    expect(islandTitle(["cost", "big-o", "theta", "recurrence"], byId, codes)).toEqual({ title: "CS3230", key: "cs3230" });
  });

  it("names up to three courses when the island spans several, the largest first", () => {
    const many = [
      ...Array.from({ length: 5 }, (_, i) => node(`a${i}`, ["cp4284"])),
      ...Array.from({ length: 4 }, (_, i) => node(`b${i}`, ["cp4282"])),
      ...Array.from({ length: 3 }, (_, i) => node(`c${i}`, ["cp4285"])),
      ...Array.from({ length: 2 }, (_, i) => node(`d${i}`, ["cs3230"])),
    ];
    const ids = many.map((n) => n.id);
    const title = islandTitle(ids, new Map(many.map((n) => [n.id, n])), codes);
    expect(title).toEqual({ title: "CP4284, CP4282, CP4285", key: "cp4284" });
  });

  it("leaves out a course that holds only one concept of a large island", () => {
    const many = [...Array.from({ length: 9 }, (_, i) => node(`a${i}`, ["cp4284"])), node("x", ["cs3230"])];
    expect(islandTitle(many.map((n) => n.id), new Map(many.map((n) => [n.id, n])), codes).title).toBe("CP4284");
  });

  it("falls back to the folder when no concept is in a course", () => {
    expect(islandTitle(["loner"], byId, codes)).toEqual({ title: "Classical ai, no course", key: "~classical-ai" });
  });

  it("uses the course slug when it has no code", () => {
    expect(islandTitle(["big-o"], byId, {}).title).toBe("cs3230");
  });
});

describe("mapLayout", () => {
  it("places every concept exactly once, inside its own island", () => {
    const l = layout();
    expect(Object.keys(l.positions).sort()).toEqual(nodes.map((n) => n.id).sort());
    for (const island of l.islands) {
      for (const id of island.nodes) {
        const p = l.positions[id];
        expect(l.islandOf[id]).toBe(island.id);
        expect(p.x).toBeGreaterThanOrEqual(island.x);
        expect(p.x).toBeLessThanOrEqual(island.x + island.width);
        expect(p.y).toBeGreaterThanOrEqual(island.y);
        expect(p.y).toBeLessThanOrEqual(island.y + island.height);
      }
    }
  });

  it("gives every island a title, and no two islands overlap", () => {
    const l = layout();
    expect(l.islands).toHaveLength(4);
    for (const i of l.islands) expect(i.title.length).toBeGreaterThan(0);
    for (const a of l.islands) {
      for (const b of l.islands) {
        if (a === b) continue;
        // The title band above each island counts as part of it.
        const apart =
          a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y - l.titleHeight || b.y + b.height <= a.y - l.titleHeight;
        expect(apart, `${a.title} overlaps ${b.title}`).toBe(true);
      }
    }
    expect(l.width).toBeGreaterThanOrEqual(Math.max(...l.islands.map((i) => i.x + i.width)));
    expect(l.height).toBeGreaterThanOrEqual(Math.max(...l.islands.map((i) => i.y + i.height)));
  });

  it("puts every prerequisite above what needs it", () => {
    const l = layout();
    for (const e of l.edges) expect(l.positions[e.from].y, `${e.from} -> ${e.to}`).toBeLessThan(l.positions[e.to].y);
  });

  it("keeps the islands of one course next to each other, the larger course first", () => {
    const order = layout().islands.map((i) => i.key);
    // CS3230 holds 6 concepts over two islands, CP4284's island 6: a tie goes by key.
    const cs = order.map((k, i) => (k === "cs3230" ? i : -1)).filter((i) => i >= 0);
    expect(cs).toHaveLength(2);
    expect(cs[1] - cs[0]).toBe(1);
    // The loner's folder island holds one concept and comes last.
    expect(order.at(-1)).toBe("~classical-ai");
    // Within a course, the larger island first.
    const csIslands = layout().islands.filter((i) => i.key === "cs3230");
    expect(csIslands[0].nodes.length).toBeGreaterThan(csIslands[1].nodes.length);
  });

  it("wraps islands into rows no wider than the limit, unless one island is wider by itself", () => {
    const l = mapLayout(nodes, edges, { courseCodes: codes, maxRowWidth: 300 });
    for (const i of l.islands) {
      const rowmates = l.islands.filter((o) => o.y === i.y);
      const right = Math.max(...rowmates.map((o) => o.x + o.width));
      if (rowmates.length > 1) expect(right).toBeLessThanOrEqual(300);
    }
  });

  it("draws each island's edges transitively reduced", () => {
    // cost -> recurrence (assumes) is implied by cost -> big-o -> recurrence.
    const l = layout();
    expect(l.edges).not.toContainEqual(bg("cost", "recurrence"));
    expect(l.edges).toContainEqual(req("big-o", "recurrence"));
    expect(l.edges).toHaveLength(edges.length - 1);
  });

  it("routes every drawn edge downward from under its prerequisite to above the concept that needs it", () => {
    // s sits on the top layer and c three layers down, so s -> c has to cross the layers between.
    const long = [node("r"), node("a"), node("b"), node("c"), node("d"), node("s")];
    const links = [req("r", "a"), req("a", "b"), req("b", "c"), req("c", "d"), req("s", "c")];
    for (const l of [layout(), mapLayout(long, links)]) {
      for (const e of l.edges) {
        const route = l.routes[`${e.from}>${e.to}>${e.kind}`];
        expect(route, `${e.from} -> ${e.to}`).toBeDefined();
        expect(route.length).toBeGreaterThanOrEqual(2);
        expect(route[0].y).toBeGreaterThan(l.positions[e.from].y);
        expect(route.at(-1)!.y).toBeLessThan(l.positions[e.to].y);
        for (let k = 1; k < route.length; k++) expect(route[k].y).toBeGreaterThanOrEqual(route[k - 1].y - 0.5);
      }
      expect(Object.keys(l.routes)).toHaveLength(l.edges.length);
    }
    // An edge that skips layers bends through them: more than its two ends.
    expect(mapLayout(long, links).routes["s>c>requires"].length).toBeGreaterThan(2);
  });

  it("routes a cycle's back edge upward along its own lane, keeping its bends", () => {
    // c sits two layers below a, so the back edge c -> a has a bend to keep.
    const l = mapLayout([node("a"), node("b"), node("c")], [req("a", "b"), req("b", "c"), req("c", "a")]);
    const back = l.edges.find((e) => l.positions[e.from].y > l.positions[e.to].y);
    expect(back).toBeDefined();
    const route = l.routes[`${back!.from}>${back!.to}>${back!.kind}`];
    expect(route.length).toBeGreaterThanOrEqual(3);
    // It leaves above its source and arrives under its target, moving up all the way.
    expect(route[0].y).toBeLessThan(l.positions[back!.from].y);
    expect(route.at(-1)!.y).toBeGreaterThan(l.positions[back!.to].y);
    for (let k = 1; k < route.length; k++) expect(route[k].y).toBeLessThanOrEqual(route[k - 1].y + 0.5);
  });

  it("makes an island at least as wide as its title, so a long title is never clipped", () => {
    const many = [
      ...Array.from({ length: 2 }, (_, i) => node(`a${i}`, ["cp4284"])),
      ...Array.from({ length: 2 }, (_, i) => node(`b${i}`, ["cp4282"])),
      ...Array.from({ length: 2 }, (_, i) => node(`c${i}`, ["cp4285"])),
    ];
    // A single chain: one concept wide, under a three-course title.
    const chain = many.slice(1).map((n, i) => req(many[i].id, n.id));
    const l = mapLayout(many, chain, { courseCodes: codes });
    expect(l.islands).toHaveLength(1);
    const [island] = l.islands;
    // Equal counts, so the codes come in alphabetical order.
    expect(island.title).toBe("CP4282, CP4284, CP4285");
    expect(island.width).toBeGreaterThanOrEqual(island.title.length * 8.5 + 8);
    // The concepts are centred in the wider island.
    const xs = island.nodes.map((id) => l.positions[id].x);
    expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - (island.x + island.width / 2))).toBeLessThan(2);
  });

  it("survives a cycle, which doctor reports and the map must still draw", () => {
    const l = mapLayout([node("a"), node("b"), node("c")], [req("a", "b"), req("b", "c"), req("c", "a")]);
    expect(Object.keys(l.positions)).toHaveLength(3);
    expect(l.islands).toHaveLength(1);
  });

  it("is empty for an empty graph", () => {
    const l = mapLayout([], []);
    expect(l.islands).toEqual([]);
    expect(l.positions).toEqual({});
  });

  it("returns plain data a server can hand to a client component", () => {
    const l = layout();
    expect(JSON.parse(JSON.stringify(l))).toEqual(l);
  });

  it("is deterministic", () => {
    expect(mapLayout([...nodes].reverse(), [...edges].reverse(), { courseCodes: codes })).toEqual(layout());
  });
});

describe("crossings", () => {
  it("counts pairs of edges whose lines cross, not ones that share an end", () => {
    const pos = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, c: { x: 0, y: 100 }, d: { x: 100, y: 100 } };
    expect(crossings([req("a", "d"), req("b", "c")], pos)).toBe(1);
    expect(crossings([req("a", "c"), req("b", "d")], pos)).toBe(0);
    expect(crossings([req("a", "c"), req("a", "d")], pos)).toBe(0);
  });

  it("is lower for the map than for today's alphabetical rows on a graph the alphabet tangles", () => {
    // Each parent's child sorts to the far side of the row, so alphabetical rows cross every pair.
    // One root keeps it a single island, so the crossings are within one drawing.
    const tangled = [node("r"), node("a1"), node("a2"), node("a3"), node("z1"), node("y2"), node("x3")];
    const links = [req("r", "a1"), req("r", "a2"), req("r", "a3"), req("a1", "z1"), req("a2", "y2"), req("a3", "x3")];
    const today = layoutGraph(tangled, links).positions;
    const before = crossings(links, Object.fromEntries(today));
    const after = crossings(mapLayout(tangled, links).edges, mapLayout(tangled, links).positions);
    expect(before).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
  });
});

describe("cachedMapLayout", () => {
  it("lays a graph out once and hands back the same layout while the graph is unchanged", () => {
    const first = cachedMapLayout(nodes, edges, { courseCodes: codes });
    // Fresh arrays with the same content, and mastery that moved: the layout does not depend on it.
    const again = cachedMapLayout(
      nodes.map((n) => ({ ...n, bucket: "learning" as const, pL: 0.6 })),
      edges.map((e) => ({ ...e })),
      { courseCodes: { ...codes } },
    );
    expect(again).toBe(first);
    expect(again).toEqual(layout());
  });

  it("lays out again when a concept, an edge, a course or a code changes", () => {
    const first = cachedMapLayout(nodes, edges, { courseCodes: codes });
    expect(cachedMapLayout(nodes, edges.slice(1), { courseCodes: codes })).not.toBe(first);
    expect(cachedMapLayout([...nodes, node("new")], edges, { courseCodes: codes })).not.toBe(first);
    expect(cachedMapLayout(nodes.map((n) => (n.id === "dp" ? { ...n, courses: ["cp4284"] } : n)), edges, { courseCodes: codes })).not.toBe(first);
    expect(cachedMapLayout(nodes, edges, { courseCodes: { ...codes, cs3230: "CS3230X" } })).not.toBe(first);
  });
});
