import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

import {
  ATTEMPT_TIMEOUT_MS,
  CLAUDE_BIN,
  IDLE_TIMEOUT_MS,
  KILL_GRACE_MS,
  MAX_TURNS,
  type Model,
} from "./config";
import { REPO_ROOT, scratchDir, settingsPath, tmpDir } from "./paths";
import { run, signalGroup } from "./proc";
import { buildSettings, type SettingsInput } from "./settings";

/**
 * The agent: one headless `claude -p` session, constrained, watched and
 * stoppable.
 *
 * The shape is manimkc's `agent.run_claude` — a per-job settings file, a
 * pre-assigned session id, the repo root as the working directory — with three
 * deliberate departures, each one because manimkc's version has a gap its own
 * `DESIGN.md` does not claim to close.
 *
 * **The session is a stream, not a blob.** manimkc uses `--output-format json`
 * and parses the whole thing after the process exits, which is fine for a job
 * that is one long render and useless for a draw-look-fix loop a person is
 * watching. `stream-json` means the runner holds every turn as it arrives, so
 * the SSE stream is a subscription to something it already has (D8).
 *
 * **It is spawned into its own process group and killed as one.** manimkc has
 * no process-group spawn and no signal escalation at all: `subprocess.run`'s
 * timeout kills the direct child, and whatever that child started keeps
 * running. A diagram job's children are Chromium, so that gap is the whole
 * cancellation story here rather than a detail.
 *
 * **`TMPDIR` points into the job workspace.** This is what makes the orphan
 * sweep possible; `sweepOrphans` explains it.
 */

export interface AgentOptions {
  jobId: string;
  slug: string;
  source?: string;
  prompt: string;
  model: Model;
  /** A UUID, minted and persisted before this is called. */
  sessionId: string;
  /** True for attempt two and three: continue the stored session. */
  resume: boolean;
  /** Called for every raw stdout line, before anything else happens to it. */
  onLine: (line: string) => void;
}

export type StopReason = "attempt-timeout" | "idle-timeout" | "cancelled" | null;

export interface AgentOutcome {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  turns: number | null;
  /**
   * **There is no cost on this outcome, deliberately.**
   *
   * A10 read `cost_usd` off the final result event and off nothing else, which
   * is exact and only ever arrives when the session exits cleanly — so a
   * cancelled, timed-out or interrupted attempt recorded nothing for work that
   * was really paid for. Cost is now a property of the *job*, not of one
   * attempt's exit: the runner holds a `JobCostMeter` fed every line of this
   * stream through `onLine`, and reads it at whatever moment the job ends,
   * including the moments this outcome never reaches. Putting a figure here as
   * well would be a second answer to the question `cost.ts` answers.
   */
  /** The final `result` event's `subtype`: `success`, `error_max_turns`, … */
  subtype: string | null;
  isError: boolean;
  /**
   * True when the process never started: no `claude` on PATH, or a spawn the
   * OS refused.
   *
   * Kept apart from `isError` because the two mean different things to the
   * runner. An agent that ran and failed still leaves work the gate can judge —
   * rule 4 says the gate, not the exit code, decides what is on disk. An agent
   * that never started wrote nothing, so gating its output means gating
   * whatever was already there, which in `extend` mode is the runner's own copy
   * of the committed file.
   */
  spawnFailed: boolean;
  /** Tool calls the permission rules refused. Evidence the boundary held. */
  denials: { tool: string; input: unknown }[];
  stopReason: StopReason;
  stderr: string;
}

/**
 * A running agent, with the two things the runner needs from it: a promise for
 * the outcome, and a way to stop it.
 */
export class AgentRun {
  private readonly child: ChildProcess;
  private readonly options: AgentOptions;
  private stopReason: StopReason = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private attemptTimer: NodeJS.Timeout | null = null;
  private killTimer: NodeJS.Timeout | null = null;
  readonly done: Promise<AgentOutcome>;

  constructor(child: ChildProcess, options: AgentOptions) {
    this.child = child;
    this.options = options;
    this.done = this.watch();
  }

  /** The process group id, which is the child's pid for a detached spawn. */
  get pid(): number | undefined {
    return this.child.pid;
  }

