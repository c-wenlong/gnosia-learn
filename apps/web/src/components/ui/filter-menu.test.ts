import { describe, expect, it } from "vitest";

import { nextIndexForKey, NO_TYPEAHEAD, sectionsOf, triggerText, TYPEAHEAD_RESET_MS, typeaheadIndex, typeaheadStep, valueText, type FilterOption } from "./filter-menu";

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

describe("typeaheadStep", () => {
  it("adds a key to the prefix within the pause, and starts again after it", () => {
    const c = typeaheadStep(NO_TYPEAHEAD, "c", 5000);
    expect(c).toEqual({ buffer: "c", at: 5000 });
    const cs = typeaheadStep(c, "s", 5000 + TYPEAHEAD_RESET_MS);
    expect(cs).toEqual({ buffer: "cs", at: 5000 + TYPEAHEAD_RESET_MS });
    expect(typeaheadStep(cs, "m", 5001 + 2 * TYPEAHEAD_RESET_MS)).toEqual({ buffer: "m", at: 5001 + 2 * TYPEAHEAD_RESET_MS });
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
