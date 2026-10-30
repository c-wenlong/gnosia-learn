import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Nothing in the web app reads or writes on the `'local'` default (phase 4 of
 * docs/CONTENT-MIGRATION.md).
 *
 * Every state function in `@gnosia/catalog/state` takes the learner as
 * `learnerId`, defaulted to `'local'` so the `learn` CLI, which runs on the
 * owner's machine with no session, reads naturally. The web app has a
 * session, and a call there that leaves `learnerId` out would read the owner's
 * data for whoever is asking the day a second account exists, with nothing
 * to show for it but a type-correct line. So every such call must pass the
 * owner explicitly, `currentOwner()` from `@/lib/owner`, and this test fails
 * the build of one that does not.
 *
 * It reads the source rather than trusting a list: the owner-bearing
 * functions are found in the catalog's own declarations (a parameter named
 * `learnerId`, `owner` or `scope`, or an options object the body destructures
 * `learnerId` out of), so a function added to the door later is covered the
 * day it lands. The content reads take a required `OwnerScope`, which the
 * compiler already enforces; they are checked here too, which costs nothing.
 *
 * `@gnosia/tutor/server/<name>` is a second door: its modules call the
 * catalog themselves, so a web call into one is held to the same rule, and
 * the package's own catalog calls are checked against the catalog's door.
 * Its turn functions take the owner inside a required `deps.owner`, which
 * the compiler enforces.
 *
 * The ways around that check are refused outright, since each one hands the
 * owner to something this test cannot follow: a hard-coded `'local'` or
 * `LOCAL_LEARNER_ID` outside `owner.ts`, a scope built by hand (an object with
 * `owner` and `readable`, or `ownerScope`/`readableOwners` given a literal), a
 * namespace or unbound dynamic import of the catalog, a re-export of it, any
 * other `@gnosia/catalog` entry point, and a query of the app's own
 * (`drizzle-orm`, or `.execute(`), which would bypass every scoped reader.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_SRC = path.resolve(HERE, "..");
const REPO = path.resolve(WEB_SRC, "..", "..", "..");
const DOOR = "@gnosia/catalog/state";
const DOOR_INDEX = path.join(REPO, "services", "catalog", "src", "state", "index.ts");

/**
 * The tutor package's server half, `@gnosia/tutor/server/<name>`: the second
 * door. Its modules call the catalog themselves (provider keys, turns, learner
 * writes, the concept workspace), so a web call into one that leaves the owner
 * out reads the default learner just as a direct catalog call would.
 */
const TUTOR_SERVER = path.join(REPO, "packages", "tutor", "src", "server");
const TUTOR_DOOR = "@gnosia/tutor/server/";

const OWNER_PARAMS = new Set(["learnerId", "owner", "scope"]);

/** The one module that may name the owner, and build a scope, itself. */
const OWNER_MODULE = path.join(WEB_SRC, "lib", "owner.ts");

/** Where the owner goes in a call: the n-th argument, or a `learnerId` key of the n-th argument. */
type OwnerSlot = { kind: "positional"; index: number } | { kind: "option"; index: number };

function parse(file: string, text = readFileSync(file, "utf8")): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function resolveModule(from: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(from), specifier);
  for (const candidate of [`${base}.ts`, path.join(base, "index.ts")]) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // try the next
    }
  }
  return null;
}

/** Names bound to `learnerId` by destructuring `param` anywhere in `body`, or read as `param.learnerId`. */
function bodyTakesLearnerFrom(body: ts.Node, param: string): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer !== undefined &&
      ts.isIdentifier(node.initializer) &&
      node.initializer.text === param &&
      node.name.elements.some((e) => (e.propertyName ?? e.name).getText() === "learnerId")
    ) {
      found = true;
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === param &&
      node.name.text === "learnerId"
    ) {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return found;
}

