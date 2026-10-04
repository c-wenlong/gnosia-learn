import { describe, expect, it } from "vitest";

import { DOT_GAP, domainOfConcepts, edgeEnds, groupBox, labelFoot, matchCounts, movedKey, neighbours, readMoved, titleWidth, toLayoutPoint, VIEW_PAD, viewBoxFor } from "@/lib/domain-view";

/** Written before the phase 2 additions to `domain-view.ts` (docs/proposals/domain-map.md, D2, D3, D8). */

const layout = {
  width: 400,
  height: 300,
  positions: { a: { x: 80, y: 60 }, b: { x: 80, y: 160 }, c: { x: 300, y: 60 } },
  groups: [
    { topic: "left", title: "Left", concepts: ["a", "b"] },
    { topic: "right", title: "Right", concepts: ["c"] },
  ],
};

describe("viewBoxFor (D2, D3)", () => {
  it("frames the whole domain, with a margin", () => {
    expect(viewBoxFor(layout, null)).toEqual({ x: -VIEW_PAD, y: -VIEW_PAD, width: 400 + 2 * VIEW_PAD, height: 300 + 2 * VIEW_PAD });
  });

  it("frames one topic's group when a topic is open", () => {
    const box = groupBox([layout.positions.a, layout.positions.b], titleWidth("Left"));
    expect(viewBoxFor(layout, "left")).toEqual({
      x: box.x - VIEW_PAD,
      y: box.y - VIEW_PAD,
      width: box.width + 2 * VIEW_PAD,
      height: box.height + 2 * VIEW_PAD,
    });
  });

  it("frames the domain for a topic it does not have", () => {
    expect(viewBoxFor(layout, "nowhere")).toEqual(viewBoxFor(layout, null));
  });

  it("follows concepts that have been moved", () => {
    const moved = { a: { x: 10, y: 400 } };
    const box = viewBoxFor(layout, "left", moved);
    expect(box.y + box.height).toBeGreaterThan(400);
    expect(box.x).toBeLessThan(10);
  });
});

describe("domainOfConcepts and matchCounts (D8)", () => {
  const tree = [
    { slug: "algorithms", concepts: ["a", "b"] },
    { slug: "graphics", concepts: ["c"] },
  ];

  it("looks a concept's domain up", () => {
    expect(domainOfConcepts(tree)).toEqual({ a: "algorithms", b: "algorithms", c: "graphics" });
  });

  it("counts the concepts shown per domain, every domain present", () => {
    expect(matchCounts(tree, new Set(["a", "b"]))).toEqual({ algorithms: 2, graphics: 0 });
  });
});

describe("edgeEnds", () => {
  it("leaves from under the prerequisite's label and arrives above the dot that needs it", () => {
    const [a, b] = edgeEnds({ x: 100, y: 100 }, { x: 100, y: 300 }, 2, 1);
    expect(a).toEqual({ x: 100, y: 100 + labelFoot(2) });
    expect(b).toEqual({ x: 100, y: 300 - DOT_GAP });
  });

  it("goes the other way for an edge that runs upward", () => {
    const [a, b] = edgeEnds({ x: 100, y: 300 }, { x: 100, y: 100 }, 1, 2);
    expect(a).toEqual({ x: 100, y: 300 - DOT_GAP });
    expect(b).toEqual({ x: 100, y: 100 + labelFoot(2) });
  });

  it("joins two dots on one row side to side", () => {
    const [a, b] = edgeEnds({ x: 100, y: 100 }, { x: 300, y: 104 }, 2, 2);
    expect(a).toEqual({ x: 100 + DOT_GAP, y: 100 });
    expect(b).toEqual({ x: 300 - DOT_GAP, y: 104 });
  });
});

describe("neighbours (D5)", () => {
  const edges = [
    { from: "a", to: "b", kind: "requires" as const },
    { from: "b", to: "c", kind: "assumes" as const },
    { from: "d", to: "e", kind: "requires" as const },
  ];
  it("is the concept and every concept one edge away, either way", () => {
    expect([...neighbours(edges, "b")].sort()).toEqual(["a", "b", "c"]);
    expect([...neighbours(edges, "z")]).toEqual(["z"]);
  });
});

describe("toLayoutPoint (D6)", () => {
  it("maps a pointer on the drawn picture to the layout's coordinates", () => {
    const rect = { left: 100, top: 50, width: 400, height: 200 };
    const view = { x: -8, y: -8, width: 800, height: 400 };
    expect(toLayoutPoint(100, 50, rect, view)).toEqual({ x: -8, y: -8 });
    expect(toLayoutPoint(300, 150, rect, view)).toEqual({ x: 392, y: 192 });
  });
});

describe("readMoved (D6)", () => {
  const known = new Set(["a", "b"]);
  it("reads the positions a session saved, for concepts still in the domain", () => {
    expect(readMoved(JSON.stringify({ a: { x: 1, y: 2 }, gone: { x: 3, y: 4 } }), known)).toEqual({ a: { x: 1, y: 2 } });
  });
  it("ignores anything it cannot read", () => {
    expect(readMoved(null, known)).toEqual({});
    expect(readMoved("not json", known)).toEqual({});
    expect(readMoved(JSON.stringify({ a: { x: "1", y: 2 }, b: null }), known)).toEqual({});
    expect(readMoved(JSON.stringify([1, 2]), known)).toEqual({});
  });
  it("keys a domain's saved positions by the domain", () => {
    expect(movedKey("algorithms")).toBe("learn-map:moved:algorithms");
  });
});
