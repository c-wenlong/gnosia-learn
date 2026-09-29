import path from "node:path";

import { runSandboxed } from "./exec";
import type { VideoPaths } from "./paths";
import type { Toolchain } from "./toolchain";

/**
 * The scene file, read as a syntax tree.
 *
 * The gate's script step (3), the line-change log and the clips kept after a
 * verdict all need to know what the scene file says: which classes, in what
 * order, which `voiceover` lines, which string literals. That is Python's own
 * `ast.parse`, which reads a file and never runs it, so the runner can ask it
 * questions about agent-written code without executing any.
 *
 * It still runs inside the render profile, with the source on stdin: parsing
 * untrusted input is a parser's attack surface, a sandbox costs nothing here,
 * and "no program outside a sandbox ever reads a file agent code wrote" is an
 * easier rule to check than one with exceptions. `-I` is isolated mode: no
 * `PYTHON*` variable, no user site, no script directory on the path.
 */

export interface VoiceLine {
  /** The literal's text, or null when the argument is not a plain string literal. */
  text: string | null;
  line: number;
}

export interface ScannedClass {
  name: string;
  bases: string[];
  line: number;
  /** The first line of the class docstring: the chapter title manimkc uses. */
  title: string | null;
  /** Every `self.voiceover(...)` and `self.narrate(...)` in the class, in source order. */
  voiceovers: VoiceLine[];
  /** Every string constant in the class, f-string pieces included. */
  strings: string[];
  /** First arguments of `.set(...)` and `.say(...)` calls that are string literals: CaptionBar's captions. */
  captions: string[];
}

export interface Scan {
  ok: boolean;
  /** The parse error, when `ok` is false. */
  error: string | null;
  classes: ScannedClass[];
}

export const SCAN_CODE = String.raw`
import ast, json, sys
src = sys.stdin.read()
try:
    tree = ast.parse(src)
except (SyntaxError, ValueError, RecursionError, MemoryError) as e:
    print(json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}", "classes": []}))
    sys.exit(0)
def name_of(node):
    if isinstance(node, ast.Name): return node.id
    if isinstance(node, ast.Attribute): return node.attr
    return None
def ordered(node):
    items = [n for n in ast.walk(node) if hasattr(n, "lineno")]
    items.sort(key=lambda n: (n.lineno, n.col_offset))
    return items
out = []
for node in tree.body:
    if not isinstance(node, ast.ClassDef):
        continue
    doc = ast.get_docstring(node) or ""
    first = doc.strip().splitlines()[0].strip() if doc.strip() else None
    voice, strings, captions = [], [], []
    for n in ordered(node):
        if isinstance(n, ast.Constant) and isinstance(n.value, str):
            strings.append(n.value)
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute):
            attr = n.func.attr
            target = n.func.value
            first_arg = n.args[0] if n.args else None
            literal = first_arg.value if isinstance(first_arg, ast.Constant) and isinstance(first_arg.value, str) else None
            if attr in ("voiceover", "narrate") and isinstance(target, ast.Name) and target.id == "self":
                voice.append({"text": literal, "line": n.lineno})
            elif attr in ("set", "say") and literal is not None:
                captions.append(literal)
    out.append({"name": node.name, "bases": [b for b in (name_of(x) for x in node.bases) if b],
                "line": node.lineno, "title": first, "voiceovers": voice,
                "strings": strings, "captions": captions})
print(json.dumps({"ok": True, "error": None, "classes": out}))
`;

export interface ScanInput {
  tools: Toolchain;
  paths: VideoPaths;
  home: string;
  voice: string;
}

/** Parse `source` inside the render profile. */
export async function scanSource(input: ScanInput, source: string): Promise<Scan> {
  const result = await runSandboxed({
    ...input,
    kind: "render",
    profile: input.paths.renderProfile,
    argv: [path.join(input.paths.checkout, ".venv", "bin", "python"), "-I", "-c", SCAN_CODE],
    cwd: input.paths.checkout,
    stdin: source,
    timeoutMs: 60_000,
    maxOutput: 32 * 2 ** 20,
  });
  const line = result.stdout.trim().split("\n").at(-1) ?? "";
  try {
    const parsed = JSON.parse(line) as Scan;
    if (typeof parsed.ok === "boolean" && Array.isArray(parsed.classes)) return parsed;
  } catch {
    /* fall through */
  }
  return { ok: false, error: `the parser did not answer (exit ${result.code}): ${result.stderr.trim().split("\n").slice(-2).join(" ")}`, classes: [] };
}

/** Scene classes as manimkc counts them: `<PREFIX><n>_<Name>`, with a Scene base. */
export function sceneClasses(scan: Scan): ScannedClass[] {
  return scan.classes.filter((entry) => /^[A-Z]{1,4}\d+_/.test(entry.name) && entry.bases.some((base) => base.endsWith("Scene")));
}

/** Every voiced line in the file, in play order: the transcript the build should have written. */
export function voicedLines(scan: Scan): string[] {
  return sceneClasses(scan).flatMap((entry) => entry.voiceovers.flatMap((voice) => (voice.text === null ? [] : [voice.text])));
}
