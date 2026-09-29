import { spawn, type ChildProcess } from "node:child_process";

import { KILL_GRACE_MS } from "./config";
import { REPO_ROOT } from "./paths";

/**
 * Running a command and reading its answer.
 *
 * Both tools the runner drives are CLIs with a `--json` mode, and both are run
 * from the repository root, because `npm run` only resolves the workspace
 * scripts (`canvas`, `catalog`) from there. manimkc's `run_claude` does the
 * same with `cwd=ROOT`.
 *
 * The exit code is kept and returned rather than turned into an exception.
 * tldrawkc's 3 (lints remain, the document was saved) and 4 (the save worked,
 * the export did not) are outcomes the gate has an opinion about, and a helper
 * that threw on non-zero would flatten both into "it failed".
 */

export interface RunResult {
  /** Null when the process was killed by a signal rather than exiting. */
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  /** Parsed stdout when the command was asked for `--json` and produced some. */
  json: unknown;
  /** True when the runner's own timer killed it. */
  timedOut: boolean;
}

export interface RunOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  /**
   * Spawn into a process group of its own and stop the whole group on a
   * timeout or an abort, with `stopChild`. Without it only the direct child is
   * killed, which for `npm run canvas` is the launcher and leaves the tool and
   * its Chromium running.
   */
  group?: boolean;
  /** Stop the command when this aborts. Needs `group` to reach past the launcher. */
  signal?: AbortSignal;
}

export async function run(
  command: string,
  args: string[],
  options: RunOptions = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? REPO_ROOT,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: options.group === true,
    });
    const stop = (): void => {
      if (options.group === true) void stopChild(child);
      else child.kill("SIGKILL");
    };
    const onAbort = (): void => stop();
    if (options.signal !== undefined) {
      if (options.signal.aborted) stop();
      else options.signal.addEventListener("abort", onAbort, { once: true });
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer =
      options.timeoutMs === undefined
        ? null
        : setTimeout(() => {
            timedOut = true;
            stop();
          }, options.timeoutMs);

    child.on("error", (error) => {
      if (timer !== null) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      reject(error);
    });
    child.on("close", (code, signal) => {
      if (timer !== null) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      resolve({ code, signal, stdout, stderr, json: parseJson(stdout), timedOut });
    });
  });
}

/**
 * The last JSON value on stdout, or null.
 *
 * Tolerant on purpose. `npm run --silent` suppresses npm's banner, which is the
 * trap the root `AGENTS.md` records, but a warning from a dependency can still
 * land on stdout ahead of the payload, and a runner that refused the whole
 * result over a stray line would fail for a reason that has nothing to do with
 * the diagram.
 */
export function parseJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (trimmed === "") return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    if (start === -1) return null;
    try {
      return JSON.parse(trimmed.slice(start));
    } catch {
      return null;
    }
  }
}

/** `npm` resolves through the shell's PATH, and Windows is not a target here. */
export const NPM = "npm";

/**
 * Signal a whole process group, falling back to the one process.
 *
 * The negative pid is the point. A detached spawn makes the child a process
 * group leader, so `kill(-pid)` reaches every descendant that stayed in the
 * group — the npm launcher, its shell and the tool underneath. It does not
 * reach a descendant that made a group of its own, which is what Playwright
 * does with the browser it launches; `sweepOrphans` in `agent.ts` is why that
 * is survivable.
 *
 * Shared by the agent session and by a mirror's `serve` process, because both
 * are `npm`-fronted trees that a `child.kill()` would leave half-standing.
 */
export function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // ESRCH: the group is already gone, which is the outcome we wanted.
    try {
      process.kill(pid, signal);
    } catch {
      /* nothing left to signal */
    }
  }
}

/**
 * How often `stopChild` asks whether the group has emptied.
 *
 * Small enough that a close costs milliseconds rather than a visible pause on
 * the accept path, and coarse enough not to be a spin.
 */
const GROUP_POLL_MS = 25;

/**
 * Signal the mirror's process group and do not come back until it is empty.
 *
 * The waiting is the whole of it. This used to send `SIGTERM` and return, which
 * reads as a stop and is not one: accept closes the mirror precisely so that no
 * save can land after the rename (A6), and a writer that has been asked to go
 * is still listening for however long it takes to go. "Told it to stop" and
 * "it has stopped" are different facts and only the second is safe to rename
 * behind. Caught in review on the phase 4 PR.
 *
 * **The group is the authority, not the child object.** `child.pid` is the
 * `npm` launcher; the process holding the port and writing the `.tldr` is the
 * `canvas serve` underneath it, and the launcher can be reaped with its child
 * still flushing. `kill(-pid, 0)` asks whether *anything* is left in the group,
 * which is the question worth asking, and it is the same negated pid
 * `signalGroup` signals. A descendant that made a group of its own is outside
 * both, which is what `sweepOrphans` in `agent.ts` is for.
 *
 * `SIGTERM`, one grace window, `SIGKILL`, one more. Returns whether the group
 * actually emptied. False means a process survived a `SIGKILL` for ten seconds,
 * which is a sick machine rather than a busy one — and accept refuses on it
 * rather than renaming anyway. Returning the answer and ignoring it would have
 * left the whole of this waiting decorative in the one case it is for.
 */
export async function stopChild(child: ChildProcess, graceMs = KILL_GRACE_MS): Promise<boolean> {
  const pid = child.pid;
  if (pid === undefined) return true;

  signalGroup(pid, "SIGTERM");
  if (await groupGone(pid, graceMs)) return true;

  // It sat through the polite ask. A SIGKILL that is sent and not waited for
  // would be the same bug one signal further along, so this waits too.
  signalGroup(pid, "SIGKILL");
  return groupGone(pid, graceMs);
}

/** Poll until nothing in the group answers, or the window runs out. */
async function groupGone(pid: number, withinMs: number): Promise<boolean> {
  const until = Date.now() + withinMs;
  for (;;) {
    if (!groupAlive(pid)) return true;
    if (Date.now() >= until) return false;
    await new Promise((resolve) => setTimeout(resolve, GROUP_POLL_MS));
  }
}

/**
 * Is anything left of it?
 *
 * Both the group and the bare pid, because a child spawned without `detached`
 * is not a group leader and `kill(-pid)` would answer `ESRCH` about a process
 * that is very much alive. `EPERM` is an answer too: something is there and it
 * is not ours, which is still not gone.
 */
function groupAlive(pid: number): boolean {
  return answers(-pid) || answers(pid);
}

function answers(target: number): boolean {
  try {
    process.kill(target, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Kill every process whose command line carries `marker`, and return their
 * pids. The fallback for what a process-group stop cannot reach: Playwright
 * puts the Chromium it launches in a group of its own, so a caller points the
 * tool's `TMPDIR` at a directory named for the work and sweeps by that path.
 * `sweepOrphans` in `agent.ts` does this for a job; the manual's snippet check
 * does it for its own runs.
 */
export async function sweepByMarker(marker: string): Promise<number[]> {
  const found = await run("pgrep", ["-f", "--", marker], { timeoutMs: 10_000 }).catch(() => null);
  if (found === null) return [];
  const pids = found.stdout
    .split("\n")
    .map((line) => Number.parseInt(line.trim(), 10))
    .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
  return pids;
}
