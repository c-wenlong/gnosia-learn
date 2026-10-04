import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Every radio group and every tab row is the kit's: `SegmentedControl` for a
 * choice of one (#359 found five drawn by hand, each with its own track, keys
 * and roles), `TabList` for a row that switches panels (Settings had a second
 * copy of `Tabs`' keys). A page that writes its own `role="radiogroup"`,
 * `role="radio"`, `role="tablist"` or `role="tab"` starts that again; a panel
 * (`role="tabpanel"`) is the caller's to draw and is not counted.
 */
const KIT = new Set(["components/ui/SegmentedControl.tsx", "components/ui/TabList.tsx"]);
const HAND_DRAWN = /role=["{]+"?(radiogroup|radio|tablist|tab)"/;

describe("segmented controls and tab rows", () => {
  it("draws no radio group or tab row outside the kit", () => {
    const src = join(dirname(fileURLToPath(import.meta.url)), "../..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) {
          const file = relative(src, path);
          if (!KIT.has(file) && HAND_DRAWN.test(readFileSync(path, "utf8"))) offenders.push(file);
        }
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });

  it("catches each role, and not a panel", () => {
    expect(HAND_DRAWN.test('<div role="radiogroup">')).toBe(true);
    expect(HAND_DRAWN.test('<button role="radio">')).toBe(true);
    expect(HAND_DRAWN.test('<div role="tablist">')).toBe(true);
    expect(HAND_DRAWN.test('<button role="tab" id="x">')).toBe(true);
    expect(HAND_DRAWN.test('<div role={"tab"}>')).toBe(true);
    expect(HAND_DRAWN.test('<div role="tabpanel">')).toBe(false);
    expect(HAND_DRAWN.test('<div role="group">')).toBe(false);
  });
});
