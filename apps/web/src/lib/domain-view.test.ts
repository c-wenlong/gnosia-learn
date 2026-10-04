import { describe, expect, it } from "vitest";

import {
  cullLabels,
  DOT_GAP,
  domainOfConcepts,
  edgeEnds,
  groupBox,
  LABEL_MIN_PX,
  LABEL_SIZE,
  labelBaseline,
  labelBox,
  labelFont,
  labelFoot,
  labelRank,
  matchCounts,
  movedKey,
  neighbours,
  readMoved,
  titleWidth,
  toLayoutPoint,
  VIEW_PAD,
  viewBoxFor,
  type LabelItem,
} from "@/lib/domain-view";

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

/** Written before the label culling (D10 of docs/proposals/domain-map.md). */
describe("labelFont (D10)", () => {
  it("draws at the layout size when the picture is drawn near full size", () => {
    expect(labelFont(1)).toBe(LABEL_SIZE);
    expect(labelFont(1.15)).toBe(LABEL_SIZE);
  });

  it("grows in layout units so the label is never under 11px on screen", () => {
    expect(labelFont(0.5) * 0.5).toBeCloseTo(LABEL_MIN_PX);
    expect(labelFont(0.36) * 0.36).toBeCloseTo(LABEL_MIN_PX);
  });

  it("falls back to the layout size for a scale it cannot use", () => {
    expect(labelFont(0)).toBe(LABEL_SIZE);
    expect(labelFont(Number.NaN)).toBe(LABEL_SIZE);
    expect(labelFont(Infinity)).toBe(LABEL_SIZE);
  });

  it("keeps the old geometry exactly at the layout size", () => {
    expect(labelBaseline(LABEL_SIZE, 0)).toBe(28);
    expect(labelBaseline(LABEL_SIZE, 1)).toBe(42);
    expect(labelFoot(1)).toBe(36);
    expect(labelFoot(2)).toBe(50);
    // A label that is not drawn: an edge runs to the dot.
    expect(labelFoot(0)).toBe(DOT_GAP);
  });
});

describe("labelRank (D10)", () => {
  const base = { hover: false, selected: false, related: false, bucket: "untouched" as const, ready: false };
  it("orders hover, selection, the lit, then mastered, learning and ready", () => {
    const ranks = [
      labelRank({ ...base, hover: true }),
      labelRank({ ...base, selected: true }),
      labelRank({ ...base, related: true }),
      labelRank({ ...base, bucket: "mastered" }),
      labelRank({ ...base, bucket: "learning" }),
      labelRank({ ...base, ready: true }),
      labelRank(base),
    ];
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    expect(new Set(ranks).size).toBe(ranks.length);
  });
});

