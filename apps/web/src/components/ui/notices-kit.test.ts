import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * A notice, a callout, a banner and a confirm are the kit's (`Notice`,
 * `Callout`, `Banner`, `ConfirmFold`, `InlineConfirm`). An audit on
 * 2026-10-05 found the warn box alone built five ways (radius 8, 12 or 16,
 * bordered or not, padding 12 to 16, 13 or 14px), and a browser `confirm()`
 * left in the recap card after the house rule had removed the others. These
 * fail when either comes back.
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

/**
 * Files another piece of work owns while this guard lands, each with why.
 * Move one onto `Callout` and take it off this list; never add to it.
 */
const NOT_YET: Record<string, string> = {
  "components/workspace/TutorChat.tsx": "another session was rewriting the tutor's chat when the kit landed",
  "components/AgentSession.tsx": "another session was rewriting the agent session when the kit landed",
  "components/workspace/VerdictRow.tsx":
    "the tutor chat's recorded verdict, ok or warn, which Callout has no ok tone for; settled with the tutor chat's own work",
};

/** The source without its comments, so a doc line naming a class is not one. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** The names a binding declares: `confirm`, or each name inside `{ confirm, ...rest }`. */
function boundNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) => (ts.isOmittedExpression(element) ? [] : boundNames(element.name)));
}

/** Whether `scope` itself declares `name`: a parameter, a variable, a function, a class or an import. */
function declares(scope: ts.Node, name: string): boolean {
  if (ts.isFunctionLike(scope) && scope.parameters.some((parameter) => boundNames(parameter.name).includes(name))) return true;
  if (ts.isCatchClause(scope) && scope.variableDeclaration !== undefined) return boundNames(scope.variableDeclaration.name).includes(name);
  if ((ts.isForStatement(scope) || ts.isForInStatement(scope) || ts.isForOfStatement(scope)) && scope.initializer !== undefined && ts.isVariableDeclarationList(scope.initializer)) {
    if (scope.initializer.declarations.some((declaration) => boundNames(declaration.name).includes(name))) return true;
  }
  if (!(ts.isSourceFile(scope) || ts.isBlock(scope) || ts.isModuleBlock(scope) || ts.isCaseClause(scope) || ts.isDefaultClause(scope))) return false;
  return scope.statements.some((statement) => {
    if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.some((d) => boundNames(d.name).includes(name));
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) return statement.name?.text === name;
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (clause?.name?.text === name) return true;
      const bindings = clause?.namedBindings;
      if (bindings !== undefined && ts.isNamespaceImport(bindings)) return bindings.name.text === name;
      return bindings?.elements.some((element) => element.name.text === name) ?? false;
    }
    return false;
  });
}

/**
 * The calls in a file that reach the browser's `confirm()`: through
 * `window`, `globalThis` or `self` (or a chain ending in one), or bare where no scope around the call
 * binds a `confirm` of its own (the learner store's write confirmation is a
 * parameter by that name, and calling it is not a dialog).
 */
const GLOBALS = ["window", "globalThis", "self"];

function browserConfirms(path: string, text: string): number {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let found = 0;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      // `window.confirm`, and any chain ending in a global: `globalThis.window.confirm`.
      if (ts.isPropertyAccessExpression(callee) && callee.name.text === "confirm") {
        const owner = callee.expression;
        const last = ts.isIdentifier(owner) ? owner.text : ts.isPropertyAccessExpression(owner) ? owner.name.text : null;
        if (last !== null && GLOBALS.includes(last)) found++;
      }
      if (ts.isIdentifier(callee) && callee.text === "confirm") {
        let bound = false;
        for (let scope: ts.Node | undefined = node.parent; scope !== undefined && !bound; scope = scope.parent) bound = declares(scope, "confirm");
        if (!bound) found++;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/**
 * Every class expression in a file: each string literal, and each
 * `className={...}` and `cx(...)` whole, so classes split over several
 * literals (`cx("bg-warn-tint", "rounded-xl")`) are read together.
 */
function classExpressions(text: string): string[] {
  const found = [...text.matchAll(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g)].map(([literal]) => literal);
  const balanced = (from: number, open: string, close: string): string => {
    let depth = 0;
    for (let at = from; at < text.length; at++) {
      if (text[at] === open) depth++;
      else if (text[at] === close && --depth === 0) return text.slice(from, at + 1);
    }
    return text.slice(from);
  };
  for (const match of text.matchAll(/className=\{|\bcx\(/g)) {
    const start = match.index + match[0].length - 1;
    found.push(match[0].endsWith("{") ? balanced(start, "{", "}") : balanced(start, "(", ")"));
  }
  return found;
}

const WARN_TINT = /\b(?:bg-warn-tint|bg-\[var\(--warn-bg\)\])/;
/** A box's radius: a pill (`rounded-full`) or a tag (`rounded-sm`) is not a box. */
const BOX_RADIUS = /\brounded-(?:md|lg|xl|2xl|3xl)\b/;
/** A fixed height is a control (a button, a chip), not a box of words. */
const CONTROL_HEIGHT = /(?:^|[\s"'`])h-\d/;
const handBuiltBox = (classes: string) => WARN_TINT.test(classes) && BOX_RADIUS.test(classes) && !CONTROL_HEIGHT.test(classes);

describe("notices and confirms", () => {
  it("asks in place, never through the browser's confirm()", () => {
    const offenders = sources()
      .filter(({ path, text }) => browserConfirms(path, text) > 0)
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("tells the browser's confirm() from a confirm of the file's own, scope by scope", () => {
    const own = "function save(confirm: (x: number) => boolean) { return confirm(1); }";
    expect(browserConfirms("a.ts", own)).toBe(0);
    // A local `confirm` in one function does not cover a call in another.
    expect(browserConfirms("b.ts", `${own}\nfunction drop() { if (confirm("Sure?")) return 1; }`)).toBe(1);
    expect(browserConfirms("c.tsx", "const go = () => window.confirm('Sure?');")).toBe(1);
    expect(browserConfirms("e.ts", "globalThis.window.confirm('Sure?');")).toBe(1);
    expect(browserConfirms("f.ts", "dialog.confirm('Sure?');")).toBe(0);
    expect(browserConfirms("d.ts", "const { confirm } = helpers; confirm(2);")).toBe(0);
  });

  it("draws a warn-tinted box with Callout, not by hand", () => {
    const offenders = sources()
      .filter(({ path }) => !path.startsWith("components/ui/") && !(path in NOT_YET))
      .filter(({ text }) => classExpressions(code(text)).some(handBuiltBox))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("reads classes split over several literals together", () => {
    const split = 'const x = <p className={cx("rounded-xl px-4", ok ? "bg-ok-tint" : "bg-warn-tint")}>no</p>;';
    expect(classExpressions(split).some(handBuiltBox)).toBe(true);
    expect(classExpressions('<span className="rounded-full bg-warn-tint px-3" />').some(handBuiltBox)).toBe(false);
    expect(classExpressions('<button className="inline-flex h-7 rounded-md bg-warn-tint px-2" />').some(handBuiltBox)).toBe(false);
  });
});
