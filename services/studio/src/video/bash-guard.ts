import path from "node:path";

import { guardHooks, hookProgram, writeHook } from "../bash-guard";
import type { VideoPaths } from "./paths";

export { guardHooks };

/**
 * The video agent's Bash guard: a `PreToolUse` hook in the job's permission
 * file that refuses every Bash command but the job's wrapper with plain
 * words after it (the review of #201; the design's "What the video agent can
 * and cannot do").
 *
 * The permission file allows one prefix, and the CLI's matcher decides what
 * a command's parts are. Measured on 2.1.274 against the video agent's rules
 * with a headless session and a secret file outside the topic folder: `$(cat
 * …)` was refused by the deny list; `$(/bin/cat …)`, `$(grep …)`, backticks,
 * `<( )`, `;`, `&&`, `||`, a newline, and bare `/bin/cat` and `grep` on the
 * secret all needed approval nobody can give, so were refused; but `<wrapper>
 * lint | base64` ran, because the CLI treats a pipe into a command it counts
 * as read-only as safe. None of that is a contract, and the deny list names
 * spellings (`cat`, not `/bin/cat`) rather than behaviour. The wrapper takes
 * nothing but verbs, scene names and helper names, so the guard can be exact
 * instead: the command is the wrapper's absolute path, then words of
 * `[A-Za-z0-9_.-]`, separated by spaces. That refuses every substitution,
 * pipe, list, redirect, background `&`, glob, variable, quote and line break
 * in one rule, whatever the matcher would have made of it.
 *
 * The hook is a file this job writes into `bin/`, beside the wrapper, which
 * the agent can neither read nor edit and the sandbox cannot write. It fails
 * closed: exit 2 blocks the call, and it exits 2 on anything it cannot parse.
 * The hook program and the file it goes in are shared with the diagram
 * agent's guard (`../bash-guard.ts`); only the check differs.
 */

const WORD = /^[A-Za-z0-9_.-]+$/;

/** The characters a path in the Bash prefix, the guard's rule and the hook's command line may hold, unquoted. */
const PLAIN_PATH = /^[A-Za-z0-9/._-]+$/;

/**
 * Why this machine's paths cannot carry a video job's one command, or null
 * when they can. The wrapper sits under the studio home and runs on node, and
 * both paths go unquoted into the permission file's one Bash prefix, the
 * guard's exact-match rule and the hook's command line. Quoting them would
 * make the guard accept one quoted spelling of one path and depend on how the
 * CLI's matcher reads quotes, which was not measured; so a path that needs
 * quoting is refused by the video doctor, where health shows it before any
 * job is queued (Greptile on #201), rather than at a job's setup.
 */
export function commandPathProblem(studioHome: string, node: string): string | null {
  for (const [what, value] of [["studio home", studioHome], ["node", node]] as const) {
    if (PLAIN_PATH.test(value)) continue;
    if (value.includes(" ")) return `the ${what} path contains a space; video jobs need a path without one (${value})`;
    return `the ${what} path contains a character other than letters, digits, "/", ".", "_" and "-"; video jobs need a path without one (${value})`;
  }
  return null;
}

/** Whether `command` is the wrapper and nothing but plain words after it. */
export function wrapperCommandAllowed(command: string, wrapper: string): boolean {
  if (typeof command !== "string") return false;
  const trimmed = command.replace(/^ +| +$/g, "");
  if (trimmed !== wrapper && !trimmed.startsWith(`${wrapper} `)) return false;
  const rest = trimmed.slice(wrapper.length).split(" ").filter((word) => word !== "");
  return rest.every((word) => WORD.test(word));
}

/** The sentence a refused call gets back: fixed, so nothing the agent passed bounces into its context. */
export const GUARD_REFUSAL =
  "Refused by the job's Bash guard: the only command this job runs is its video command with plain words after it (a verb, scene names, helper names), with no pipe, list, substitution, redirect, variable, quote or line break.";

/** The hook program: the shared one (`../bash-guard.ts`) around the same test as `wrapperCommandAllowed`. */
export function guardSource(wrapper: string): string {
  if (!/^[A-Za-z0-9/._-]+$/.test(wrapper)) throw new Error("the wrapper's path cannot be compiled into the guard");
  return hookProgram(
    "The video agent's Bash guard: see services/studio/src/video/bash-guard.ts.",
    `const WRAPPER = ${JSON.stringify(wrapper)};
const WORD = ${WORD.toString()};
function allowed(command) {
  if (typeof command !== "string") return false;
  const trimmed = command.replace(/^ +| +$/g, "");
  if (trimmed !== WRAPPER && !trimmed.startsWith(WRAPPER + " ")) return false;
  return trimmed.slice(WRAPPER.length).split(" ").filter((w) => w !== "").every((w) => WORD.test(w));
}`,
    GUARD_REFUSAL,
  );
}

/** Write `bin/bash-guard.cjs`, read-only, and return the hook's command line. */
export async function writeGuard(node: string, paths: VideoPaths): Promise<string> {
  const file = path.join(paths.bin, "bash-guard.cjs");
  if (!/^[A-Za-z0-9/._-]+$/.test(node) || !/^[A-Za-z0-9/._-]+$/.test(file)) throw new Error("the guard's command line would need quoting");
  return writeHook(file, guardSource(paths.wrapper), node);
}
