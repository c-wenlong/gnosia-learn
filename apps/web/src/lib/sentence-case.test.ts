import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * No all-caps in the interface (AGENTS.md, "Sentence case, and no label that
 * repeats the page"; the owner's call on 2026-09-29).
 *
 * Titles, eyebrows, labels, badges, table heads and buttons are sentence case.
 * The kit drew small labels as 11/700 uppercase with tracking; they are now
 * `LABEL` in `components/ui/classes.ts`, and this test fails the build of
 * anything that brings the old style back:
 *
 * - an `uppercase` class (any variant, `md:uppercase` included) or a
 *   `[text-transform:uppercase]` arbitrary property in a string in the source;
 * - positive letter-spacing (`tracking-wide`, `tracking-wider`,
 *   `tracking-widest`, `tracking-[0.05em]`), which only ever came with the
 *   capitals; negative tracking on a display heading is fine;
 * - `text-transform: uppercase`, `small-caps` or positive `letter-spacing`
 *   in a stylesheet;
 * - JSX text typed in capitals ("PLANNER"), which no class would catch, and
 *   the same in a string handed to a prop that becomes visible copy or an
 *   accessible name (`label="PLANNER"`, `title`, `placeholder`,
 *   `aria-label`, `alt` and the rest of `COPY_PROPS`), or put in braces as a
 *   child (`{"PLANNER"}`).
 *
 * It reads string literals and JSX text through the TypeScript parser, not
 * the raw file, so a comment explaining the rule does not trip it. An acronym
 * of four letters or fewer ("SVG", "API") is not a shouted word and passes.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_SRC = path.resolve(HERE, "..");

function* files(dir: string, test: (name: string) => boolean): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full, test);
    else if (test(entry.name)) yield full;
  }
}

/**
 * Files the rule does not reach yet, each with the reason and what removes it.
 * An entry is a debt, not a permission, and a file that no longer exists is
 * simply not read.
 */
// Empty: the one entry was the studio's brief form, which chat-first phase 2
// deleted. Add a file here only with its reason and what removes it.
const ALLOWED: Record<string, string> = {};

const isSource = (name: string) => /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts");

