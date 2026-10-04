import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Every dropdown is the kit's (`Select` for a form, `FilterMenu` for a
 * filter). A native `<select>` opens a list the platform draws in its own
 * style, macOS's blue-highlighted menu among them, which is what the owner
 * found in Settings on 2026-10-04.
 */
describe("dropdowns", () => {
  it("leaves no native <select> in the app", () => {
    const src = join(dirname(fileURLToPath(import.meta.url)), "../..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) && /^\s*<select\b/m.test(readFileSync(path, "utf8"))) {
          offenders.push(relative(src, path));
        }
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });
});
