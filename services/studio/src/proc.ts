import { spawn } from "node:child_process";

import { REPO_ROOT } from "./paths";

/**
 * Running a command and reading its answer.
 *
 * Both tools the runner drives are CLIs with a `--json` mode, and both are run
 * from the repository root: `learn/assets/` is repo-relative, so is
 * `content/topics.yaml`, and `npm run` only resolves the workspace scripts from
 * there. manimkc's `run_claude` does the same with `cwd=ROOT`.
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
    });

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
            child.kill("SIGKILL");
          }, options.timeoutMs);

    child.on("error", (error) => {
      if (timer !== null) clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      if (timer !== null) clearTimeout(timer);
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
