import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CARD_TITLE, CLOSE_TITLE, COLUMN_TITLE, CONCEPT_TITLE, NOTE, PAGE_TITLE, PANEL_TITLE, SECTION_TITLE } from "./classes";

/**
 * The type roles (IMPLEMENTATION.md, "Type roles"): every page title is one of
 * the title constants in `classes.ts`, and no text is drawn under 12px.
 *
 * The audit for #359 found the page title in five sizes (28, 26, 22, 24 and
 * `text-sm`) and 10 and 11px text in seventeen places. Both came from one
 * page copying another's class string and changing it a little; a constant
 * and this test are what stop the copies drifting again.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_SRC = path.resolve(HERE, "../..");

function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else if (/\.(tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      yield full;
    }
  }
}

/** The public site is BRAND.md's, drawn to its own scale, and outside the app's roles. */
const isApp = (rel: string) => !rel.startsWith("app/(site)/");

/**
 * Comments blanked, keeping the line count, so a comment that names the
 * rule (`text-[10px]`, in the studio's own note on its floor) is not a hit.
 */
const withoutComments = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/^(\s*)\/\/.*$/gm, "$1")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (block) => block.replace(/[^\n]/g, " "));

const SOURCES = [...files(WEB_SRC)]
  .map((full) => path.relative(WEB_SRC, full).split(path.sep).join("/"))
  .filter(isApp)
  .map((rel) => ({ rel, text: withoutComments(readFileSync(path.join(WEB_SRC, rel), "utf8")) }));

const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length;

/**
 * Text under 12px that stays, each the exact expression with its reason, so
 * an entry lets that one size through and nothing else in its file. An entry
 * that no longer matches anything is stale and fails too.
 */
const SMALL_ALLOWED: { file: string; found: string; reason: string }[] = [
  {
    file: "components/ConceptGraph.tsx",
    found: "fontSize = compact ? 12 : 11.5",
    reason:
      "the workspace graph's SVG labels are drawn at layout size, and 11.5px is what fits a 16-character line in a 112px column; a graph label may sit at 11px on screen (D10 of docs/proposals/domain-map.md)",
  },
];

/** Every size under 12px in a file: Tailwind's `text-[Npx]` and `text-[Nrem]`, a stylesheet's `font-size`, a literal `fontSize`. */
function smallSizes(text: string): { line: number; found: string }[] {
  const hits: { line: number; found: string }[] = [];
  const patterns: { pattern: RegExp; px: (m: RegExpExecArray) => number }[] = [
    { pattern: /text-\[(\d+(?:\.\d+)?)px\]/g, px: (m) => Number(m[1]) },
    { pattern: /text-\[(\d*\.?\d+)rem\]/g, px: (m) => Number(m[1]) * 16 },
    { pattern: /font-size:\s*(\d+(?:\.\d+)?)px/g, px: (m) => Number(m[1]) },
    // A stylesheet's rem is against the root's 16px. An `em` is against its
    // parent and cannot be judged here: the ones in use (code at 0.85 and
    // 0.9em, a heading's anchor at 0.8em) sit in 15 to 26px prose.
    { pattern: /font-size:\s*(\d*\.?\d+)rem/g, px: (m) => Number(m[1]) * 16 },
    // `fontSize={11}`, `fontSize: 11` and `fontSize = cond ? 12 : 11.5`: every
    // bare number in the expression, but not a factor (`size * 0.3`).
    {
      pattern: /fontSize\s*(?:=\{|:|=)\s*([^;}\n,)]*)/g,
      px: (m) => Math.min(...[...m[1].matchAll(/(?<![*/]\s*)(?<![\w.])(\d+(?:\.\d+)?)(?![\w.]|\s*[*/])/g)].map((n) => Number(n[1])), Infinity),
    },
  ];
  for (const { pattern, px } of patterns) {
    for (const m of text.matchAll(pattern)) {
      if (px(m as RegExpExecArray) < 12) hits.push({ line: lineOf(text, m.index ?? 0), found: m[0].trim() });
    }
  }
  return hits;
}

/** The constants a page title may take; the strings, so an import under another name still counts. */
const TITLE_ROLES = { PAGE_TITLE, CONCEPT_TITLE, CLOSE_TITLE, COLUMN_TITLE };

/**
 * `<h1>`s that take none of the title roles, by file and how many, each on
 * purpose (IMPLEMENTATION.md, "Type roles", exceptions).
 */
