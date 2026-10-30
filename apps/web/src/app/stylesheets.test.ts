import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { RETIRED_TOKENS } from "../../../../eslint-rules/gnosia.mjs";

/**
 * The house rules the lint rules in eslint-rules/gnosia.mjs cannot see,
 * because ESLint reads no stylesheet: no capitals or wide tracking (the
 * owner's call on 2026-09-29), no text under 12px (IMPLEMENTATION.md, "Type
 * roles"), and none of the retired palette aliases declared again.
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

describe("the stylesheets", () => {
  it("are found at all, so a broken walk cannot pass by finding none", () => {
    expect(SHEETS.map(({ file }) => file)).toContain(path.join("app", "globals.css"));
  });

  it("uppercase nothing and track nothing out", () => {
    expect(flagged((line) => /text-transform:\s*uppercase|small-caps|letter-spacing:\s*\+?0?\.\d/.test(line))).toEqual([]);
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
});
