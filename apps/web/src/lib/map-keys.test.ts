import { describe, expect, it } from "vitest";

import type { GraphEdge, GraphNode } from "@/lib/concept-graph";
import { mapLayout } from "@/lib/concept-map";
import { firstConcept, keyTarget, mapSummary, readingOrder } from "@/lib/map-keys";

/**
 * Written before `map-keys.ts`: phase 4 of docs/proposals/knowledge-map.md,
 * walking the map with the keyboard. Tab moves between islands, Enter enters
 * one at its first concept, the arrows move from there.
 */

const node = (id: string, courses: string[] = ["cs3230"]): GraphNode => ({
  id,
  title: id,
  bucket: "untouched",
  pL: 0.25,
  courses,
  domain: "d",
});
const req = (from: string, to: string): GraphEdge => ({ from, to, kind: "requires" });

// One island: root on top; a, b, c under it; d under a and b. A second island: x -> y.
const nodes = ["root", "a", "b", "c", "d"].map((id) => node(id)).concat([node("x", ["cp4284"]), node("y", ["cp4284"])]);
const edges = [req("root", "a"), req("root", "b"), req("root", "c"), req("a", "d"), req("b", "d"), req("x", "y")];
const layout = mapLayout(nodes, edges);
const pos = (id: string) => layout.positions[id];

describe("readingOrder", () => {
  it("reads an island's concepts row by row, top to bottom, left to right", () => {
    const order = readingOrder(layout, layout.islandOf.root);
    expect(order[0]).toBe("root");
    expect(order.at(-1)).toBe("d");
    expect([...order].sort()).toEqual(["a", "b", "c", "d", "root"]);
    for (let i = 1; i < order.length; i++) {
      const [p, q] = [pos(order[i - 1]), pos(order[i])];
      expect(q.y > p.y || (q.y === p.y && q.x > p.x)).toBe(true);
    }
  });
});

describe("firstConcept", () => {
  it("is the top left concept of the island", () => {
    expect(firstConcept(layout, layout.islandOf.root)).toBe("root");
    expect(firstConcept(layout, layout.islandOf.x)).toBe("x");
    expect(firstConcept(layout, "nope")).toBeNull();
  });
});

describe("keyTarget", () => {
  it("goes down to a dependant and up to a prerequisite, the nearest across", () => {
    const down = keyTarget(layout, edges, "root", "ArrowDown");
    expect(["a", "b", "c"]).toContain(down);
    // From a, down is d, and up from d is whichever of a and b sits nearer.
    expect(keyTarget(layout, edges, "a", "ArrowDown")).toBe("d");
    const up = keyTarget(layout, edges, "d", "ArrowUp");
    const nearer = Math.abs(pos("a").x - pos("d").x) <= Math.abs(pos("b").x - pos("d").x) ? "a" : "b";
    expect(up).toBe(nearer);
    expect(keyTarget(layout, edges, "a", "ArrowUp")).toBe("root");
  });

  it("stays put at the top or the bottom", () => {
    expect(keyTarget(layout, edges, "root", "ArrowUp")).toBe("root");
    expect(keyTarget(layout, edges, "d", "ArrowDown")).toBe("d");
  });

  it("walks the island in reading order with left and right, so every concept is reachable", () => {
    const island = layout.islandOf.root;
    const order = readingOrder(layout, island);
    const seen = [order[0]];
    let at = order[0];
    for (let i = 0; i < order.length + 2; i++) {
      at = keyTarget(layout, edges, at, "ArrowRight");
      seen.push(at);
    }
    expect(new Set(seen)).toEqual(new Set(order));
    // Right stops at the end and left at the start: neither leaves the island.
    expect(keyTarget(layout, edges, order.at(-1)!, "ArrowRight")).toBe(order.at(-1));
    expect(keyTarget(layout, edges, order[0], "ArrowLeft")).toBe(order[0]);
    expect(keyTarget(layout, edges, order[2], "ArrowLeft")).toBe(order[1]);
  });

  it("never crosses into another island", () => {
    for (const id of ["root", "a", "b", "c", "d"]) {
      for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const) {
        expect(layout.islandOf[keyTarget(layout, edges, id, key)]).toBe(layout.islandOf.root);
      }
    }
  });

  it("answers an unknown concept or key with the concept itself", () => {
    expect(keyTarget(layout, edges, "ghost", "ArrowDown")).toBe("ghost");
    expect(keyTarget(layout, edges, "a", "Home")).toBe("a");
  });
});

describe("mapSummary", () => {
  it("names the islands with their sizes, says how to move, and points to the table", () => {
    const text = mapSummary(layout);
    expect(text).toContain("2 islands");
    for (const i of layout.islands) expect(text).toContain(`${i.title} (${i.nodes.length} concept${i.nodes.length === 1 ? "" : "s"})`);
    expect(text).toMatch(/Tab/);
    expect(text).toMatch(/arrow keys/);
    expect(text).toMatch(/table/i);
  });
});
