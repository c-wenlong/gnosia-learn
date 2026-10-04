import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The app has four palettes (Classic and Gnosia, each light and dark) and six
 * modes that pick between them (AGENTS.md, "The theme is six modes on two
 * axes"). A colour typed into a component is right in at most one of them, so
 * every colour reads a token from app/globals.css: `bg-ok`, `text-danger`,
 * `var(--border)`. This fails on a hex colour, a functional colour
 * (`rgb(`, `hsl(` ...) or a raw Tailwind palette colour (`red-600`,
 * `bg-slate-50`) in components/ and app/, comments and issue numbers aside.
 * `black` and `white` are not palette colours and are not matched.
 */

const src = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** Each allowance is a path prefix under src, with the reason it may carry a literal. */
const ALLOWED: Array<{ prefix: string; why: string }> = [
  {
    prefix: "app/(site)/",
    why: "the public brand pages (landing, sign-in) draw the Gnosia brand in its own colours, a design decision made outside the app's theme",
  },
  {
    prefix: "components/avatar/sprites.ts",
    why: "pixel art: each familiar is a grid of fixed colours, and its palette is the picture",
  },
];

/**
 * Not allowances, only what is not scanned: `black` and `white` (with or
 * without an opacity) are never matched, which is what the video chrome (the
 * player, the scrubber, a poster's mat and badge) uses over a picture that is
 * the same in every mode.
 */

/**
 * Blank out comments, keeping string literals and line numbers, so an issue
 * number such as "#206" in a comment is not read as a colour.
 */
function stripComments(code: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < code.length) {
    const c = code[i];
    const next = code[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
    } else if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i += 1;
    } else if (c === "/" && next === "/") {
      while (i < code.length && code[i] !== "\n") i += 1;
    } else if (c === "/" && next === "*") {
      const end = code.indexOf("*/", i + 2);
      const stop = end === -1 ? code.length : end + 2;
      out += code.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z_-])/;
const FUNCTIONAL = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/;
const PALETTE_NAMES =
  "slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
// A shade is any palette name and step, with or without a utility before it:
// `text-red-600`, `dark:hover:bg-amber-950/40`, and a bare "red-600" in a map.
const PALETTE = new RegExp(
  `(?<![A-Za-z0-9_])(?:${PALETTE_NAMES})-(?:50|100|200|300|400|500|600|700|800|900|950)(?![A-Za-z0-9_])`,
);

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

function offenders(code: string): string[] {
  return stripComments(code)
    .split("\n")
    .flatMap((line, i) => {
      const hit = line.match(HEX) ?? line.match(FUNCTIONAL) ?? line.match(PALETTE);
      return hit ? [`${i + 1}: ${hit[0]}`] : [];
    });
}

describe("theme tokens", () => {
  it("leaves no hard-coded colour in components or app", () => {
    const found: string[] = [];
    for (const root of ["components", "app"]) {
      for (const path of files(join(src, root))) {
        const rel = relative(src, path).split(sep).join("/");
        if (ALLOWED.some((a) => rel.startsWith(a.prefix))) continue;
        for (const hit of offenders(readFileSync(path, "utf8"))) found.push(`${rel}:${hit}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("names a reason for every allowance, and each still exists", () => {
    for (const { prefix, why } of ALLOWED) {
      expect(why.length).toBeGreaterThan(20);
      expect(statSync(join(src, prefix)).isDirectory() || statSync(join(src, prefix)).isFile()).toBe(true);
    }
  });

  it("recognises what it is meant to catch, and not what it is not", () => {
    for (const bad of [
      'const c = "#f7f6f3";',
      'className="bg-[#111]"',
      'className="text-red-800 dark:text-red-200"',
      'className="hover:text-red-600"',
      'className="border-amber-300/60"',
      'const shade = "red-600";',
      "const tones = { warn: 'amber-500' };",
      "const s = `0 0 0 rgb(0 0 0 / 0.3)`;",
      'style={{ color: "hsl(10 20% 30%)" }}',
    ]) {
      expect(offenders(bad), bad).not.toEqual([]);
    }
    for (const good of [
      "// the card in #206 and #1a2b3c",
      "/* bg-red-600 #fff */",
      'className="bg-black/75 text-white"',
      'className="bg-danger text-[var(--ok-on)] border-warn"',
      'className="bg-diagram-matte text-text2"',
      'accept="image/*"',
      'const id = "item-#12";',
    ]) {
      expect(offenders(good), good).toEqual([]);
    }
  });
});
