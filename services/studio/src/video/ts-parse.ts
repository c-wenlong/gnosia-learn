import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { BackendJob } from "./backend";
import { runSandboxed } from "./exec";
import type { SceneParse } from "./gate";

/**
 * The TypeScript tools' sandboxed reads of agent-written source (D77 of
 * docs/STUDIO-VIDEO-TOOLS.md): the parse, run by a small Node program in the
 * gate profile with the source on stdin, and the reading of `tsc`'s output.
 * Parsing runs no code, but every process that reads a file agent code wrote
 * stays inside a job profile, and the runner only reads the program's JSON.
 */

/**
 * The parse: syntax errors from `transpileModule` (the syntactic diagnostics
 * of one file, no type checking, no other file read), then every string in
 * the tree from `createSourceFile`. `TS` is the absolute path of the
 * TypeScript package, filled in when the argv is built.
 */
export const PARSE_CODE = String.raw`
const ts = require(process.argv[1]);
let src = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { src += chunk; });
process.stdin.on("end", () => {
  const out = { ok: true, error: null, strings: [], defaultExport: false, imports: [] };
  const result = ts.transpileModule(src, { fileName: "scene.tsx", reportDiagnostics: true, compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ES2022 } });
  const errors = (result.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    const d = errors[0];
    const at = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : null;
    out.ok = false;
    out.error = (at === null ? "" : "line " + at + ": ") + ts.flattenDiagnosticMessageText(d.messageText, " ");
    process.stdout.write(JSON.stringify(out) + "\n");
    return;
  }
  const file = ts.createSourceFile("scene.tsx", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const walk = (node) => {
    // A module specifier is where code comes from, not text on screen.
    const specifier = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined;
    if (specifier !== undefined && ts.isStringLiteral(specifier)) {
      out.imports.push(specifier.text);
      return;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.strings.push(node.text);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) out.strings.push(node.text);
    else if (ts.isJsxText(node)) { const text = node.text.trim(); if (text !== "") out.strings.push(text); }
    if (ts.isExportAssignment(node) && !node.isExportEquals) out.defaultExport = true;
    if (ts.canHaveModifiers(node) && (ts.getModifiers(node) || []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) out.defaultExport = true;
    ts.forEachChild(node, walk);
  };
  walk(file);
  process.stdout.write(JSON.stringify(out) + "\n");
});
`;

/** `path(line,col): error TS1234: message`, tsc's own form with `--pretty false`. */
const TSC_LINE = /^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/;

/** tsc's output as errors, each with the file relative to the checkout. */
export function tscErrors(stdout: string, checkout: string): { line?: number; msg: string }[] {
  const errors: { line?: number; msg: string }[] = [];
  for (const raw of stdout.split("\n")) {
    const match = TSC_LINE.exec(raw.trim());
    if (match === null) continue;
    const file = path.isAbsolute(match[1]!) ? path.relative(checkout, match[1]!) : match[1]!;
    errors.push({ line: Number(match[2]), msg: `${file}:${match[2]}: ${match[3]} ${match[4]}` });
  }
  return errors;
}

/**
 * Parse one source file with the TypeScript package at `typescriptJs`
 * (`lib/typescript.js`), in the job's gate profile with its environment, from
 * `candidate/`, the one place that profile reads.
 */
export async function parseInGate(job: BackendJob, env: Record<string, string>, typescriptJs: string | null, source: string): Promise<SceneParse> {
  if (typescriptJs === null) return { ok: false, error: "the TypeScript package is missing", strings: [], defaultExport: false };
  const { paths } = job;
  // Its working directory, the one place the gate profile reads; step 5 empties it later.
  await mkdir(paths.candidate, { recursive: true });
  const result = await runSandboxed({
    ...job,
    kind: "gate",
    profile: paths.gateProfile,
    env,
    argv: [job.tools.node, "-e", PARSE_CODE, typescriptJs],
    cwd: paths.candidate,
    stdin: source,
    timeoutMs: 60_000,
    maxOutput: 32 * 2 ** 20,
  }).catch(() => null);
  const line = result?.stdout.trim().split("\n").at(-1) ?? "";
  try {
    const parsed = JSON.parse(line) as SceneParse;
    if (typeof parsed.ok === "boolean" && Array.isArray(parsed.strings)) return parsed;
  } catch {
    /* fall through */
  }
  return { ok: false, error: `the parser did not answer (exit ${result?.code ?? "none"}): ${(result?.stderr ?? "").trim().split("\n").slice(-2).join(" ")}`, strings: [], defaultExport: false };
}
