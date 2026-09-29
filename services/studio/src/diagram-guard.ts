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
 * quoted (single quotes around anything but a quote, double quotes without
 * `$`, backtick or backslash). That closes both of the above
 * and every shell form in one rule, and leaves the permission rules exactly
 * as they were, underneath: exit 0 from the hook hands the call to them.
 *
 * What it does not close is what a snippet does once it runs, which is
 * tldrawkc's page in Chromium and not the shell. The page has no filesystem
 * API, and a snippet's requests are to be contained by tldrawkc's own
 * network block on the page, which lands separately (in the submodule, with
 * a pointer bump); until then a snippet can reach the network from Chromium.
 */

const CHECKER_FILE = path.join(SERVICE_ROOT, "src", "canvas-guard.cjs");

/** The files and directories a job's canvas calls may name. Absolute, normalised, every spelling. */
export interface CanvasPolicy {
  files: string[];
  dirs: string[];
}

type Check = (command: unknown, policy: CanvasPolicy) => boolean;

const checker = createRequire(import.meta.url)(CHECKER_FILE) as { canvasCommandAllowed: Check; tokenize: (command: string) => string[] | null };

/** The check, from the same file the hook is built from. */
export const canvasCommandAllowed: Check = checker.canvasCommandAllowed;

/** The words the check believes the shell will pass, or null for a line it does not read. The fuzz test holds it to bash and zsh. */
export const canvasTokens: (command: string) => string[] | null = checker.tokenize;

/** The sentence a refused call gets back: fixed, so nothing the agent passed bounces into its context. */
export const DIAGRAM_GUARD_REFUSAL =
  "Refused by the job's Bash guard: the only command this job runs is `npm run --silent canvas -- <verb> ...` with a verb from new, run, shot, inspect, export, verify, from-mermaid, meta set, api and doctor, " +
  "every file given as an absolute path to your candidate .tldr, its .svg, or a file inside your scratch directory, " +
  "and every other value a plain word, a number, or a quoted string (single quotes around anything but a single quote, so 'Save $50' works; double quotes with no $, backtick or backslash); no pipe, list, substitution, redirect, variable or line break.";

/** What the agent can type bare, plus a space, which it quotes without being told. */
const TYPABLE_PATH = /^[A-Za-z0-9_./:,@+= -]+$/;

/**
 * Why this machine's paths cannot carry a diagram job, or null when they can.
 * Checked at enqueue (`Runner.enqueue` refuses with 503), again before a
 * spawn, and reported by `/api/health` as `diagramAgent`, so a job is refused
 * before it is queued rather than failing at its first command. Not in the
 * tldrawkc doctor: the studio's own canvas calls pass paths as argv with no
 * shell, so the grid, checkout, commit and the mirror do not need this.
 *
 * The prompt hands the agent its candidate and scratch paths bare, and the
 * guard accepts a path only as a bare word or quoted. A space the agent
 * quotes without being told, and jobs under such a path worked before the
 * guard, so it stays allowed. Any other character the shell acts on (`$`,
 * a backtick, a backslash, a quote, a glob, `~`, `;` and the rest) would
 * need a quoting the agent has no reason to pick, and a bare spelling is
 * refused, so a job would spend its turns on refusals: refused here instead,
 * naming the path. The node that runs the hook goes on the hook's command
 * line, single-quoted when it needs it, so only a quote in it is refused.
 */
export function diagramPathProblem(home: string, node: string = process.execPath): string | null {
  let resolvedHome = home;
  try {
    resolvedHome = realpathSync(home);
  } catch {
    /* not created yet: the one spelling */
  }
  for (const spelling of new Set([home, resolvedHome])) {
    if (TYPABLE_PATH.test(spelling)) continue;
    const odd = [...new Set([...spelling].filter((character) => !TYPABLE_PATH.test(character)))].map((character) => JSON.stringify(character)).join(" ");
    return `the studio home path holds ${odd}, which the diagram agent would have to quote in every canvas command and its Bash guard refuses bare; move STUDIO_HOME (or the checkout, for the default .studio) to a path of letters, digits, spaces and . _ - / : , @ + = (${spelling})`;
  }
  if (node.includes("'") || /[\u0000-\u001f]/.test(node)) return `the node running the studio has a quote or a control character in its path, so the Bash guard's hook cannot be put on a command line (${node})`;
  return null;
}

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
