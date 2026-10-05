import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Every class list in the web app is built with `cx`, never by hand.
 *
 * `cx` merges (`class-merge.ts`): of two classes that set the same property
 * under the same variants, only the later stays, so a caller's `className`
 * wins over a component's own. A template string or a `+` only joins, and
 * then Tailwind's stylesheet order decides which of the two wins, whatever
 * order the string has them in. #406 made `cx` merge; this keeps a class list
 * from going around it again.
 *
 * What fails, in any `.ts` or `.tsx` under `apps/web/src` but the tests:
 * a `className` or `*ClassName` attribute or object property whose value is
 * a template string with a `${}` in it, a `+`, or a `.join(...)`; and a
 * variable built that way and then used in a `className` or passed to `cx`
 * in the same file (the studio's blurred `layer`, NoteProse's list `shared`).
 * A template string with nothing interpolated is one literal, and passes.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_SRC = path.resolve(HERE, "../..");

/**
 * Files the rule skips, each with why. Paths are relative to `apps/web/src`.
 * Empty, and meant to stay that way: a class list that truly cannot go
 * through `cx` is listed here with the reason.
 */
const EXCEPTIONS: Record<string, string> = {};

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* sources(full);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) yield full;
  }
}

const isClassName = (name: string) => name === "className" || name.endsWith("ClassName");

function unwrap(node: ts.Expression): ts.Expression {
  let at = node;
  while (ts.isParenthesizedExpression(at) || ts.isAsExpression(at) || ts.isSatisfiesExpression(at)) at = at.expression;
  return at;
}

/**
 * Why an expression is a class list built by hand, or undefined when it is
 * not one. Each branch of a `? :` and the value side of `&&`, `||` and `??`
 * is a class list of its own, so each is read too.
 */
function handBuilt(node: ts.Expression): string | undefined {
  const at = unwrap(node);
  if (ts.isConditionalExpression(at)) return handBuilt(at.whenTrue) ?? handBuilt(at.whenFalse);
  if (ts.isBinaryExpression(at)) {
    const op = at.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return handBuilt(at.right);
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
      return handBuilt(at.left) ?? handBuilt(at.right);
    }
  }
  if (ts.isTemplateExpression(at)) return "a template string";
  if (ts.isBinaryExpression(at) && at.operatorToken.kind === ts.SyntaxKind.PlusToken) return "a `+`";
  if (ts.isCallExpression(at) && ts.isPropertyAccessExpression(at.expression) && at.expression.name.text === "join") {
    return "a `.join`";
  }
  return undefined;
}

function propertyName(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
}

/** Every hand-built class list in one source, as `line: what`. */
function handBuiltClassLists(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const at = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  // Names read inside a className or a `cx(...)`, to catch a variable built by hand and used there.
  const classNames = new Set<string>();
  const built = new Map<string, { line: number; how: string }>();

  // Only where a name is the value that lands in the list: a branch of `? :`,
  // the right of `&&`, either side of `||` and `??`, and an argument of a call
  // whose result is the list (`cx`, a kit helper such as `buttonClasses({
  // className })`, or any helper of the caller's own), object arguments'
  // values included. A name tested in a condition (`resume === null ? ROW :
  // ROW_TWO_LINE`) is not a class list, so its own value is never read as one.
  const collect = (node: ts.Expression): void => {
    const at = unwrap(node);
    if (ts.isIdentifier(at)) classNames.add(at.text);
    else if (ts.isConditionalExpression(at)) [at.whenTrue, at.whenFalse].forEach(collect);
    else if (ts.isBinaryExpression(at)) {
      const op = at.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) collect(at.right);
      else if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.PlusToken) {
        collect(at.left);
        collect(at.right);
      }
    } else if (ts.isTemplateExpression(at)) at.templateSpans.forEach((span) => collect(span.expression));
    else if (ts.isArrayLiteralExpression(at)) at.elements.forEach(collect);
    else if (ts.isSpreadElement(at)) collect(at.expression);
    else if (ts.isCallExpression(at)) at.arguments.forEach(collect);
    else if (ts.isObjectLiteralExpression(at)) {
      for (const property of at.properties) {
        if (ts.isPropertyAssignment(property)) collect(property.initializer);
        else if (ts.isShorthandPropertyAssignment(property)) classNames.add(property.name.text);
      }
    }
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && isClassName(node.name.getText(source)) && node.initializer !== undefined) {
      const value = ts.isJsxExpression(node.initializer) ? node.initializer.expression : undefined;
      if (value !== undefined) {
        const how = handBuilt(value);
        if (how !== undefined) found.push(`${at(node)}: ${node.name.getText(source)} is ${how}`);
        collect(value);
      }
    } else if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node.name);
      if (name !== undefined && isClassName(name)) {
        const how = handBuilt(node.initializer);
        if (how !== undefined) found.push(`${at(node)}: ${name} is ${how}`);
        collect(node.initializer);
      }
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "cx") {
      node.arguments.forEach(collect);
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
      const how = handBuilt(node.initializer);
      if (how !== undefined) built.set(node.name.text, { line: at(node), how });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  for (const [name, { line, how }] of built) {
    if (classNames.has(name)) found.push(`${line}: ${name}, used as a class list, is ${how}`);
  }
  return found.sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
}

