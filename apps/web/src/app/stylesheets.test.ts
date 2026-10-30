import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { RETIRED_TOKENS } from "../../../../eslint-rules/gnosia.mjs";

/**
 * The house rules the lint rules in eslint-rules/gnosia.mjs cannot see,
 * because ESLint reads no stylesheet: no capitals or wide tracking (the
 * owner's call on 2026-09-29), no text under 12px (IMPLEMENTATION.md, "Type
 * roles"), none of the retired palette aliases declared again, and every
 * palette token given a value in every palette block (AGENTS.md, "The theme
 * is six modes").
 */

const WEB_SRC = path.resolve(import.meta.dirname, "..");

function stylesheets(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return stylesheets(full);
    return entry.name.endsWith(".css") ? [full] : [];
  });
}

/** Comments blanked, keeping the line count, so a comment naming a rule is not a hit. */
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "));

const SHEETS = stylesheets(WEB_SRC).map((file) => ({ file: path.relative(WEB_SRC, file), css: withoutComments(readFileSync(file, "utf8")) }));

/** Each line of every stylesheet that `test` flags, as `file:line text`. */
function flagged(test: (line: string) => boolean): string[] {
  return SHEETS.flatMap(({ file, css }) => css.split("\n").flatMap((line, i) => (test(line) ? [`${file}:${i + 1} ${line.trim()}`] : [])));
}

/** `letter-spacing` wider than nothing: a whole unit or a fraction with a nonzero digit. Tightening (a minus) is fine. */
const TRACKED_OUT = /letter-spacing:\s*\+?(?:0*[1-9]|0*\.\d*[1-9])/;

const tracksOut = (line: string) => /text-transform:\s*uppercase|small-caps/.test(line) || TRACKED_OUT.test(line);

/** The four palette blocks: Classic light and dark, Gnosia light and dark. */
const PALETTE = [":root", ".dark", ".gnosia", ".gnosia.dark"] as const;

/**
 * Tokens that do not change with the palette, declared on `:root` alone: the
 * display face and the sidebar row's sizes.
 */
const SHARED = (name: string) => name === "--font-display" || name.startsWith("--shell-row");

/**
 * The custom properties each palette block declares, from the first top-level
 * rule whose selector is exactly that block's. The brand's own `:root` and
 * `.dark` further down globals.css (docs/design/BRAND.md) come later and are
 * not palette blocks.
 */
function paletteBlocks(css: string): Map<string, Set<string>> {
  const blocks = new Map<string, Set<string>>();
  let depth = 0;
  let selector = "";
  let body = "";
  for (const char of css) {
    if (char === "{") {
      if (depth > 0) body += char;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth > 0) body += char;
      else {
        const name = selector.trim();
        if ((PALETTE as readonly string[]).includes(name) && !blocks.has(name)) {
          blocks.set(name, new Set([...body.matchAll(/(?:^|[\s;{])(--[\w-]+)\s*:/g)].map(([, token]) => token)));
        }
        selector = "";
        body = "";
      }
    } else if (depth === 0) {
      selector = char === ";" ? "" : selector + char;
    } else body += char;
  }
  return blocks;
}

/**
 * Each token a palette block is missing, as `<block> lacks <token>`. The
 * palette is every token any of the four blocks declares, the shared ones
 * left out, so a token dropped from `:root` is a gap as well as one a dark
 * block forgot, and `.gnosia.dark` holds everything `.dark` or `.gnosia` does.
 */
function tokenGaps(css: string): string[] {
  const blocks = paletteBlocks(css);
  const missing = PALETTE.filter((name) => !blocks.has(name)).map((name) => `${name} is not there`);
  if (missing.length > 0) return missing;
  const palette = new Set(PALETTE.flatMap((name) => [...blocks.get(name)!]).filter((token) => !SHARED(token)));
  return PALETTE.flatMap((name) =>
    [...palette].filter((token) => !blocks.get(name)!.has(token)).map((token) => `${name} lacks ${token}`),
  );
}

const GLOBALS = SHEETS.find(({ file }) => file === path.join("app", "globals.css"))!.css;

describe("the stylesheets", () => {
  it("are found at all, so a broken walk cannot pass by finding none", () => {
    expect(SHEETS.map(({ file }) => file)).toContain(path.join("app", "globals.css"));
  });

  it("uppercase nothing and track nothing out", () => {
    expect(flagged(tracksOut)).toEqual([]);
  });

  it("count any positive letter-spacing as tracking out, whole units included", () => {
    for (const line of ["letter-spacing: 1px;", "letter-spacing: 0.05em;", "letter-spacing:.1em", "letter-spacing: +2px", "letter-spacing: 10px"]) {
      expect(tracksOut(line), line).toBe(true);
    }
    for (const line of ["letter-spacing: 0;", "letter-spacing: 0px;", "letter-spacing: 0.0em;", "letter-spacing: -0.01em;", "letter-spacing: normal;"]) {
      expect(tracksOut(line), line).toBe(false);
    }
  });

  it("draw no text under 12px", () => {
    // A rem is against the root's 16px. An `em` is against its parent and
    // cannot be judged here: the ones in use sit in 15 to 26px prose.
    const small = (line: string) =>
      [...line.matchAll(/font-size:\s*(\d*\.?\d+)(px|rem)/g)].some(([, size, unit]) => Number(size) * (unit === "rem" ? 16 : 1) < 12);
    expect(flagged(small)).toEqual([]);
  });

  it("declare none of the retired palette aliases (#359)", () => {
    expect(flagged((line) => RETIRED_TOKENS.some((name) => new RegExp(`--${name}\\s*:`).test(line)))).toEqual([]);
  });

  it("give every palette token a value in every palette block (#551)", () => {
    expect(tokenGaps(GLOBALS)).toEqual([]);
  });
});

describe("the palette check", () => {
  it("names a token a dark block left out, and one only Gnosia dark is missing", () => {
    const css = `
      :root { --page: #fff; --ink: #000; --font-display: serif; --shell-row: 2rem; }
      .dark { --page: #111; }
      .gnosia { --page: #faf6ec; --ink: #15283a; }
      .gnosia.dark { --page: #0d1c2b; }
      @media (min-width: 1px) { .dark { --ink: #fff; } }
      .dark { --ink: #fff; }
    `;
    expect(tokenGaps(css)).toEqual([".dark lacks --ink", ".gnosia.dark lacks --ink"]);
  });

  it("names a token dropped from :root that the other blocks still declare", () => {
    const css = `
      :root { --page: #fff; }
      .dark { --page: #111; --violet: #a78bfa; }
      .gnosia { --page: #faf6ec; --violet: #7c3aed; }
      .gnosia.dark { --page: #0d1c2b; --violet: #c4b5fd; }
    `;
    expect(tokenGaps(css)).toEqual([":root lacks --violet"]);
  });

  it("says so when a palette block is missing, rather than passing on nothing", () => {
    expect(tokenGaps(":root { --page: #fff; } .dark { --page: #111; }")).toEqual([".gnosia is not there", ".gnosia.dark is not there"]);
  });
});