  private touch(): void {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      // Silence, not slowness. The CLI's own 30 second exec timeout covers a
      // command that hangs; this covers a browser that never answered the
      // bridge, where nothing is running and nothing will time out.
      void this.stop("idle-timeout");
    }, IDLE_TIMEOUT_MS);
  }

  private watch(): Promise<AgentOutcome> {
    return new Promise((resolve) => {
      let turns: number | null = null;
      let subtype: string | null = null;
      let isError = false;
      let stderr = "";
      const denials: { tool: string; input: unknown }[] = [];
      let buffer = "";

      this.attemptTimer = setTimeout(() => {
        void this.stop("attempt-timeout");
      }, ATTEMPT_TIMEOUT_MS);
      this.touch();

      this.child.stdout?.on("data", (chunk: Buffer) => {
        this.touch();
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim() === "") continue;
          this.options.onLine(line);
          const event = safeParse(line);
          if (event === null) continue;
          if (event.type === "result") {
            // `turns` still comes from the final result event and from nowhere
            // else: there is no per-turn counter in the stream to accumulate,
            // and a killed attempt genuinely does not know how many turns it
            // took. Cost is a different question with a different answer —
            // `cost.ts` and the note on this outcome above.
            turns = numberOrNull(event.num_turns);
            subtype = typeof event.subtype === "string" ? event.subtype : null;
            isError = event.is_error === true;
            for (const denial of Array.isArray(event.permission_denials) ? event.permission_denials : []) {
              const record = denial as Record<string, unknown>;
              denials.push({
                tool: typeof record.tool_name === "string" ? record.tool_name : "?",
                input: record.tool_input ?? null,
              });
            }
          }
        }
      });

      this.child.stderr?.on("data", (chunk: Buffer) => {
        stderr = `${stderr}${chunk.toString()}`.slice(-8_000);
      });

      this.child.on("close", (code, signal) => {
        if (buffer.trim() !== "") this.options.onLine(buffer);
        this.clearTimers();
        resolve({
          exitCode: code,
          signal,
          turns,
          subtype,
          isError,
          spawnFailed: false,
          denials,
          stopReason: this.stopReason,
          stderr: stderr.trim(),
        });
      });

      this.child.on("error", (error) => {
        this.clearTimers();
        resolve({
          exitCode: null,
          signal: null,
          turns: null,
          subtype: null,
          isError: true,
          // The one outcome the gate must never be asked about: nothing ran, so
          // whatever is at the candidate path was not written by this attempt.
          spawnFailed: true,
          denials: [],
          stopReason: this.stopReason,
          stderr: `could not start ${CLAUDE_BIN}: ${error.message}`,
        });
      });
    });
  }

  private clearTimers(): void {
    for (const timer of [this.idleTimer, this.attemptTimer, this.killTimer]) {
      if (timer !== null) clearTimeout(timer);
    }
    this.idleTimer = null;
    this.attemptTimer = null;
    this.killTimer = null;
  }

  /**
   * Stop the session: SIGTERM to the process group, five seconds, then SIGKILL.
   *
   * `signalGroup` in `proc.ts` is why the pid is negated, and why a descendant
   * that made a group of its own — which is exactly what Playwright does with
   * the browser it launches — survives it. That is why `sweepOrphans` exists
   * and is not optional.
   */
  async stop(reason: Exclude<StopReason, null>): Promise<void> {
    if (this.stopReason !== null) return;
    this.stopReason = reason;
    const pid = this.child.pid;
    if (pid === undefined) return;
    signalGroup(pid, "SIGTERM");
    this.killTimer = setTimeout(() => {
      signalGroup(pid, "SIGKILL");
    }, KILL_GRACE_MS);
  }
}

function safeParse(line: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Start one attempt.
 *
 * The argv is the security surface, so every flag on it earns its place:
 *
 * - `--settings <per-job file>` is the primary control, written first.
 * - `--setting-sources ""` stops this machine's `~/.claude/settings.json` and
 *   the repo's `.claude/settings.json` contributing rules of their own. Allow
 *   lists **merge** across sources rather than the most specific one winning,
 *   so without this the job's permissions would be the union of three files,
 *   two of which the runner cannot see.
 * - `--permission-prompts none` makes a call that matches no rule a refusal
 *   rather than a wait. In a `-p` session there is no approval surface, so this
 *   is the honest spelling of what already happens, and it stops the agent
 *   retrying the same denied call.
 * - No bare tool name anywhere. `--allowedTools Bash` would allow every
 *   command, which is what the design's first draft got wrong; the allowlist
 *   lives in the settings file as prefixed rules and nothing here overrides it.
 * - `--add-dir <scratch>` because the scratch directory can sit outside the
 *   repository when `STUDIO_HOME` does, and `blockReadsOutsideWorkingDirectories`
 *   would otherwise refuse the agent its own snippets.
 * - `--max-turns` capped server side regardless of the brief.
 */
export async function startAgent(options: AgentOptions): Promise<AgentRun> {
  const settingsInput: SettingsInput = {
    jobId: options.jobId,
    slug: options.slug,
    ...(options.source === undefined ? {} : { source: options.source }),
  };
  const file = settingsPath(options.jobId);
  await mkdir(scratchDir(options.jobId), { recursive: true });
  await mkdir(tmpDir(options.jobId), { recursive: true });
  await writeFile(file, `${JSON.stringify(buildSettings(settingsInput), null, 1)}\n`, "utf8");

  const argv = [
    "-p",
    options.prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--settings",
    file,
    "--setting-sources",
    "",
    "--permission-prompts",
    "none",
    "--add-dir",
    scratchDir(options.jobId),
    "--model",
    options.model,
    "--max-turns",
    String(MAX_TURNS),
    ...(options.resume ? ["--resume", options.sessionId] : ["--session-id", options.sessionId]),
  ];

  const child = spawn(CLAUDE_BIN, argv, {
    cwd: REPO_ROOT,
    // A new process group, so cancel is one signal to the group rather than a
    // signal to a parent whose children outlive it.
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      // Playwright puts the browser profile under os.tmpdir(), so every
      // Chromium this job launches lands under a directory named after the
      // job. That string is what `sweepOrphans` matches on.
      TMPDIR: tmpDir(options.jobId),
    },
  });

  return new AgentRun(child, options);
}

/**
 * Kill anything still running out of this job's temporary directory.
 *
 * The design's fallback rule is "Chromium whose `--user-data-dir` sits under
 * the job scratch directory", and it assumed a flag tldrawkc does not have:
 * there is no `--user-data-dir` option anywhere on that CLI, and the profile is
 * Playwright's own throwaway under `os.tmpdir()`. Pointing the agent's `TMPDIR`
 * at the job workspace is what makes the rule true instead of aspirational —
 * the browser's command line then carries the job's own path, which nothing
 * else on the machine does.
 *
 * It is a fallback and not the mechanism. The group kill takes the agent and
 * everything that stayed in its group; this takes what Playwright deliberately
 * moved out of it, and it returns what it found so a cancel can say whether the
 * group kill was enough.
 */
export async function sweepOrphans(jobId: string): Promise<number[]> {
  const marker = tmpDir(jobId);
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