const H1_EXCEPTIONS: Record<string, { count: number; reason: string }> = {
  "app/(app)/studio/page.tsx": { count: 1, reason: "the studio home's hero, What shall we make?, at 30 and 40px" },
  "components/session/SessionFocus.tsx": {
    count: 1,
    reason: "a session step's title, 20 and 28 from 768px (hi-fi 05 and 15), a focus title that changes every step",
  },
  "components/review/ReviewSession.tsx": {
    count: 1,
    reason: "Review's question, 20 and 24 from 768px (hi-fi 08 and 14); its close screen takes CLOSE_TITLE",
  },
  "components/library/AssetTitle.tsx": {
    count: 2,
    reason: "the asset page hands it the watch page's title, in the sans at 22 and 24 (#168), or a file name in mono",
  },
  "components/NoteProse.tsx": { count: 1, reason: "a heading inside a note's own Markdown, sized with the prose" },
};

/** Each `<h1 ...>` opening tag in a file, read to its closing `>` outside braces. */
function h1Tags(text: string): { line: number; tag: string }[] {
  const tags: { line: number; tag: string }[] = [];
  for (const m of text.matchAll(/<h1\b/g)) {
    const start = m.index ?? 0;
    let depth = 0;
    let end = start;
    for (; end < text.length; end++) {
      const c = text[end];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    tags.push({ line: lineOf(text, start), tag: text.slice(start, end + 1) });
  }
  return tags;
}

const usesTitleRole = (tag: string) =>
  Object.entries(TITLE_ROLES).some(([name, value]) => tag.includes(name) || tag.includes(value));

describe("type roles", () => {
  it("keeps every role a whole class string with one size", () => {
    for (const role of [PAGE_TITLE, CONCEPT_TITLE, CLOSE_TITLE, COLUMN_TITLE, SECTION_TITLE, CARD_TITLE, PANEL_TITLE, NOTE]) {
      expect(role).toMatch(/\bfont-(sans|display)\b/);
      expect(role).toMatch(/\bleading-/);
      expect(role).toMatch(/\bfont-(normal|semibold|bold)\b/);
      // One base size; a role may step up at a breakpoint, never down.
      expect(role.split(" ").filter((c) => /^text-\[\d+px\]$/.test(c))).toHaveLength(1);
    }
  });

  it("draws no text under 12px outside the allowlist", () => {
    const offenders: string[] = [];
    const used = new Set<(typeof SMALL_ALLOWED)[number]>();
    for (const { rel, text } of SOURCES) {
      for (const hit of smallSizes(text)) {
        const entry = SMALL_ALLOWED.find((e) => e.file === rel && e.found === hit.found);
        if (entry) used.add(entry);
        else offenders.push(`${rel}:${hit.line} ${hit.found}`);
      }
    }
    expect(offenders).toEqual([]);
    // An entry that matched nothing is stale.
    expect(SMALL_ALLOWED.filter((e) => !used.has(e)).map((e) => `${e.file}: ${e.found}`)).toEqual([]);
  });

  it("gives every <h1> a title role or a named exception", () => {
    const counts: Record<string, number> = {};
    const where: string[] = [];
    for (const { rel, text } of SOURCES) {
      if (!rel.endsWith(".tsx")) continue;
      for (const { line, tag } of h1Tags(text)) {
        if (usesTitleRole(tag)) continue;
        counts[rel] = (counts[rel] ?? 0) + 1;
        where.push(`${rel}:${line}`);
      }
    }
    const expected = Object.fromEntries(Object.entries(H1_EXCEPTIONS).map(([rel, { count }]) => [rel, count]));
    expect({ counts, where }).toEqual({ counts: expected, where: expect.any(Array) });
  });

  it("catches the shapes it is meant to", () => {
    expect(smallSizes('<span className="text-[11px]">')).toHaveLength(1);
    expect(smallSizes('<span className="md:text-[10.5px]">')).toHaveLength(1);
    expect(smallSizes('<span className="text-[0.625rem]">')).toHaveLength(1);
    expect(smallSizes("a { font-size: 11px; }")).toHaveLength(1);
    expect(smallSizes("a { font-size: 0.625rem; }")).toHaveLength(1);
    expect(smallSizes("a { font-size: 0.875rem; }")).toHaveLength(0);
    expect(smallSizes("<text fontSize={11} />")).toHaveLength(1);
    expect(smallSizes("const fontSize = compact ? 12 : 11.5;")).toHaveLength(1);
    expect(smallSizes('<span className="text-[12px] text-[1.0625rem] text-[0.8em]">')).toHaveLength(0);
    expect(smallSizes("style={{ fontSize: Math.max(12, Math.round(size * 0.3)) }}")).toHaveLength(0);
    expect(smallSizes("<text fontSize={12.5} />")).toHaveLength(0);
    expect(smallSizes(withoutComments("/** no `text-[10px]` here */\n// nor text-[11px]"))).toHaveLength(0);
    expect(usesTitleRole("<h1 className={cx(PAGE_TITLE, \"mb-3\")}>")).toBe(true);
    expect(usesTitleRole('<h1 className="font-display text-[28px] font-bold">')).toBe(false);
  });
});
