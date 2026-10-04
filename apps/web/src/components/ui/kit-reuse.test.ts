import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The owner asked for one look per kind of control and the kit reused over
 * one-offs (2026-10-04). These fail when a hand-drawn copy comes back of
 * something the kit now owns: the focus ring, an accent text link, or a mark
 * that is a `Glyph`.
 */
const src = join(dirname(fileURLToPath(import.meta.url)), "../..");

function sources(): Array<{ path: string; text: string }> {
  const found: Array<{ path: string; text: string }> = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        found.push({ path: relative(src, path), text: readFileSync(path, "utf8") });
      }
    }
  };
  walk(src);
  return found;
}

const KIT = "components/ui/classes.ts";

describe("the kit's controls", () => {
  // Unanchored, so `export const` matches too; any quote, so a template literal does.
  it("declares the focus ring once, in classes.ts", () => {
    const copies = sources()
      .filter(({ path, text }) => path !== KIT && /const \w+\s*=\s*["'`]focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent["'`]/.test(text))
      .map(({ path }) => path);
    expect(copies).toEqual([]);
  });

  it("draws accent text links with linkClasses or TextLink", () => {
    const handRolled = sources()
      .filter(({ path, text }) => path !== KIT && /"[^"]*\btext-accent-text\b[^"]*\bhover:underline\b[^"]*"/.test(text))
      .map(({ path }) => path);
    expect(handRolled).toEqual([]);
  });

  it("takes the close cross and the menu bars from Glyph", () => {
    const drawn = sources()
      .filter(({ path, text }) => !path.endsWith("ui/Glyph.tsx") && /d="(M5 5l10 10M15 5L?\s?5 15|M3\.5 5\.5h13M3\.5 10h13)/.test(text))
      .map(({ path }) => path);
    expect(drawn).toEqual([]);
  });
});
