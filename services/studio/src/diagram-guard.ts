import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { hookProgram, writeHook } from "./bash-guard";
import { candidatePath, candidateSvgPath, jobDir, scratchDir, SERVICE_ROOT } from "./paths";

/**
 * The diagram agent's Bash guard: a `PreToolUse` hook in the job's permission
 * file that refuses every Bash command but a tldrawkc call on the job's own
 * files. The follow-up to the review of #201, which gave the video agent the
 * same kind of hook and left this agent on its permission rules alone.
 *
 * The rules allow one prefix, `Bash(npm run --silent canvas:*)`, and the CLI's
 * matcher decides what a command's parts are. Measured on 2.1.274 with a
 * headless session under this agent's own settings, the default `STUDIO_HOME`
 * inside the repository, and a fake secret outside every working directory:
 * `$(grep …)`, `$(/bin/cat …)`, backticks, `;`, `&&`, bare `/bin/cat` and
 * `--code <secret>` all needed approval nobody can give, so were refused; a
 * pipe into `grep -r` over the checkouts and `inspect` on a checkout were
 * refused by the Read denies, which the matcher applies to a path argument.
 * Two ran:
 *
 * - `npm run --silent canvas -- inspect <candidate> --json | base64`, because
 *   the CLI treats a pipe into a command it counts as read-only as safe, which
 *   is the #201 finding again.
 * - `npm run --silent canvas -- new <outside>/planted.tldr`, which wrote a
 *   file outside the repository and the job's workspace. The matcher checks a
 *   path argument it takes for a read, never an output path, and tldrawkc has
 *   five (`--shot`, `--svg`, `--png`, `-o`, and the document itself, which
 *   `new` and `from-mermaid` create). The `settings.ts` header named this as
 *   the gap a Bash prefix cannot close.
 *
 * So the hook is exact rather than a longer deny list: `canvas-guard.cjs`
 * allows `npm run --silent canvas -- <verb> ...` for the verbs the agent is
 * taught, with every file argument an absolute path to the candidate, its
 * SVG, or a file in the scratch directory, and every other word plain or
 * quoted without `$`, backtick or backslash. That closes both of the above
 * and every shell form in one rule, and leaves the permission rules exactly
 * as they were, underneath: exit 0 from the hook hands the call to them.
 *
 * What it does not close is what a snippet does once it runs, which is
 * tldrawkc's page in Chromium and not the shell; the design's known gaps
 * keep that one.
 */

const CHECKER_FILE = path.join(SERVICE_ROOT, "src", "canvas-guard.cjs");

/** The files and directories a job's canvas calls may name. Absolute, normalised, every spelling. */
export interface CanvasPolicy {
  files: string[];
  dirs: string[];
}

type Check = (command: unknown, policy: CanvasPolicy) => boolean;

/** The check, from the same file the hook is built from. */
export const canvasCommandAllowed: Check = (createRequire(import.meta.url)(CHECKER_FILE) as { canvasCommandAllowed: Check }).canvasCommandAllowed;

/** The sentence a refused call gets back: fixed, so nothing the agent passed bounces into its context. */
export const DIAGRAM_GUARD_REFUSAL =
  "Refused by the job's Bash guard: the only command this job runs is `npm run --silent canvas -- <verb> ...` with a verb from new, run, shot, inspect, export, verify, from-mermaid, meta set, api and doctor, " +
  "every file given as an absolute path to your candidate .tldr, its .svg, or a file inside your scratch directory, " +
  "and every other value a plain word, a number, or a quoted string without $, backtick or backslash; no pipe, list, substitution, redirect, variable or line break.";

/** Where the hook sits: the job's workspace root, beside its permission file, which the agent is denied. */
export function guardPath(jobId: string): string {
  return path.join(jobDir(jobId), "bash-guard.cjs");
}

/**
 * The job's policy. Each path in both spellings, as the runner wrote it and
 * resolved, since a `STUDIO_HOME` behind a link (`/tmp` on macOS) reaches the
 * agent's prompt in one and a tool's own output in the other.
 */
export function canvasPolicy(jobId: string, slug: string): CanvasPolicy {
  const spellings = (target: string): string[] => {
    const out = new Set([path.resolve(target)]);
    const job = jobDir(jobId);
    try {
      out.add(path.join(realpathSync(job), path.relative(job, target)));
    } catch {
      /* no workspace yet: the one spelling */
    }
    return [...out];
  };
  return {
    files: [...spellings(candidatePath(jobId, slug)), ...spellings(candidateSvgPath(jobId, slug))],
    dirs: spellings(scratchDir(jobId)),
  };
}

/** The hook program for one job: the check's own file, then the job's policy. */
export function diagramGuardSource(policy: CanvasPolicy): string {
  return hookProgram(
    "The diagram agent's Bash guard: see services/studio/src/diagram-guard.ts.",
    `${readFileSync(CHECKER_FILE, "utf8")}
const POLICY = ${JSON.stringify(policy)};
function allowed(command) { return canvasCommandAllowed(command, POLICY); }`,
    DIAGRAM_GUARD_REFUSAL,
  );
}

/** Write the job's hook, read-only, and return its command line, run by this process's own node. */
export async function writeDiagramGuard(jobId: string, slug: string, node: string = process.execPath): Promise<string> {
  return writeHook(guardPath(jobId), diagramGuardSource(canvasPolicy(jobId, slug)), node);
}