/** The owner slot of one function declaration, or null when it takes no owner. */
function slotOf(fn: ts.FunctionDeclaration): OwnerSlot | null {
  for (const [index, param] of fn.parameters.entries()) {
    if (ts.isIdentifier(param.name) && OWNER_PARAMS.has(param.name.text)) return { kind: "positional", index };
    if (ts.isObjectBindingPattern(param.name)) {
      if (param.name.elements.some((e) => (e.propertyName ?? e.name).getText() === "learnerId")) {
        return { kind: "option", index };
      }
    } else if (ts.isIdentifier(param.name) && fn.body !== undefined && bodyTakesLearnerFrom(fn.body, param.name.text)) {
      return { kind: "option", index };
    }
  }
  return null;
}

/** The owner-taking functions one module declares and exports itself, by name. */
function moduleTable(file: string): Map<string, OwnerSlot> {
  const table = new Map<string, OwnerSlot>();
  for (const node of parse(file).statements) {
    if (!ts.isFunctionDeclaration(node) || node.name === undefined) continue;
    if (!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    const slot = slotOf(node);
    if (slot !== null) table.set(node.name.text, slot);
  }
  return table;
}

/** Every `@gnosia/tutor/server/<name>` module with an owner-taking export, by specifier. */
function tutorTables(): Map<string, Map<string, OwnerSlot>> {
  const out = new Map<string, Map<string, OwnerSlot>>();
  for (const file of tutorServerFiles()) {
    const table = moduleTable(file);
    if (table.size > 0) out.set(`${TUTOR_DOOR}${path.basename(file, ".ts")}`, table);
  }
  return out;
}

function tutorServerFiles(): string[] {
  return readdirSync(TUTOR_SERVER)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith(".d.ts"))
    .map((name) => path.join(TUTOR_SERVER, name));
}

/** Every function the door exports that takes an owner, by exported name. */
function ownerTable(): Map<string, OwnerSlot> {
  const door = parse(DOOR_INDEX);
  const table = new Map<string, OwnerSlot>();
  for (const statement of door.statements) {
    if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier === undefined) continue;
    if (statement.exportClause === undefined || !ts.isNamedExports(statement.exportClause)) continue;
    const target = resolveModule(DOOR_INDEX, (statement.moduleSpecifier as ts.StringLiteral).text);
    if (target === null) continue;
    const declarations = new Map<string, ts.FunctionDeclaration>();
    for (const node of parse(target).statements) {
      if (ts.isFunctionDeclaration(node) && node.name !== undefined) declarations.set(node.name.text, node);
    }
    for (const element of statement.exportClause.elements) {
      const local = (element.propertyName ?? element.name).text;
      const fn = declarations.get(local);
      const slot = fn === undefined ? null : slotOf(fn);
      if (slot !== null) table.set(element.name.text, slot);
    }
  }
  return table;
}

interface Violation {
  file: string;
  line: number;
  name: string;
  why: string;
}

