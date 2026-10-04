import { describe, expect, it } from "vitest";

import type { GraphEdge, GraphNode } from "@/lib/concept-graph";
import { mapLayout } from "@/lib/concept-map";
import {
  LABELS_MIN_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  fitView,
  labelsShown,
  panView,
  scaleOf,
  scopeBox,
  titleFits,
  zoomView,
  type View,
} from "@/lib/map-viewport";

/**
 * Written before `map-viewport.ts`: phase 2 of docs/proposals/knowledge-map.md,
 * the viewer's arithmetic (G2). A view is the SVG viewBox, in map units.
 */

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

describe("fitView", () => {
  it("shows the whole box with padding, at the container's aspect, centred", () => {
    const v = fitView({ x0: 0, y0: 0, x1: 400, y1: 100 }, 2, 20);
    // 440 wide needs 220 high at 2:1, which also covers the padded 140.
    close(v.w, 440);
    close(v.h, 220);
    close(v.x + v.w / 2, 200);
    close(v.y + v.h / 2, 50);
  });

  it("widens a tall box to the container's aspect", () => {
    const v = fitView({ x0: 0, y0: 0, x1: 100, y1: 400 }, 2, 0);
    close(v.h, 400);
    close(v.w, 800);
    close(v.x, -350);
  });

  it("never zooms in past the largest scale for a tiny box", () => {
    const v = fitView({ x0: 10, y0: 10, x1: 12, y1: 12 }, 1.5, 0, 600);
    close(scaleOf(v, 600), MAX_SCALE);
  });
});

describe("zoomView", () => {
  const v: View = { x: 0, y: 0, w: 1000, h: 500 };

  it("keeps the point under the pointer fixed", () => {
    const at = { x: 250, y: 100 };
    const z = zoomView(v, 0.5, at, 1000);
    // The point is the same fraction of the way across before and after.
    close((at.x - z.x) / z.w, (at.x - v.x) / v.w);
    close((at.y - z.y) / z.h, (at.y - v.y) / v.h);
    close(z.w, 500);
    close(z.h, 250);
  });

  it("stays between the smallest and the largest scale", () => {
    expect(scaleOf(zoomView(v, 1e-6, { x: 0, y: 0 }, 1000), 1000)).toBeLessThanOrEqual(MAX_SCALE + 1e-9);
    expect(scaleOf(zoomView(v, 1e6, { x: 0, y: 0 }, 1000), 1000)).toBeGreaterThanOrEqual(MIN_SCALE - 1e-9);
  });
});

describe("panView", () => {
  it("moves the map with the pointer, in screen pixels converted to map units", () => {
    // 1000 units across 500 pixels: a 10 pixel drag right moves the view 20 units left.
    const p = panView({ x: 100, y: 100, w: 1000, h: 500 }, 10, -5, 500);
    expect(p).toEqual({ x: 80, y: 110, w: 1000, h: 500 });
  });
});

describe("labelsShown", () => {
  it("hides the concept labels below the threshold, so a zoomed out map is a set of named regions", () => {
    expect(labelsShown(LABELS_MIN_SCALE)).toBe(true);
    expect(labelsShown(LABELS_MIN_SCALE - 0.01)).toBe(false);
    expect(labelsShown(1)).toBe(true);
  });
});

describe("scopeBox", () => {
  const node = (id: string, courses: string[]): GraphNode => ({ id, title: id, bucket: "untouched", pL: 0.25, courses, domain: "d" });
  const req = (from: string, to: string): GraphEdge => ({ from, to, kind: "requires" });
  // Two CS3230 islands, one CP4284 island, and a concept in no course on the first.
  const nodes = [
    node("cost", []),
    node("big-o", ["cs3230"]),
    node("theta", ["cs3230"]),
    node("dp", ["cs3230"]),
    node("knapsack", ["cs3230"]),
    node("vector", ["cp4284"]),
    node("dot", ["cp4284"]),
  ];
  const edges = [req("cost", "big-o"), req("big-o", "theta"), req("dp", "knapsack"), req("vector", "dot")];
  const layout = mapLayout(nodes, edges);
  const islandOf = (id: string) => layout.islands.find((i) => i.id === layout.islandOf[id])!;
  const contains = (box: { x0: number; y0: number; x1: number; y1: number }, p: { x: number; y: number }) =>
    p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1;

  it("island: the selected concept's island and its title", () => {
    const i = islandOf("theta");
    const b = scopeBox(layout, nodes, edges, "island", "theta");
    expect(b).toEqual({ x0: i.x, y0: i.y - layout.titleHeight, x1: i.x + i.width, y1: i.y + i.height });
  });

  it("course: every island holding a concept of the selected concept's course", () => {
    const b = scopeBox(layout, nodes, edges, "course", "theta");
    for (const id of ["big-o", "theta", "dp", "knapsack", "cost"]) expect(contains(b, layout.positions[id]), id).toBe(true);
    // CS3230's islands pack first and side by side (G7), so CP4284's island lies outside the box.
    expect(contains(b, layout.positions.vector)).toBe(false);
    expect(contains(b, layout.positions.dot)).toBe(false);
  });

  it("course falls back to the island for a concept in no course", () => {
    expect(scopeBox(layout, nodes, edges, "course", "cost")).toEqual(scopeBox(layout, nodes, edges, "island", "cost"));
  });

  it("neighbourhood: the concept, what it needs and what needs it, with room for labels", () => {
    const b = scopeBox(layout, nodes, edges, "neighbourhood", "big-o");
    for (const id of ["cost", "big-o", "theta"]) expect(contains(b, layout.positions[id]), id).toBe(true);
    expect(contains(b, layout.positions.knapsack)).toBe(false);
    // The lowest concept's two lines of label are inside too.
    expect(b.y1).toBeGreaterThanOrEqual(layout.positions.theta.y + 40);
  });

  it("all, or no selection, or an unknown one: the whole map", () => {
    const all = { x0: 0, y0: 0, x1: layout.width, y1: layout.height };
    expect(scopeBox(layout, nodes, edges, "all", "theta")).toEqual(all);
    expect(scopeBox(layout, nodes, edges, "island", null)).toEqual(all);
    expect(scopeBox(layout, nodes, edges, "island", "ghost")).toEqual(all);
  });
});

describe("titleFits", () => {
  it("shows an island's title only when the island is wide enough on screen to hold it", () => {
    // Fit all shrinks small islands to a few pixels; their titles would pile on top of each other.
    expect(titleFits(400, "CP4284, CP4282, CP4285")).toBe(true);
    expect(titleFits(40, "CS3230")).toBe(false);
    expect(titleFits(60, "CS3230")).toBe(true);
  });
});
