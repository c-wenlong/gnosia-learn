import { describe, expect, it } from "vitest";

import {
  cullLabels,
  DOT_GAP,
  domainOfConcepts,
  edgeEnds,
  fitTitle,
  GROUP_TITLE,
  groupBox,
  LABEL_MIN_PX,
  LABEL_SIZE,
  labelBaseline,
  labelBox,
  labelFont,
  labelFoot,
  labelRank,
  matchCounts,
  MIN_DRAW_SCALE,
  movedKey,
  neighbours,
  plateLeft,
  titlePlate,
  wrapTitle,
  readMoved,
  TITLE_INSET,
  TITLE_RESERVE,
  TITLE_TOP,
  titleBand,
  titleBaseline,
  titleBox,
  titleFont,
  titleRoom,
  titleWidth,
  toLayoutPoint,
  VIEW_PAD,
  viewBoxFor,
  textEm,
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
  it("frames the whole domain, with a margin, when the titles take the room the layout packed for", () => {
    expect(viewBoxFor(layout, null, {}, TITLE_RESERVE)).toEqual({ x: -VIEW_PAD, y: -VIEW_PAD, width: 400 + 2 * VIEW_PAD, height: 300 + 2 * VIEW_PAD });
  });

  it("starts the frame at the top row's boxes when the titles take less, so no empty strip sits above them", () => {
    // The layout packs each row for the largest band; a smaller one leaves the top row's boxes that much lower.
    const trim = TITLE_RESERVE - GROUP_TITLE;
    expect(viewBoxFor(layout, null)).toEqual({ x: -VIEW_PAD, y: trim - VIEW_PAD, width: 400 + 2 * VIEW_PAD, height: 300 - trim + 2 * VIEW_PAD });
  });

  it("is as wide whatever the title band, so the scale measured from it does not depend on the band", () => {
    for (const topic of [null, "left"]) {
      expect(viewBoxFor(layout, topic, {}, TITLE_RESERVE).width).toBe(viewBoxFor(layout, topic).width);
    }
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
    em: 5.5,
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

  // Found looking at the built app at 390px: a label ending a fraction of a pixel above a title read as touching it.
  it("keeps a label as far from a title as from another label: 2px on screen", () => {
    // The label's box starts 16 units under its dot; the title ends 1 unit above that.
    const title = { x: -10, y: 5, width: 20, height: 10 };
    expect(cullLabels([item("a", 0, 0)], 1, [title]).size).toBe(0);
    expect(cullLabels([item("a", 0, 0)], 1, [{ ...title, y: 3 }]).size).toBe(1);
    // Drawn at twice the size, the 2px is 1 unit.
    expect(cullLabels([item("a", 0, 0)], 2, [{ ...title, y: 4.5 }]).size).toBe(1);
    expect(cullLabels([item("a", 0, 0)], 2, [{ ...title, y: 5.5 }]).size).toBe(0);
  });

  it("culls more as the picture shrinks, since a label keeps its size on screen", () => {
    const row = Array.from({ length: 6 }, (_, i) => item(`c${i}`, i * 128, 0, { em: 8.25 }));
    expect(cullLabels(row, 1).size).toBe(6);
    expect(cullLabels(row, 0.36).size).toBeLessThan(6);
    expect(cullLabels(row, 0.36).size).toBeGreaterThan(0);
  });

  it("answers the same whatever order the items come in", () => {
    const items = Array.from({ length: 30 }, (_, i) =>
      item(`c${String(i).padStart(2, "0")}`, (i % 6) * 90, Math.floor(i / 6) * 70, { dependants: i % 4, em: (8 + (i % 9)) * 0.55, lines: 1 + (i % 2) }),
    );
    const forward = [...cullLabels(items, 0.5)].sort();
    const backward = [...cullLabels([...items].reverse(), 0.5)].sort();
    const shuffled = [...cullLabels([...items].sort((a, b) => (a.dependants * 7 + a.em) % 5 - (b.dependants * 7 + b.em) % 5), 0.5)].sort();
    expect(backward).toEqual(forward);
    expect(shuffled).toEqual(forward);
    expect(forward.length).toBeGreaterThan(0);
    expect(forward.length).toBeLessThan(30);
  });
});

describe("labelBox (D10)", () => {
  it("sits centred under its dot", () => {
    const box = labelBox({ x: 100, y: 50, lines: 1, em: 5.5 }, LABEL_SIZE);
    expect(box.x + box.width / 2).toBeCloseTo(100);
    expect(box.y).toBe(66);
  });

  it("is pushed inside the frame rather than cut by it", () => {
    const frame = { x: 0, y: 0, width: 300, height: 300 };
    const left = labelBox({ x: 5, y: 50, lines: 1, em: 8.25 }, 30, frame);
    expect(left.x).toBe(0);
    const right = labelBox({ x: 295, y: 50, lines: 1, em: 8.25 }, 30, frame);
    expect(right.x + right.width).toBe(300);
  });

  it("is culled against where it is drawn, inside the frame", () => {
    // Two labels at the left edge: pushed in, they collide even though their dots are far apart.
    const frame = { x: 0, y: 0, width: 1000, height: 300 };
    const items: LabelItem[] = [
      { id: "a", x: 0, y: 50, lines: 1, em: 8.25, rank: 6, dependants: 0 },
      { id: "b", x: 90, y: 50, lines: 1, em: 2.2, rank: 6, dependants: 0 },
    ];
    expect(cullLabels(items, 1).size).toBe(2);
    expect([...cullLabels(items, 1, [], frame)]).toEqual(["a"]);
  });
});

/** Written before the review fix on #385: a label's box is as wide as its text is drawn, wide letters included. */
describe("textEm (D10)", () => {
  it("measures a line by its letters, so wide letters take more room than narrow ones", () => {
    expect(textEm("WWW")).toBeGreaterThan(2.8);
    expect(textEm("iii")).toBeLessThan(0.8);
  });

  it("lines each width up with its character, first to last", () => {
    expect(textEm(" ")).toBe(0.25);
    expect(textEm("W")).toBe(0.97);
    expect(textEm("\u2019")).toBe(0.2);
  });

  it("allows for bold, and for a letter it has no width for", () => {
    expect(textEm("Heap", true)).toBeGreaterThan(textEm("Heap"));
    expect(textEm("é")).toBeGreaterThanOrEqual(textEm("e"));
  });

  // Review of #409: a letter of a wide script took the fallback width, short of the full em it is drawn at.
  it("measures a Chinese, Japanese or Korean letter, a full-width form or an emoji as a full em", () => {
    // Measured in the built app with canvas measureText, at 500 and 700: 1.0 em a character for each.
    for (const c of ["\u6f22", "\u306e", "\ub3d9", "\uff21", "\u{1f4da}"]) {
      expect(textEm(c), c).toBeGreaterThanOrEqual(1);
      expect(textEm(c, true), c).toBeGreaterThanOrEqual(1);
    }
    // Accented Latin, Cyrillic and Greek letters keep the fallback, which already covers them (0.54 to 0.58 em).
    expect(textEm("\u00e9")).toBeLessThan(1);
    expect(textEm("\u0434")).toBeLessThan(1);
  });

  it("cuts a title in a wide script to fit, with the fallback no longer undercounting it", () => {
    const title = "\u52d5\u7684\u8a08\u753b\u6cd5\u3068\u5206\u5272\u7d71\u6cbb\u6cd5";
    const font = 31.4;
    const room = 200;
    const cut = fitTitle(title, font, room);
    // Drawn at 1 em a character, the cut title still fits its room.
    expect(([...cut].length - 1) * font + textEm("\u2026", true) * font).toBeLessThanOrEqual(room);
  });

  it("culls two labels of wide letters that a flat allowance per letter would keep", () => {
    const wide = textEm("WWWWWWWW");
    const items: LabelItem[] = [
      { id: "a", x: 0, y: 0, lines: 1, em: wide, rank: 6, dependants: 0 },
      { id: "b", x: 90, y: 0, lines: 1, em: wide, rank: 6, dependants: 0 },
    ];
    expect([...cullLabels(items, 1)]).toEqual(["a"]);
  });
});

/**
 * Written before the topic titles kept their size (D10 of
 * docs/proposals/domain-map.md): a topic's title keeps 11px on screen as a
 * label does, its band grows to hold it, and a title too long for its group at
 * that size ends in an ellipsis rather than running past the group's edge.
 */
describe("topic titles (D10)", () => {
  it("draws a title at the layout size near full size, and at 11px on screen below that", () => {
    expect(titleFont(1)).toBe(LABEL_SIZE);
    expect(titleFont(0.5) * 0.5).toBeCloseTo(LABEL_MIN_PX);
    expect(titleFont(MIN_DRAW_SCALE) * MIN_DRAW_SCALE).toBeCloseTo(LABEL_MIN_PX);
    expect(titleFont(Number.NaN)).toBe(LABEL_SIZE);
    expect(titleFont(0)).toBe(LABEL_SIZE);
  });

  it("stops growing at the smallest the picture is drawn, so it never outgrows the band the layout packed for", () => {
    expect(titleFont(0.1)).toBe(titleFont(MIN_DRAW_SCALE));
    for (const scale of [0.1, MIN_DRAW_SCALE, 0.5, 0.87, 1, 1.15]) {
      expect(titleBand(titleFont(scale))).toBeLessThanOrEqual(TITLE_RESERVE);
    }
    expect(TITLE_RESERVE - titleBand(titleFont(MIN_DRAW_SCALE))).toBeLessThan(1);
  });

  it("keeps today's band at the layout size", () => {
    expect(titleBand(LABEL_SIZE)).toBe(GROUP_TITLE);
    expect(GROUP_TITLE).toBe(22);
  });

  it("puts the baseline so the text's ascent starts at the band's top inset and its descent ends at the band's foot", () => {
    for (const font of [LABEL_SIZE, 20, titleFont(MIN_DRAW_SCALE)]) {
      const box = titleBox({ x: 0, y: 100, width: 400, height: 200 }, "Graphs", font);
      expect(box.y).toBe(100 + TITLE_TOP);
      expect(box.y + box.height).toBeCloseTo(100 + titleBand(font));
      expect(titleBaseline(font)).toBeGreaterThan(TITLE_TOP);
      expect(titleBaseline(font)).toBeLessThan(titleBand(font));
    }
  });

  it("leaves a title that fits whole", () => {
    expect(fitTitle("Sorting", LABEL_SIZE, 200)).toBe("Sorting");
  });

  it("ends a title too long for its room in an ellipsis, keeping as much of it as fits", () => {
    const title = "Recurrence relations for recursive algorithms";
    const font = titleFont(MIN_DRAW_SCALE);
    const room = 120;
    const cut = fitTitle(title, font, room);
    expect(cut.endsWith("\u2026")).toBe(true);
    expect(textEm(cut, true) * font).toBeLessThanOrEqual(room);
    const kept = cut.slice(0, -1);
    expect(title.startsWith(kept)).toBe(true);
    // One more letter would not have fitted.
    const more = title.slice(0, kept.length + 1).trimEnd() + "\u2026";
    expect(textEm(more, true) * font).toBeGreaterThan(room);
    // No space is left before the ellipsis.
    expect(kept).toBe(kept.trimEnd());
  });

  it("draws at least the ellipsis in a room too small for anything", () => {
    expect(fitTitle("Graphs", 30, 1)).toBe("\u2026");
  });

  it("pushes a hover plate inside the frame, and centres one wider than it", () => {
    const frame = { x: -10, y: 0, width: 200, height: 100 };
    expect(plateLeft(50, 60, frame)).toBe(50);
    expect(plateLeft(-40, 60, frame)).toBe(-10);
    expect(plateLeft(170, 60, frame)).toBe(130);
    expect(plateLeft(0, 300, frame)).toBe(-60);
  });

  it("breaks a title into lines that fit and join back to the title", () => {
    const title = "Instruction-level parallelism, overview and revision";
    const font = 12.5;
    for (const max of [60, 120, 200, 2000]) {
      const lines = wrapTitle(title, font, max);
      expect(lines.join("")).toBe(title);
      for (const l of lines) expect(textEm(l.trimEnd(), true) * font).toBeLessThanOrEqual(max);
    }
    expect(wrapTitle(title, font, 2000)).toEqual([title]);
    // A word wider than a line alone is broken by letters.
    const long = wrapTitle("Antidisestablishmentarianism", font, 60);
    expect(long.length).toBeGreaterThan(1);
    expect(long.join("")).toBe("Antidisestablishmentarianism");
  });

  it("plates a cut title whole over its line, and a whole one not at all", () => {
    const title = "Instruction-level parallelism, overview and revision";
    const font = titleFont(MIN_DRAW_SCALE);
    const group = groupBox([{ x: 0, y: 0 }], titleWidth(title), titleBand(font));
    const frame = { x: -500, y: -60, width: 4000, height: 300 };
    expect(titlePlate(group, title, LABEL_SIZE, frame)).toBeNull();
    const narrow = groupBox([{ x: 0, y: 0 }], 40, titleBand(font));
    const plate = titlePlate(narrow, title, font, frame);
    expect(plate).not.toBeNull();
    if (plate === null) return;
    // One line, starting where the title does, over its whole height and as wide as the whole title.
    expect(plate.lines).toEqual([title]);
    expect(plate.textX).toBe(narrow.x + TITLE_INSET);
    expect(plate.baseline).toBe(narrow.y + titleBaseline(font));
    expect(plate.box.y).toBeLessThan(plate.baseline - font * 0.92);
    expect(plate.box.y + plate.box.height).toBeGreaterThan(plate.baseline + font * 0.28);
    expect(plate.box.width).toBeGreaterThanOrEqual(textEm(title, true) * font);
    // In a frame narrower than the title it wraps, each line inside the frame.
    const tight = { x: -500, y: -60, width: 300, height: 300 };
    const wrapped = titlePlate(narrow, title, font, tight);
    expect(wrapped?.lines.length).toBeGreaterThan(1);
    expect(wrapped?.lines.join("")).toBe(title);
    expect(wrapped?.box.x).toBeGreaterThanOrEqual(tight.x);
    expect((wrapped?.box.x ?? 0) + (wrapped?.box.width ?? 0)).toBeLessThanOrEqual(tight.x + tight.width);
  });

  it("makes a group wide enough for its title at the layout size, wide letters included, so a title is cut only when it grows", () => {
    for (const title of ["Sorting", "Asymptotic notation and growth rates", "WWWWWWWWWWWWWWWW", "Memory consistency models"]) {
      const box = groupBox([{ x: 0, y: 0 }], titleWidth(title));
      expect(fitTitle(title, LABEL_SIZE, titleRoom(box))).toBe(title);
    }
  });

  it("keeps the title inside its group's box, clear of the row of concepts under it", () => {
    for (const scale of [1, 0.6, MIN_DRAW_SCALE]) {
      const font = titleFont(scale);
      const band = titleBand(font);
      const dot = { x: 0, y: 0 };
      const group = groupBox([dot], titleWidth("Instruction-level parallelism, overview and revision"), band);
      const box = titleBox(group, "Instruction-level parallelism, overview and revision", font);
      expect(box.x).toBeGreaterThanOrEqual(group.x + TITLE_INSET);
      expect(box.x + box.width).toBeLessThanOrEqual(titleRoom(group) + group.x + TITLE_INSET + 1e-9);
      expect(box.x + box.width).toBeLessThan(group.x + group.width);
      expect(box.y).toBeGreaterThanOrEqual(group.y);
      // The dot's ring sits below the band.
      expect(box.y + box.height).toBeLessThanOrEqual(dot.y - 12);
    }
  });

  it("grows a group's band upward with the title, leaving the concepts where they are", () => {
    const points = [{ x: 0, y: 100 }];
    const small = groupBox(points, 0);
    const large = groupBox(points, 0, TITLE_RESERVE);
    expect(large.y).toBe(small.y - (TITLE_RESERVE - GROUP_TITLE));
    expect(large.y + large.height).toBe(small.y + small.height);
    expect(large.width).toBe(small.width);
  });
});
