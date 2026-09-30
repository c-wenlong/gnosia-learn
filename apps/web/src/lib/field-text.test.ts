import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { FIELD_TEXT } from "@/components/ui/classes";

/**
 * A form field's text is 16px on anything touched.
 *
 * iOS Safari zooms the page when it focuses a field under 16px and leaves it
 * zoomed, which is what the paid measurement of the tutor hand-off found on
 * the @ composer. The size is `FIELD_TEXT` in `components/ui/classes.ts`: 16px
 * by default, the desktop size only with a fine pointer from 768px. A phone
 * held in landscape is wider than 768px, so the pointer, not the width, says
 * "desktop".
 *
 * Two checks. The table itself has no bare size but `text-base`. And no
 * `<input>`, `<textarea>` or `<select>` in the source carries a bare small
 * size of its own (`text-sm`, `text-xs`, `text-[14px]`), which is how the
 * zoom came back the next time someone wrote a field by hand. A field whose
 * class comes from a constant is read through the constant's own literal, so
 * keep the size in `FIELD_TEXT`, not beside it.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_SRC = path.resolve(HERE, "..");

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* sources(full);
    else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) yield full;
  }
}

/** Fields that draw no text, so Safari has nothing to zoom for. */
const NO_TEXT = new Set(["hidden", "checkbox", "radio", "range", "file", "submit", "button", "image", "color"]);

/** The first whole class token with no variant prefix and a size under 16px, if any. */
function small(literal: string): string | undefined {
  return literal.split(/\s+/).find((token) => {
    if (token === "text-xs" || token === "text-sm") return true;
    const px = /^text-\[([0-9.]+)px\]$/.exec(token);
    if (px) return Number(px[1]) < 16;
    const rem = /^text-\[([0-9.]+)rem\]$/.exec(token);
    return rem ? Number(rem[1]) < 1 : false;
  });
}

function literals(node: ts.Node, out: string[]): void {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push(node.text);
  else if (ts.isTemplateExpression(node)) out.push(node.head.text, ...node.templateSpans.map((s) => s.literal.text));
  ts.forEachChild(node, (child) => literals(child, out));
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/** The file an import specifier names, for `@/` and relative imports; undefined for a package. */
function resolveModule(from: string, specifier: string): string | undefined {
  const base = specifier.startsWith("@/")
    ? path.join(WEB_SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(from), specifier)
      : undefined;
  if (base === undefined) return undefined;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      /* try the next extension */
    }
  }
  return undefined;
}

/** The initializer of a `const` named `name` anywhere in `tree`, if there is one. */
function constInit(tree: ts.SourceFile, name: string): ts.Expression | undefined {
  let found: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
      found = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

/** Where an identifier in `tree` is declared: a local `const`, or a named import one module away. */
function declaration(tree: ts.SourceFile, name: string): { tree: ts.SourceFile; init: ts.Expression } | undefined {
  const local = constInit(tree, name);
  if (local) return { tree, init: local };
  for (const statement of tree.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    const element = bindings.elements.find((e) => e.name.text === name);
    if (!element) continue;
    const file = resolveModule(tree.fileName, statement.moduleSpecifier.text);
    if (!file) return undefined;
    const other = parse(file);
    const init = constInit(other, (element.propertyName ?? element.name).text);
    return init ? { tree: other, init } : undefined;
  }
  return undefined;
}

/**
 * Every class literal a field's attributes can produce: the literals written
 * inline, and those of any constant they name, followed through local consts
 * and named imports (Greptile on #245: `fieldClass` and `COMPOSER_TEXT` hid a
 * size from the inline-only read). `FIELD_TEXT` itself is checked by its own
 * test above, so it is not followed.
 */
function fieldLiterals(tree: ts.SourceFile, node: ts.Node, out: string[], seen = new Set<string>()): void {
  literals(node, out);
  const visit = (child: ts.Node) => {
    if (ts.isIdentifier(child) && child.text !== "FIELD_TEXT") {
      const key = `${tree.fileName}#${child.text}`;
      if (!seen.has(key)) {
        seen.add(key);
        const found = declaration(tree, child.text);
        if (found) fieldLiterals(found.tree, found.init, out, seen);
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
}

function attr(element: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return element.attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === name);
}

describe("FIELD_TEXT", () => {
  for (const [name, classes] of Object.entries(FIELD_TEXT)) {
    it(`${name} is 16px with no variant, and smaller only for a fine pointer from md`, () => {
      const tokens = classes.split(/\s+/);
      expect(tokens).toContain("text-base");
      const bare = tokens.filter((t) => !t.includes(":"));
      expect(bare).toEqual(["text-base"]);
      for (const t of tokens.filter((t) => t.includes(":"))) expect(t.startsWith("md:pointer-fine:text-")).toBe(true);
    });
  }
});

describe("form fields in the source", () => {
  it("none sets a bare size under 16px of its own", () => {
    const offenders: string[] = [];
    for (const file of sources(WEB_SRC)) {
      const text = readFileSync(file, "utf8");
      const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = node.tagName.getText();
          if (tag === "input" || tag === "textarea" || tag === "select") {
            const type = attr(node, "type")?.initializer;
            const kind = type !== undefined && ts.isStringLiteral(type) ? type.text : "";
            if (!NO_TEXT.has(kind)) {
              const found: string[] = [];
              fieldLiterals(tree, node, found);
              for (const literal of found) {
                const hit = small(literal);
                if (hit) offenders.push(`${path.relative(WEB_SRC, file)}:${tree.getLineAndCharacterOfPosition(node.getStart()).line + 1} <${tag}> ${hit}`);
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(tree);
    }
    expect(offenders).toEqual([]);
  });

  it("follows a class held in a constant, local or imported", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "field-text-"));
    try {
      writeFileSync(path.join(dir, "sizes.ts"), 'export const SMALL = "text-sm leading-6";\n');
      const file = path.join(dir, "Field.tsx");
      writeFileSync(
        file,
        [
          'import { SMALL } from "./sizes";',
          'const local = "rounded text-xs";',
          "export const A = () => <textarea className={local} />;",
          "export const B = () => <textarea className={SMALL} />;",
        ].join("\n"),
      );
      const tree = parse(file);
      const hits: string[] = [];
      const visit = (node: ts.Node) => {
        if (ts.isJsxSelfClosingElement(node)) {
          const found: string[] = [];
          fieldLiterals(tree, node, found);
          for (const literal of found) {
            const hit = small(literal);
            if (hit) hits.push(hit);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(tree);
      expect(hits).toEqual(["text-xs", "text-sm"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