function hasLearnerKey(node: ts.Expression): boolean {
  return (
    ts.isObjectLiteralExpression(node) &&
    node.properties.some(
      (p) =>
        (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
        p.name !== undefined &&
        p.name.getText() === "learnerId",
    )
  );
}

/**
 * The calls in one file that leave the owner to a default, or hand an
 * owner-taking function on uncalled. `table` is the catalog door's; `tutor`
 * holds the tutor server's modules, checked the same way.
 */
function violationsIn(
  file: string,
  text: string,
  table: ReadonlyMap<string, OwnerSlot>,
  tutor: ReadonlyMap<string, ReadonlyMap<string, OwnerSlot>> = new Map(),
): Violation[] {
  const source = parse(file, text);
  const bound = new Map<string, { name: string; slot: OwnerSlot }>();
  const bindFrom = (specifier: string, local: string, imported: string) => {
    const doorTable = specifier === DOOR ? table : tutor.get(specifier);
    const slot = doorTable?.get(imported);
    if (slot !== undefined) bound.set(local, { name: imported, slot });
  };
  const visitImports = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
      for (const element of node.importClause.namedBindings.elements) {
        bindFrom((node.moduleSpecifier as ts.StringLiteral).text, element.name.text, (element.propertyName ?? element.name).text);
      }
    }
    // const { a, b: c } = await import("@gnosia/catalog/state")
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer !== undefined) {
      const init = ts.isAwaitExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (ts.isCallExpression(init) && init.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const [arg] = init.arguments;
        if (arg !== undefined && ts.isStringLiteral(arg)) {
          for (const element of node.name.elements) {
            bindFrom(arg.text, element.name.getText(), (element.propertyName ?? element.name).getText());
          }
        }
      }
    }
    ts.forEachChild(node, visitImports);
  };
  visitImports(source);

  const out: Violation[] = [];
  const report = (node: ts.Node, name: string, why: string) => {
    out.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, name, why });
  };
  const isOwnerModule = path.resolve(file) === OWNER_MODULE;
  const catalogSpecifier = (text: string) => text === "@gnosia/catalog" || text.startsWith("@gnosia/catalog/");
  const bypasses = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = node.moduleSpecifier;
      if (specifier !== undefined && ts.isStringLiteral(specifier)) {
        const text = specifier.text;
        if (text === "drizzle-orm" || text.startsWith("drizzle-orm/")) {
          report(node, text, "a query of the web app's own bypasses the scoped readers; add one to the catalog");
        } else if (catalogSpecifier(text) && text !== DOOR) {
          report(node, text, `the web app reaches the catalog through ${DOOR} only`);
        } else if (
          text === DOOR &&
          ts.isExportDeclaration(node) &&
          (node.exportClause === undefined ||
            (ts.isNamedExports(node.exportClause) &&
              node.exportClause.elements.some((e) => table.has((e.propertyName ?? e.name).text))))
        ) {
          // Types and pure helpers may pass through; an owner-bearing function
          // re-exported would be called where this check cannot see it.
          report(node, text, "a re-export hides the calls from this check; import where it is called");
        } else if (
          (text === DOOR || tutor.has(text)) &&
          ts.isImportDeclaration(node) &&
          node.importClause?.namedBindings !== undefined &&
          ts.isNamespaceImport(node.importClause.namedBindings)
        ) {
          report(node, text, "a namespace import hides the calls from this check; import each function by name");
        }
      }
    }
    // `await import(DOOR)` bound to a name rather than destructured.
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteral(node.arguments[0]) &&
      catalogSpecifier(node.arguments[0].text)
    ) {
      let binding: ts.Node = node.parent;
      if (ts.isAwaitExpression(binding)) binding = binding.parent;
      if (!(ts.isVariableDeclaration(binding) && ts.isObjectBindingPattern(binding.name))) {
        report(node, node.arguments[0].text, "a dynamic import must destructure the functions it calls");
      }
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === "execute" && ts.isCallExpression(node.parent)) {
      report(node, "execute", "a raw query bypasses the scoped readers; add one to the catalog");
    }
    if (!isOwnerModule) {
      if (ts.isStringLiteral(node) && node.text === "local" && !ts.isImportDeclaration(node.parent)) {
        report(node, "'local'", "the owner comes from currentOwner(), never a literal");
      }
      if (ts.isIdentifier(node) && node.text === "LOCAL_LEARNER_ID") {
        report(node, "LOCAL_LEARNER_ID", "the owner comes from currentOwner(), never the default learner");
      }
      if (
        ts.isObjectLiteralExpression(node) &&
        ["owner", "readable"].every((key) =>
          node.properties.some((p) => p.name !== undefined && ts.isIdentifier(p.name) && p.name.text === key),
        )
      ) {
        report(node, "{ owner, readable }", "a scope built by hand; use currentScope() or ownerScope(await currentOwner())");
      }
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        (node.expression.text === "ownerScope" || node.expression.text === "readableOwners") &&
        node.arguments[0] !== undefined &&
        (ts.isStringLiteral(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))
      ) {
        report(node, node.expression.text, "a scope for a literal owner; pass the owner currentOwner() resolved");
      }
    }
    ts.forEachChild(node, bypasses);
  };
  bypasses(source);

  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && bound.has(node.text)) {
      const parent = node.parent;
      const { name, slot } = bound.get(node.text) as { name: string; slot: OwnerSlot };
      // A binding, a `typeof` in a type, or a property that merely shares the
      // name (`{ dueReviews: n }`, `x.dueReviews`).
      const isBinding =
        ts.isImportSpecifier(parent) ||
        ts.isBindingElement(parent) ||
        ts.isExportSpecifier(parent) ||
        ts.isTypeQueryNode(parent) ||
        ((ts.isPropertyAssignment(parent) ||
          ts.isPropertyAccessExpression(parent) ||
          ts.isPropertySignature(parent) ||
          ts.isPropertyDeclaration(parent) ||
          ts.isMethodDeclaration(parent)) &&
          parent.name === node);
      if (!isBinding) {
        if (!ts.isCallExpression(parent) || parent.expression !== node) {
          report(node, name, "handed on uncalled, so whoever calls it decides the owner");
        } else {
          const arg = parent.arguments[slot.index];
          if (slot.kind === "positional") {
            if (arg === undefined || (ts.isIdentifier(arg) && arg.text === "undefined")) {
              report(node, name, `argument ${slot.index + 1} (the owner) is missing`);
            }
          } else if (arg === undefined || !hasLearnerKey(arg)) {
            report(node, name, `argument ${slot.index + 1} must be an object literal naming learnerId`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("owner-bearing catalog calls in the web app", () => {
  const table = ownerTable();
  const tutor = tutorTables();

  it("finds the owner in the catalog's own declarations", () => {
    // A handful the web app calls, so a change to how the table is read that
    // quietly empties it fails here rather than passing every file below.
    expect(table.get("readLearnerSnapshot")).toEqual({ kind: "positional", index: 1 });
    expect(table.get("readEvents")).toEqual({ kind: "positional", index: 1 });
    expect(table.get("setProgress")).toEqual({ kind: "option", index: 3 });
    expect(table.get("recordObservation")).toEqual({ kind: "option", index: 1 });
    expect(table.get("dueReviews")).toEqual({ kind: "option", index: 1 });
    expect(table.get("assetsForConcept")).toEqual({ kind: "positional", index: 2 });
    expect(table.get("dbSource")).toEqual({ kind: "positional", index: 1 });
    expect(table.size).toBeGreaterThan(40);
  });

  it("catches a call that leaves the owner out, and one that passes it", () => {
    const bad = [
      `import { readEvents, recordObservation } from "${DOOR}";`,
      `await readEvents(db);`,
      `await recordObservation(db, { conceptId, correct });`,
      `await withLearnerStore(readEvents);`,
      `const { dbSource } = await import("${DOOR}");`,
      `dbSource(db);`,
    ].join("\n");
    expect(violationsIn("bad.ts", bad, table).map((v) => `${v.line} ${v.name}`)).toEqual([
      "2 readEvents",
      "3 recordObservation",
      "4 readEvents",
      "6 dbSource",
    ]);
    const good = [
      `import { readEvents, recordObservation } from "${DOOR}";`,
      `await readEvents(db, owner);`,
      `await recordObservation(db, { conceptId, correct, learnerId: owner });`,
      `const { dbSource } = await import("${DOOR}");`,
      `dbSource(db, ownerScope(owner));`,
      `export type { KnowledgeBase } from "${DOOR}";`,
    ].join("\n");
    expect(violationsIn("good.ts", good, table)).toEqual([]);
  });

  it("finds the owner in the tutor server's own declarations, and holds a web call into one to it", () => {
    // A few the web app calls, so a change that empties the second table
    // fails here rather than passing every file below.
    expect(tutor.get("@gnosia/tutor/server/provider-keys")?.size ?? 0).toBeGreaterThan(0);
    expect(tutor.get("@gnosia/tutor/server/tutor-models")?.size ?? 0).toBeGreaterThan(0);
    const [specifier, functions] = [...tutor.entries()].find(([, t]) => [...t.values()].some((slot) => slot.kind === "positional")) as [
      string,
      Map<string, OwnerSlot>,
    ];
    const [name, slot] = [...functions.entries()].find(([, v]) => v.kind === "positional") as [string, OwnerSlot];
    const args = (withOwner: boolean) =>
      Array.from({ length: slot.index + (withOwner ? 1 : 0) }, (_, i) => (i === slot.index ? "owner" : `a${i}`)).join(", ");
    expect(violationsIn("bad.ts", `import { ${name} } from "${specifier}";\nawait ${name}(${args(false)});`, table, tutor)).toHaveLength(1);
    expect(violationsIn("bad.ts", `import * as t from "${specifier}";`, table, tutor)).toHaveLength(1);
    expect(violationsIn("good.ts", `import { ${name} } from "${specifier}";\nawait ${name}(${args(true)});`, table, tutor)).toEqual([]);
  });

  it("passes an owner on every catalog call the tutor server makes", () => {
    const violations = tutorServerFiles().flatMap((file) =>
      violationsIn(file, readFileSync(file, "utf8"), table, tutor).map(
        (v) => `${path.relative(REPO, v.file)}:${v.line} ${v.name}: ${v.why}`,
      ),
    );
    expect(violations).toEqual([]);
  });

  it("catches the ways around the owner: literals, hand-built scopes, namespace imports, re-exports, raw queries", () => {
    const bad = [
      `import * as state from "${DOOR}";`,
      `export { readEvents } from "${DOOR}";`,
      `export * from "${DOOR}";`,
      `import { sql } from "drizzle-orm";`,
      `import { writeContent } from "@gnosia/catalog/src/content/write";`,
      `import { LOCAL_LEARNER_ID } from "@gnosia/schema/shared";`,
      `const mod = await import("${DOOR}");`,
      `await db.execute(sql\`select 1\`);`,
      `await readEvents(db, "local");`,
      `await readEvents(db, LOCAL_LEARNER_ID);`,
      `const scope = { owner: me, readable: [me, "commons"] };`,
      `const s = ownerScope("someone");`,
      `const r = readableOwners(\`someone\`);`,
    ].join("\n");
    const found = violationsIn("bad.ts", bad, ownerTable()).map((v) => `${v.line} ${v.name}`);
    expect(found).toEqual(
      expect.arrayContaining([
        `1 ${DOOR}`,
        `2 ${DOOR}`,
        `3 ${DOOR}`,
        "4 drizzle-orm",
        "5 @gnosia/catalog/src/content/write",
        "6 LOCAL_LEARNER_ID",
        `7 ${DOOR}`,
        "8 execute",
        "9 'local'",
        "10 LOCAL_LEARNER_ID",
        "11 { owner, readable }",
        "12 ownerScope",
        "13 readableOwners",
      ]),
    );
    // owner.ts is the one place allowed to name the default learner.
    expect(
      violationsIn(OWNER_MODULE, `import { LOCAL_LEARNER_ID } from "@gnosia/schema/shared";\nreturn LOCAL_LEARNER_ID;`, ownerTable()),
    ).toEqual([]);
  });

  it("passes an owner on every call in apps/web/src", () => {
    const violations = sourceFiles(WEB_SRC).flatMap((file) =>
      violationsIn(file, readFileSync(file, "utf8"), table, tutor).map(
        (v) => `${path.relative(REPO, v.file)}:${v.line} ${v.name}: ${v.why}`,
      ),
    );
    expect(violations).toEqual([]);
  });
});
