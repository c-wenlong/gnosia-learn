import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { tabKeyIndex } from "./roving";

describe("tabKeyIndex", () => {
  it("steps along a row with Left and Right, wrapping at either end", () => {
    expect(tabKeyIndex("ArrowRight", 0, 3, "horizontal", true)).toBe(1);
    expect(tabKeyIndex("ArrowRight", 2, 3, "horizontal", true)).toBe(0);
    expect(tabKeyIndex("ArrowLeft", 0, 3, "horizontal", true)).toBe(2);
  });

  it("leaves Up and Down to the page on a row, and Left and Right on a column", () => {
    expect(tabKeyIndex("ArrowDown", 0, 3, "horizontal", true)).toBe(-1);
    expect(tabKeyIndex("ArrowUp", 0, 3, "horizontal", true)).toBe(-1);
    expect(tabKeyIndex("ArrowRight", 0, 3, "vertical", true)).toBe(-1);
    expect(tabKeyIndex("ArrowDown", 0, 3, "vertical", true)).toBe(1);
    expect(tabKeyIndex("ArrowUp", 0, 3, "vertical", true)).toBe(2);
  });

  it("takes either pair when the row can be a column", () => {
    expect(tabKeyIndex("ArrowDown", 1, 3, "both", true)).toBe(2);
    expect(tabKeyIndex("ArrowRight", 1, 3, "both", true)).toBe(2);
    expect(tabKeyIndex("ArrowUp", 1, 3, "both", true)).toBe(0);
    expect(tabKeyIndex("ArrowLeft", 1, 3, "both", true)).toBe(0);
  });

  it("goes to the ends on Home and End only when asked, as the tabs pattern does and a radio group does not", () => {
    expect(tabKeyIndex("Home", 2, 4, "horizontal", true)).toBe(0);
    expect(tabKeyIndex("End", 0, 4, "horizontal", true)).toBe(3);
    expect(tabKeyIndex("Home", 2, 4, "both", false)).toBe(-1);
    expect(tabKeyIndex("End", 0, 4, "both", false)).toBe(-1);
  });

  it("ignores every other key, and an empty row", () => {
    expect(tabKeyIndex("Enter", 0, 3, "both", true)).toBe(-1);
    expect(tabKeyIndex("a", 0, 3, "both", true)).toBe(-1);
    expect(tabKeyIndex("ArrowRight", 0, 0, "both", true)).toBe(-1);
  });

  it("is what the tab rows and the theme switch move by", () => {
    const src = join(dirname(fileURLToPath(import.meta.url)), "../..");
    for (const file of ["components/ui/Tabs.tsx", "components/settings/SettingsTabs.tsx", "components/ThemeSwitch.tsx"]) {
      const text = readFileSync(join(src, file), "utf8");
      expect(text, file).toContain("tabKeyIndex(");
      expect(text, file).not.toMatch(/\+ 1\) % |- 1 \+ [a-z.]+\.length\) %/);
    }
  });
});