describe("class lists", () => {
  it("are built with cx everywhere in the web app", () => {
    const offenders: string[] = [];
    for (const file of sources(WEB_SRC)) {
      const relative = path.relative(WEB_SRC, file).split(path.sep).join("/");
      if (relative in EXCEPTIONS) continue;
      for (const hit of handBuiltClassLists(file, readFileSync(file, "utf8"))) offenders.push(`${relative}:${hit}`);
    }
    expect(offenders).toEqual([]);
  });

  it("names a reason for every exception, and each one is a file that exists", () => {
    for (const [file, reason] of Object.entries(EXCEPTIONS)) {
      expect(reason.trim(), file).not.toBe("");
      expect(existsSync(path.join(WEB_SRC, file)), file).toBe(true);
    }
  });

  it("catches each way of building a class list by hand", () => {
    const hits = handBuiltClassLists(
      "x.tsx",
      [
        "const a = <p className={`p-2 ${b}`} />;",
        'const c = <p className={"p-2 " + b} />;',
        'const d = <p className={["p-2", b].join(" ")} />;',
        "const e = <Frame idleClassName={`p-2 ${b}`} />;",
        "const f = buttonClasses({ className: `p-2 ${b}` });",
        "const layer = `p-2 ${blur}`;",
        "const g = <img className={cx(layer, h)} />;",
        "const shared = `p-2 ${tight}`;",
        "const i = <ul className={shared} />;",
        'const j = <p className={selected ? `ring-2 ${tone}` : "ring-0"} />;',
        "const k = <p className={open && `p-2 ${b}`} />;",
        'const l = <p className={given ?? "p-2 " + b} />;',
        "const tinted = `ring-2 ${tone}`;",
        "const m = <p className={decorate(tinted)} />;",
        "const padded = `p-2 ${size}`;",
        'const n = <a className={buttonClasses({ variant: "ghost", className: padded })} />;',
      ].join("\n"),
    );
    expect(hits).toEqual([
      "1: className is a template string",
      "2: className is a `+`",
      "3: className is a `.join`",
      "4: idleClassName is a template string",
      "5: className is a template string",
      "6: layer, used as a class list, is a template string",
      "8: shared, used as a class list, is a template string",
      "10: className is a template string",
      "11: className is a template string",
      "12: className is a `+`",
      "13: tinted, used as a class list, is a template string",
      "15: padded, used as a class list, is a template string",
    ]);
  });

  it("lets cx, a constant, a literal and an unrelated template string through", () => {
    const hits = handBuiltClassLists(
      "x.tsx",
      [
        'const a = <p className={cx("p-2", b && "p-4", c)} />;',
        "const d = <p className={NOTE} />;",
        "const e = <p className={`p-2 text-text2`} />;",
        "const f = <a href={`/learn/${slug}`} aria-label={`Open ${title}`} />;",
        "const label = `${count} notes`;",
        'const g = <p className={cx("p-2")}>{label}</p>;',
        'const h = <p className={open ? "p-2" : NOTE} />;',
        'const i = <p className={given ?? "p-2"} />;',
        "const resume = `${order}. ${title}`;",
        'const j = <a className={cx(resume === null ? ROW : ROW_TWO_LINE, resume !== null && "h-9")} title={resume} />;',
      ].join("\n"),
    );
    expect(hits).toEqual([]);
  });
});
