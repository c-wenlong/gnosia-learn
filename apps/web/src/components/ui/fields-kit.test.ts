import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Every fill-in field is the kit's (the owner's call on 2026-10-04, after
 * Settings' dropdowns came out in macOS's style): a `<datalist>` opens a list
 * the platform draws, a raw `<textarea>` or checkbox is a face drawn by hand
 * that drifts from the rest. The kit has `Combobox`, `Textarea` and
 * `Checkbox` for them; only `components/ui/` draws the elements themselves.
 * `select-kit.test.ts` holds the same line for `<select>`.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), "../..");
const KIT = join(SRC, "components", "ui") + sep;

/**
 * Not yet on the kit, each with its reason. The recap form's fields belong
 * to a later wave of the same work, which ports the file whole.
 */
const WAITING = new Set(["components/TopicRecap.tsx"]);

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) yield path;
  }
}

/** `<datalist>`, `<textarea>` and `<input type="checkbox">` in a file's text, as "line <tag>". */
function rawFields(file: string, text: string): string[] {
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText();
      const type = node.attributes.properties.find(
        (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === "type",
      )?.initializer;
      const checkbox = tag === "input" && type !== undefined && ts.isStringLiteral(type) && type.text === "checkbox";
      if (tag === "datalist" || tag === "textarea" || checkbox) {
        found.push(`${tree.getLineAndCharacterOfPosition(node.getStart()).line + 1} <${checkbox ? 'input type="checkbox"' : tag}>`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

describe("fill-in fields", () => {
  it("leaves no <datalist>, raw <textarea> or raw checkbox outside the kit", () => {
    const offenders: string[] = [];
    for (const file of sources(SRC)) {
      const name = relative(SRC, file).split(sep).join("/");
      if (file.startsWith(KIT) || WAITING.has(name)) continue;
      for (const hit of rawFields(file, readFileSync(file, "utf8"))) offenders.push(`${name}:${hit}`);
    }
    expect(offenders).toEqual([]);
  });

  it("finds each of the three, however the tag is written", () => {
    // Read from a string rather than a file: no test writes into the tree.
    const text = [
      "export const A = () => <datalist id='x' />;",
      "export const B = () => <textarea\n  rows={3}\n/>;",
      'export const C = () => <input\n  onChange={() => {}}\n  type="checkbox"\n/>;',
      'export const D = () => <input type="text" />;',
      "export const E = () => <Textarea rows={3} />;",
    ].join("\n");
    expect(rawFields("Fixture.tsx", text)).toEqual(["1 <datalist>", "2 <textarea>", '5 <input type="checkbox">']);
  });

  it("waits only on files that still exist", () => {
    for (const name of WAITING) expect(() => statSync(join(SRC, name))).not.toThrow();
  });
});
