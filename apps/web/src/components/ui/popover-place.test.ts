import { describe, expect, it } from "vitest";

import { placementParts, popoverOrigin, popoverPlacement, popoverShift } from "./popover-place";

describe("popoverShift", () => {
  it("leaves a popover that fits where it is", () => {
    expect(popoverShift({ triggerLeft: 16, width: 280, viewport: 390 })).toBe(0);
  });

  it("moves a popover left until its right edge is inside the gutter", () => {
    // 200 + 280 = 480, the limit is 390 - 16 = 374: 106 to the left.
    expect(popoverShift({ triggerLeft: 200, width: 280, viewport: 390 })).toBe(-106);
  });

  it("never moves the left edge past the gutter", () => {
    expect(popoverShift({ triggerLeft: 40, width: 400, viewport: 390 })).toBe(-24);
  });
});

describe("popoverPlacement, under the anchor (a filter, a field)", () => {
  const viewport = { width: 1200, height: 800 };
  const at = (top: number, left = 300) => ({ top, bottom: top + 44, left, right: left + 120 });
  const place = (anchor: ReturnType<typeof at>, height: number, cap?: number, width = 300) =>
    popoverPlacement({ anchor, placement: "bottom-start", width, height, cap, viewport });

  it("opens under the anchor when it fits there", () => {
    expect(place(at(100), 200)).toEqual({ top: 152, left: 300, side: "bottom", align: "start", maxHeight: 632 });
  });

  it("flips over the anchor near the bottom of the screen, flush above it", () => {
    expect(place(at(700), 200)).toEqual({ top: 492, left: 300, side: "top", align: "start", maxHeight: 676 });
  });

  it("stays below when below has more room, and lets the list scroll in what there is", () => {
    const placed = place(at(300), 600);
    expect(placed.side).toBe("bottom");
    expect(placed.maxHeight).toBe(432);
  });

  it("sits flush on the anchor when a long list opens above, by the height its cap lets it show", () => {
    expect(place(at(700), 2000, 480)).toEqual({ top: 212, left: 300, side: "top", align: "start", maxHeight: 676 });
  });

  it("shifts left to stay on screen", () => {
    expect(place(at(100, 1000), 100).left).toBe(884);
  });
});

describe("popoverPlacement, the other placements", () => {
  const viewport = { width: 390, height: 800 };

  it("lines a bottom-end popover's right edge up with the anchor's", () => {
    const placed = popoverPlacement({ anchor: { top: 100, bottom: 132, left: 300, right: 360 }, placement: "bottom-end", width: 224, height: 200, viewport });
    expect(placed).toEqual({ top: 140, left: 136, side: "bottom", align: "end", maxHeight: 644 });
  });

  it("moves a bottom-end popover right, not past the gutter, when its anchor is near the left edge", () => {
    // 80 - 224 = -144; it may go right until its left edge is at 16, and its
    // right edge (80 + 160 = 240) is still well inside 374.
    const placed = popoverPlacement({ anchor: { top: 100, bottom: 132, left: 20, right: 80 }, placement: "bottom-end", width: 224, height: 100, viewport });
    expect(placed.left).toBe(16);
  });

  it("opens a top-start popover over its anchor, and flips it under when there is no room above", () => {
    const over = popoverPlacement({ anchor: { top: 700, bottom: 748, left: 11, right: 249 }, placement: "top-start", width: 238, height: 180, viewport });
    // An anchor left of the gutter keeps its own left edge: the shift only ever moves left.
    expect(over).toEqual({ top: 512, left: 11, side: "top", align: "start", maxHeight: 676 });
    const under = popoverPlacement({ anchor: { top: 40, bottom: 88, left: 20, right: 258 }, placement: "top-start", width: 238, height: 180, viewport });
    expect(under.side).toBe("bottom");
    expect(under.top).toBe(96);
  });

  it("puts a right-end popover beside its anchor with the bottoms flush, kept on screen", () => {
    const viewportWide = { width: 1200, height: 800 };
    const placed = popoverPlacement({ anchor: { top: 740, bottom: 788, left: 11, right: 49 }, placement: "right-end", width: 240, height: 180, viewport: viewportWide });
    expect(placed).toEqual({ top: 608, left: 57, side: "right", align: "end", maxHeight: 768 });
    // An anchor whose bottom is near the top: moved down to the gutter.
    const high = popoverPlacement({ anchor: { top: 0, bottom: 48, left: 11, right: 49 }, placement: "right-end", width: 240, height: 180, viewport: viewportWide });
    expect(high.top).toBe(16);
  });

  it("flips a right-end popover to the left when the right has less room", () => {
    const placed = popoverPlacement({ anchor: { top: 400, bottom: 448, left: 1100, right: 1140 }, placement: "right-end", width: 240, height: 100, viewport: { width: 1200, height: 800 } });
    expect(placed.side).toBe("left");
    expect(placed.left).toBe(1100 - 8 - 240);
  });
});

describe("popoverOrigin", () => {
  it("grows from the corner touching the anchor", () => {
    expect(popoverOrigin("bottom", "start")).toBe("origin-top-left");
    expect(popoverOrigin("bottom", "end")).toBe("origin-top-right");
    expect(popoverOrigin("top", "start")).toBe("origin-bottom-left");
    expect(popoverOrigin("right", "end")).toBe("origin-bottom-left");
    expect(popoverOrigin("left", "end")).toBe("origin-bottom-right");
  });

  it("reads the asked-for side and edge off a placement", () => {
    expect(placementParts("right-end")).toEqual({ side: "right", align: "end" });
    expect(placementParts("bottom-start")).toEqual({ side: "bottom", align: "start" });
  });
});
