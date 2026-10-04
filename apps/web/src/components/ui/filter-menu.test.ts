import { describe, expect, it } from "vitest";

import { fieldPlacement, nextIndexForKey, popoverShift, sectionsOf, triggerText, typeaheadIndex, valueText, type FilterOption } from "./filter-menu";

const TYPES: FilterOption[] = [
  { value: "", label: "All kinds", short: "All" },
  { value: "video", label: "Video", count: 30 },
  { value: "note", label: "Note", count: 32 },
  { value: "captions", label: "Captions", count: 23, section: "Companion files" },
  { value: "chapters", label: "Chapters", count: 23, section: "Companion files" },
];

describe("valueText", () => {
  it("prints the value alone, for a menu beside its own label", () => {
    expect(valueText(TYPES, "video")).toBe("Video");
    expect(valueText(TYPES, "podcast")).toBe("podcast");
  });
});

describe("triggerText", () => {
  it("prints the short form of the default and the label of a pick", () => {
    expect(triggerText("Type", TYPES, "")).toBe("Type: All");
    expect(triggerText("Type", TYPES, "video")).toBe("Type: Video");
  });

  it("prints a value no option has as itself, so a hand-typed URL still says what it filtered", () => {
    expect(triggerText("Type", TYPES, "podcast")).toBe("Type: podcast");
  });
});

describe("sectionsOf", () => {
  it("groups consecutive options by section and keeps their flat index", () => {
    const sections = sectionsOf(TYPES);
    expect(sections.map((s) => s.heading)).toEqual([null, "Companion files"]);
    expect(sections[1].options.map((o) => [o.option.value, o.index])).toEqual([
      ["captions", 3],
      ["chapters", 4],
    ]);
  });
});

describe("nextIndexForKey", () => {
  it("moves with the arrows and stops at the ends", () => {
    expect(nextIndexForKey("ArrowDown", 0, 5)).toBe(1);
    expect(nextIndexForKey("ArrowDown", 4, 5)).toBe(4);
    expect(nextIndexForKey("ArrowUp", 2, 5)).toBe(1);
    expect(nextIndexForKey("ArrowUp", 0, 5)).toBe(0);
  });

  it("starts from an end when nothing is highlighted", () => {
    expect(nextIndexForKey("ArrowDown", -1, 5)).toBe(0);
    expect(nextIndexForKey("ArrowUp", -1, 5)).toBe(4);
  });

  it("jumps with Home and End, and ignores other keys", () => {
    expect(nextIndexForKey("Home", 3, 5)).toBe(0);
    expect(nextIndexForKey("End", 1, 5)).toBe(4);
    expect(nextIndexForKey("a", 1, 5)).toBeNull();
    expect(nextIndexForKey("ArrowDown", 0, 0)).toBeNull();
  });
});

describe("typeaheadIndex", () => {
  const codes = ["All courses", "CP4281", "CS3216", "CS4248", "MA1521"];

  it("moves to the next option starting with a letter, wrapping", () => {
    expect(typeaheadIndex(codes, 0, "c")).toBe(1);
    expect(typeaheadIndex(codes, 1, "c")).toBe(2);
    expect(typeaheadIndex(codes, 3, "c")).toBe(1);
    expect(typeaheadIndex(codes, 4, "a")).toBe(0);
  });

  it("walks the same letter pressed again", () => {
    expect(typeaheadIndex(codes, 1, "cc")).toBe(2);
  });

  it("matches a longer prefix from the current option on", () => {
    expect(typeaheadIndex(codes, 0, "cs4")).toBe(3);
    expect(typeaheadIndex(codes, 3, "cs4")).toBe(3);
    expect(typeaheadIndex(codes, 0, "CS3")).toBe(2);
  });

  it("returns null when nothing matches", () => {
    expect(typeaheadIndex(codes, 0, "z")).toBeNull();
    expect(typeaheadIndex(codes, 0, "")).toBeNull();
    expect(typeaheadIndex([], 0, "a")).toBeNull();
  });
});

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

describe("fieldPlacement", () => {
  const viewport = { width: 1200, height: 800 };

  it("opens under the field when the list fits there", () => {
    expect(fieldPlacement({ trigger: { top: 100, bottom: 144, left: 300 }, width: 300, height: 200, viewport })).toEqual({
      top: 152,
      left: 300,
      above: false,
      maxHeight: 632,
    });
  });

  it("opens over the field near the bottom of the screen, flush above it", () => {
    const at = fieldPlacement({ trigger: { top: 700, bottom: 744, left: 300 }, width: 300, height: 200, viewport });
    expect(at).toEqual({ top: 492, left: 300, above: true, maxHeight: 676 });
  });

  it("stays below when below has more room, and lets the list scroll in what there is", () => {
    const at = fieldPlacement({ trigger: { top: 300, bottom: 344, left: 300 }, width: 300, height: 600, viewport });
    expect(at.above).toBe(false);
    expect(at.maxHeight).toBe(432);
  });

  it("sits flush on the field when a long list opens above, by the height its cap lets it show", () => {
    const at = fieldPlacement({ trigger: { top: 700, bottom: 744, left: 300 }, width: 300, height: 2000, cap: 480, viewport });
    expect(at).toEqual({ top: 212, left: 300, above: true, maxHeight: 676 });
  });

  it("shifts left to stay on screen, as a chip's list does", () => {
    expect(fieldPlacement({ trigger: { top: 100, bottom: 144, left: 1000 }, width: 300, height: 100, viewport }).left).toBe(884);
  });
});