describe("cullLabels (D10)", () => {
  const item = (id: string, x: number, y: number, over: Partial<LabelItem> = {}): LabelItem => ({
    id,
    x,
    y,
    lines: 1,
    chars: 10,
    rank: labelRank({ hover: false, selected: false, related: false, bucket: "untouched", ready: false }),
    dependants: 0,
    ...over,
  });

  it("keeps every label when none overlap", () => {
    const items = [item("a", 0, 0), item("b", 200, 0), item("c", 0, 200)];
    expect([...cullLabels(items, 1)].sort()).toEqual(["a", "b", "c"]);
  });

  it("keeps the higher priority of two overlapping labels", () => {
    const mastered = labelRank({ hover: false, selected: false, related: false, bucket: "mastered", ready: false });
    const items = [item("plain", 0, 0), item("known", 20, 0, { rank: mastered })];
    expect([...cullLabels(items, 1)]).toEqual(["known"]);
  });

  it("breaks a tie by dependants, then by id", () => {
    expect([...cullLabels([item("a", 0, 0), item("b", 20, 0, { dependants: 3 })], 1)]).toEqual(["b"]);
    expect([...cullLabels([item("b", 20, 0), item("a", 0, 0)], 1)]).toEqual(["a"]);
  });

  it("always shows the hovered label, over a dot or another label", () => {
    const hovered = labelRank({ hover: true, selected: false, related: false, bucket: "untouched", ready: false });
    const selected = labelRank({ hover: false, selected: true, related: false, bucket: "untouched", ready: false });
    const items = [item("sel", 0, 0, { rank: selected }), item("hov", 10, 0, { rank: hovered }), item("dot", 0, 40)];
    const shown = cullLabels(items, 1);
    expect(shown.has("hov")).toBe(true);
    expect(shown.has("sel")).toBe(false);
  });

  it("does not draw a label over another concept's dot", () => {
    // b's dot sits where a's label would be drawn; a is the higher priority, and still loses its label.
    const mastered = labelRank({ hover: false, selected: false, related: false, bucket: "mastered", ready: false });
    const items = [item("a", 0, 0, { rank: mastered }), item("b", 0, 30)];
    const shown = cullLabels(items, 1);
    expect(shown.has("a")).toBe(false);
    expect(shown.has("b")).toBe(true);
  });

  it("does not draw a label over a box it is told to keep clear, such as a topic's title", () => {
    expect(cullLabels([item("a", 0, 0)], 1, [{ x: -10, y: 20, width: 20, height: 10 }]).size).toBe(0);
  });

  it("culls more as the picture shrinks, since a label keeps its size on screen", () => {
    const row = Array.from({ length: 6 }, (_, i) => item(`c${i}`, i * 128, 0, { chars: 15 }));
    expect(cullLabels(row, 1).size).toBe(6);
    expect(cullLabels(row, 0.36).size).toBeLessThan(6);
    expect(cullLabels(row, 0.36).size).toBeGreaterThan(0);
  });

  it("answers the same whatever order the items come in", () => {
    const items = Array.from({ length: 30 }, (_, i) =>
      item(`c${String(i).padStart(2, "0")}`, (i % 6) * 90, Math.floor(i / 6) * 70, { dependants: i % 4, chars: 8 + (i % 9), lines: 1 + (i % 2) }),
    );
    const forward = [...cullLabels(items, 0.5)].sort();
    const backward = [...cullLabels([...items].reverse(), 0.5)].sort();
    const shuffled = [...cullLabels([...items].sort((a, b) => (a.dependants * 7 + a.chars) % 5 - (b.dependants * 7 + b.chars) % 5), 0.5)].sort();
    expect(backward).toEqual(forward);
    expect(shuffled).toEqual(forward);
    expect(forward.length).toBeGreaterThan(0);
    expect(forward.length).toBeLessThan(30);
  });
});

describe("labelBox (D10)", () => {
  it("sits centred under its dot", () => {
    const box = labelBox({ x: 100, y: 50, lines: 1, chars: 10 }, LABEL_SIZE);
    expect(box.x + box.width / 2).toBeCloseTo(100);
    expect(box.y).toBe(66);
  });

  it("is pushed inside the frame rather than cut by it", () => {
    const frame = { x: 0, y: 0, width: 300, height: 300 };
    const left = labelBox({ x: 5, y: 50, lines: 1, chars: 15 }, 30, frame);
    expect(left.x).toBe(0);
    const right = labelBox({ x: 295, y: 50, lines: 1, chars: 15 }, 30, frame);
    expect(right.x + right.width).toBe(300);
  });

  it("is culled against where it is drawn, inside the frame", () => {
    // Two labels at the left edge: pushed in, they collide even though their dots are far apart.
    const frame = { x: 0, y: 0, width: 1000, height: 300 };
    const items: LabelItem[] = [
      { id: "a", x: 0, y: 50, lines: 1, chars: 15, rank: 6, dependants: 0 },
      { id: "b", x: 90, y: 50, lines: 1, chars: 4, rank: 6, dependants: 0 },
    ];
    expect(cullLabels(items, 1).size).toBe(2);
    expect([...cullLabels(items, 1, [], frame)]).toEqual(["a"]);
  });
});
