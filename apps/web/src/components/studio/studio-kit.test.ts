import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The studio's controls are the kit's, at the studio's density (#359, wave
 * 3). `StudioChrome.tsx` used to export its own `Button`, `ButtonLink`,
 * `Chip` and `ChipLink`, which shadowed the kit's names (a file that wanted
 * both imported the kit's as `KitButton`), drew a 6px box with no focus ring,
 * and dimmed when disabled without the kit's cursor; and the job tiles, the
 * job strip and the tile actions each built the same 28px bordered box by
 * hand. These fail if either comes back.
 */
const src = join(dirname(fileURLToPath(import.meta.url)), "../..");
const STUDIO_DIRS = ["components/studio", "app/(app)/studio"];

function studioSources(): Array<{ path: string; text: string }> {
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
  for (const dir of STUDIO_DIRS) walk(join(src, dir));
  return found;
}

/** The source without its comments, so a doc line naming a class or an old export is not one. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const SHADOWING = ["Button", "ButtonLink", "Chip", "ChipLink"];

/** The kit names a file exports itself: a declaration, or a name in an `export { ... }` list. */
function shadowedExports(text: string): string[] {
  const body = code(text);
  const names = new Set<string>();
  for (const match of body.matchAll(/\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(match[1]);
  }
  for (const match of body.matchAll(/\bexport\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of match[1].split(",")) {
      // `Button`, `Thing as Button`, `type Button`: the exported name is the last word.
      const exported = part.trim().split(/\s+as\s+/).pop()?.replace(/^type\s+/, "").trim();
      if (exported) names.add(exported);
    }
  }
  return SHADOWING.filter((name) => names.has(name));
}

/**
 * Whether a class string is a control's box drawn by hand: a fixed small
 * height, the 6px radius and a 1px border, the shape the studio's own button
 * and its job controls were (`h-7 rounded-md border`). A list row (no border)
 * and a thumbnail's frame (`rounded`, not `rounded-md`) are not.
 */
function handBuiltControl(classes: string): boolean {
  const tokens = new Set(classes.split(/\s+/));
  const height = [...tokens].some((token) => /^h-[5-9]$/.test(token));
  return height && tokens.has("rounded-md") && tokens.has("border");
}

/** Every string literal in a file, each read as one class string. */
function literals(text: string): string[] {
  return [...code(text).matchAll(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g)].map(([literal]) => literal.slice(1, -1));
}

describe("the studio's controls are the kit's", () => {
  it("exports no Button, ButtonLink, Chip or ChipLink of its own", () => {
    const offenders = studioSources()
      .map(({ path, text }) => ({ path, names: shadowedExports(text) }))
      .filter(({ names }) => names.length > 0)
      .map(({ path, names }) => `${path}: ${names.join(", ")}`);
    expect(offenders).toEqual([]);
  });

  it("builds no small bordered control by hand", () => {
    const offenders = studioSources()
      .filter(({ text }) => literals(text).some(handBuiltControl))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("would have caught the old shapes", () => {
    expect(shadowedExports("export function Button() {}")).toEqual(["Button"]);
    expect(shadowedExports("export const ChipLink = () => null;")).toEqual(["ChipLink"]);
    expect(shadowedExports('export { Chip, Thing as ButtonLink } from "./x";')).toEqual(["ButtonLink", "Chip"]);
    expect(shadowedExports("// export function Button() {}\nexport function VideoChangeButton() {}")).toEqual([]);
    // GridJob's Cancel and Dismiss before this guard, and the job strip's.
    expect(
      handBuiltControl(
        "pointer-events-auto inline-flex h-7 shrink-0 items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs",
      ),
    ).toBe(true);
    expect(handBuiltControl("inline-flex h-6 shrink-0 items-center rounded-md border border-[var(--border)] px-2 text-xs")).toBe(true);
    // A list row and a thumbnail's frame are not controls.
    expect(handBuiltControl("relative flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-xs")).toBe(false);
    expect(handBuiltControl("flex h-6 w-12 shrink-0 items-center rounded border border-border")).toBe(false);
  });
});
