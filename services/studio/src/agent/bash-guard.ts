import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * What the diagram and video agents' Bash guards share: the hook program
 * around a check, the read-only file it is written to, and the settings block
 * that runs it. Each guard supplies only its own `allowed(command)`
 * (`diagram-guard.ts`, `video/bash-guard.ts`).
 *
 * A guard is a `PreToolUse` hook in the job's permission file. It runs before
 * the permission rules are consulted and can only take away: exit 2 blocks
 * the call and hands the model the refusal on stderr, exit 0 leaves the
 * decision to the rules as if the hook were not there. It fails closed: input
 * it cannot parse, a Bash call with no command, and a check that throws are
 * all exit 2. Measured on CLI 2.1.274: the hook loads from the `--settings`
 * file under `--setting-sources ""`, and a refusal reaches the model as the
 * hook's stderr.
 */

/**
 * The hook program: `prelude` must define `function allowed(command)`. Plain
 * CommonJS, node alone, no import, so it runs from a file the agent can
 * neither read nor edit with nothing beside it.
 */
export function hookProgram(header: string, prelude: string, refusal: string): string {
  return `// Written by the studio runner. ${header}
"use strict";
${prelude}
const REFUSAL = ${JSON.stringify(refusal)};
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  try {
    const event = JSON.parse(input);
    if (event.tool_name !== "Bash") { process.exitCode = 0; return; }
    if (allowed(event.tool_input && event.tool_input.command)) { process.exitCode = 0; return; }
  } catch {
    /* anything unreadable is refused */
  }
  process.stderr.write(REFUSAL + "\\n");
  process.exitCode = 2;
});
`;
}

/** A path as one shell word: bare when it is plain, single-quoted when not, refused when it holds a quote. */
export function shellWord(value: string): string {
  if (/^[A-Za-z0-9/._-]+$/.test(value)) return value;
  if (value.includes("'") || /[\u0000-\u001f]/.test(value)) throw new Error(`the path cannot go on the hook's command line: ${JSON.stringify(value)}`);
  return `'${value}'`;
}

/**
 * Write the hook to `file`, read-only, and return its command line.
 *
 * The command line ends `|| exit 2` because the CLI blocks a call only on
 * exit 2 and lets it run on any other failure: a hook that crashes (its file
 * deleted or unreadable, node moved, a throw outside the program's own
 * `try`) would otherwise fail open. The CLI runs the line through a shell,
 * so any non-zero exit, a signal's included, becomes 2 and blocks. Measured
 * on 2.1.274 with a hook pointing at a missing file: without the suffix the
 * command ran, with it the call was blocked.
 *
 * The mode
 * is a second lock, not the first: the agent's Edit rules do not reach the
 * file, and a denied Read and Edit rule name it besides.
 */
export async function writeHook(file: string, source: string, node: string): Promise<string> {
  const command = `${shellWord(node)} ${shellWord(file)} || exit 2`;
  await mkdir(path.dirname(file), { recursive: true });
  await chmod(file, 0o644).catch(() => undefined);
  await writeFile(file, source, { encoding: "utf8", mode: 0o444 });
  await chmod(file, 0o444);
  return command;
}

/** The `hooks` block of a job's permission file. */
export function guardHooks(command: string): Record<string, unknown> {
  return { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command }] }] };
}