/** A class token that uppercases or tracks out, with any variant prefix. */
const CLASS_RULES: { name: string; pattern: RegExp }[] = [
  { name: "uppercase class", pattern: /(?:^|[\s"'`])(?:[\w-]+:)*uppercase(?=$|[\s"'`])/ },
  { name: "text-transform arbitrary property", pattern: /text-transform:\s*uppercase/ },
  { name: "wide tracking", pattern: /(?:^|[\s"'`])(?:[\w-]+:)*tracking-(?:wide|wider|widest)(?=$|[\s"'`])/ },
  { name: "positive arbitrary tracking", pattern: /(?:^|[\s"'`])(?:[\w-]+:)*tracking-\[\+?0?\.\d+(?:em|rem|px)\]/ },
];

/**
 * No lower-case letter, a word of four capitals or more, and five capitals in
 * all: a shouted label ("PLANNER", "WHAT YOU KNOW"), not an acronym ("SVG").
 */
const SHOUTED = /^(?=[^a-z]*$)(?=.*[A-Z]{4})(?=(?:[^A-Z]*[A-Z]){5})[A-Z0-9 ·:&'-]+$/;

/**
 * Props whose string reaches the reader, on screen or through a screen reader.
 * A `className`, an `href` or a `data-*` value is not copy and is not read.
 */
const COPY_PROPS = new Set([
  "label",
  "title",
  "placeholder",
  "aria-label",
  "aria-description",
  "aria-valuetext",
  "alt",
  "heading",
  "headline",
  "subtitle",
  "eyebrow",
  "caption",
  "description",
  "meta",
  "hint",
  "short",
  "sendLabel",
  "disabledReason",
]);

/** The literal text of a string, or of every literal part of a template. */
function literalText(node: ts.Node): string | null {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" ");
  return null;
}

/** Every literal a prop or a braced child can resolve to, through `a ? "B" : "C"` and `a ?? "B"`. */
function literalsOf(node: ts.Expression | undefined): string[] {
  if (node === undefined) return [];
  if (ts.isParenthesizedExpression(node)) return literalsOf(node.expression);
  if (ts.isConditionalExpression(node)) return [...literalsOf(node.whenTrue), ...literalsOf(node.whenFalse)];
  if (ts.isBinaryExpression(node)) return [...literalsOf(node.left), ...literalsOf(node.right)];
  const text = literalText(node);
  return text === null ? [] : [text];
}

type Finding = { file: string; line: number; rule: string; text: string };

function scanSource(file: string, text = readFileSync(file, "utf8")): Finding[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: Finding[] = [];
  const report = (node: ts.Node, rule: string, value: string) =>
    found.push({
      file: path.relative(WEB_SRC, file),
      line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      rule,
      text: value.trim().slice(0, 80),
    });

  const visit = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const value = node.text;
      for (const { name, pattern } of CLASS_RULES) if (pattern.test(value)) report(node, name, value);
    }
    if (ts.isJsxText(node)) {
      const value = node.text.trim();
      if (value !== "" && SHOUTED.test(value)) report(node, "all-caps text", value);
    }
    if (ts.isJsxAttribute(node) && COPY_PROPS.has(node.name.getText(source)) && node.initializer !== undefined) {
      const init = node.initializer;
      const values = ts.isJsxExpression(init) ? literalsOf(init.expression) : literalsOf(init as ts.Expression);
      for (const value of values) {
        if (SHOUTED.test(value.trim())) report(node, `all-caps ${node.name.getText(source)}`, value);
      }
    }
    if (ts.isJsxExpression(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      for (const value of literalsOf(node.expression)) {
        if (SHOUTED.test(value.trim())) report(node, "all-caps text", value);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function scanStylesheet(file: string): Finding[] {
  const found: Finding[] = [];
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      const rule = /text-transform:\s*uppercase/.test(line)
        ? "text-transform: uppercase"
        : /small-caps/.test(line)
          ? "small-caps"
          : /letter-spacing:\s*\+?0?\.\d/.test(line)
            ? "positive letter-spacing"
            : null;
      if (rule !== null) found.push({ file: path.relative(WEB_SRC, file), line: i + 1, rule, text: line.trim() });
    });
  return found;
}

describe("sentence case", () => {
  it("no source file uppercases or tracks out a label", () => {
    const found = [...files(WEB_SRC, isSource)]
      .filter((file) => !(path.relative(WEB_SRC, file) in ALLOWED))
      .flatMap((file) => scanSource(file));
    expect(found).toEqual([]);
  });

  it("no stylesheet uppercases or tracks out text", () => {
    const found = [...files(WEB_SRC, (name) => name.endsWith(".css"))].flatMap(scanStylesheet);
    expect(found).toEqual([]);
  });

  it("catches each shape it is meant to catch", () => {
    for (const bad of [
      "text-[11px] uppercase",
      "md:uppercase text-xs",
      "font-bold tracking-wide",
      "tracking-[0.05em] text-text3",
      "[text-transform:uppercase]",
    ]) {
      expect(CLASS_RULES.some(({ pattern }) => pattern.test(bad)), bad).toBe(true);
    }
    for (const fine of ["tracking-tight", "tracking-[-0.02em]", "text-balance", "not-uppercased-slug"]) {
      expect(CLASS_RULES.some(({ pattern }) => pattern.test(fine)), fine).toBe(false);
    }
    expect(SHOUTED.test("PLANNER")).toBe(true);
    expect(SHOUTED.test("WHAT YOU KNOW")).toBe(true);
    expect(SHOUTED.test("SVG")).toBe(false);
    expect(SHOUTED.test("CS4263")).toBe(false);
    expect(SHOUTED.test("Planner")).toBe(false);

    const rules = (snippet: string) => scanSource(path.join(WEB_SRC, "probe.tsx"), snippet).map((f) => f.rule);
    expect(rules(`const a = <TutorMessage label="PLANNER" />;`)).toEqual(["all-caps label"]);
    expect(rules(`const a = <Input placeholder={"DESCRIBE IT"} />;`)).toEqual(["all-caps placeholder"]);
    expect(rules(`const a = <img alt={wide ? "FULL WIDTH" : "Small"} />;`)).toEqual(["all-caps alt"]);
    expect(rules(`const a = <nav aria-label={\`MAIN MENU \${x}\`} />;`)).toEqual(["all-caps aria-label"]);
    expect(rules(`const a = <p>{"PLANNER"}</p>;`)).toEqual(["all-caps text"]);
    expect(rules(`const a = <p title="SVG" aria-label="Export SVG" className="PLANNER" />;`)).toEqual([]);
  });
});
