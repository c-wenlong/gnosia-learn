import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

import {
  agentAuth,
  ATTEMPT_TIMEOUT_MS,
  CLAUDE_BIN,
  IDLE_TIMEOUT_MS,
  KILL_GRACE_MS,
  MAX_TURNS,
  type AgentAuth,
  type Model,
} from "./config";
import { diagramPathProblem, writeDiagramGuard } from "./diagram-guard";
import { candidateDir, REPO_ROOT, scratchDir, settingsPath, studioHome, tmpDir } from "./paths";
import { signalGroup, sweepByMarker } from "./proc";
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
  /**
   * Where the agent's credential comes from. The runner reads `agentAuth()`
   * once per job, records it, and passes it here, so the record and the spawn
   * cannot disagree. Absent means the setting as it is right now.
   */
  auth?: AgentAuth;
  /**
   * Called once per attempt with the CLI's own `system/init` event, which is
   * the only place the stream says which credential the session is using.
   */
  onInit?: (init: AgentInit) => void;
  /**
   * The tldraw manual this job runs with, `$STUDIO_HOME/manual/<hash>.md`, or
   * null for none. Passed on every attempt, resumes included, and always the
   * job's own file rather than the newest: see `startAgent`.
   */
  manualPath?: string | null;
}

/** What the CLI's `system/init` event says about the session it started. */
export interface AgentInit {
  /**
   * `ANTHROPIC_API_KEY`, `apiKeyHelper`, `/login managed key`, `none`, and a
   * few more: the CLI's own vocabulary, kept verbatim rather than mapped, so a
   * value this file has never heard of still reaches the log.
   */
  apiKeySource: string | null;
  model: string | null;
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
   * The final `result` event's own `result` text, cut to `RESULT_LIMIT`.
   *
   * On a session that failed its first request this is the API's message,
   * such as `API Error: 400 This API key is not scoped to a workspace…`, and
   * it is the one sentence that says what actually went wrong. The `subtype` beside
   * it said `success` on exactly that session, so it cannot stand in.
   */
  result: string | null;
  /** From the `system/init` event: where this attempt's credential came from. */
  apiKeySource: string | null;
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
/**
 * What an `AgentRun` needs from whoever spawned it: the two callbacks and the
 * timers. The diagram agent passes its attempt and idle ceilings; the video
 * agent passes one hang timer and a way to ask whether the job is still doing
 * something the stream does not show (D54 of docs/STUDIO-VIDEOS.md).
 */
export interface RunWatch {
  onLine: (line: string) => void;
  onInit?: (init: AgentInit) => void;
  /** Stop after this long whatever happens. Null for no ceiling. */
  attemptMs: number | null;
  /** Stop after this long with nothing on stdout. Null for no idle stop. */
  idleMs: number | null;
  /**
   * Asked when the idle timer fires. True means the job is still working in a
   * way the stream does not show (a render writing files), and the timer is
   * armed again rather than the session stopped.
   */
  stillWorking?: () => Promise<boolean>;
}

export class AgentRun {
  private readonly child: ChildProcess;
  private readonly options: RunWatch;
  private stopReason: StopReason = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private attemptTimer: NodeJS.Timeout | null = null;
  private killTimer: NodeJS.Timeout | null = null;
  /** Bumped by every line of output: which silence a pending `stillWorking` answer is about. */
  private activity = 0;
  readonly done: Promise<AgentOutcome>;

  constructor(child: ChildProcess, options: RunWatch) {
    this.child = child;
    this.options = options;
    this.done = this.watch();
  }

  /** The process group id, which is the child's pid for a detached spawn. */
  get pid(): number | undefined {
    return this.child.pid;
  }

  private touch(): void {
    this.activity += 1;
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    const idleMs = this.options.idleMs;
    if (idleMs === null || this.stopReason !== null) return;
    this.idleTimer = setTimeout(() => {
      // Silence, not slowness. The CLI's own 30 second exec timeout covers a
      // command that hangs; this covers a browser that never answered the
      // bridge, where nothing is running and nothing will time out.
      const check = this.options.stillWorking;
      if (check === undefined) {
        void this.stop("idle-timeout");
        return;
      }
      // The check is asynchronous, and output can arrive while it runs. That
      // output re-armed the timer, so a verdict about the silence before it
      // is stale and must not stop a session that has since spoken.
      const asked = this.activity;
      void check()
        .catch(() => false)
        .then((working) => {
          if (this.activity !== asked || this.stopReason !== null) return;
          if (working) this.touch();
          else void this.stop("idle-timeout");
        });
    }, idleMs);
  }

  private watch(): Promise<AgentOutcome> {
    return new Promise((resolve) => {
      let turns: number | null = null;
      let subtype: string | null = null;
      let isError = false;
      let result: string | null = null;
      let apiKeySource: string | null = null;
      let stderr = "";
      const denials: { tool: string; input: unknown }[] = [];
      let buffer = "";

      if (this.options.attemptMs !== null) {
        this.attemptTimer = setTimeout(() => {
          void this.stop("attempt-timeout");
        }, this.options.attemptMs);
      }
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
          if (event.type === "system" && event.subtype === "init") {
            apiKeySource = typeof event.apiKeySource === "string" ? event.apiKeySource : null;
            this.options.onInit?.({
              apiKeySource,
              model: typeof event.model === "string" ? event.model : null,
            });
            continue;
          }
          if (event.type === "result") {
            // `turns` still comes from the final result event and from nowhere
            // else: there is no per-turn counter in the stream to accumulate,
            // and a killed attempt genuinely does not know how many turns it
            // took. Cost is a different question with a different answer —
            // `cost.ts` and the note on this outcome above.
            turns = numberOrNull(event.num_turns);
            subtype = typeof event.subtype === "string" ? event.subtype : null;
            isError = event.is_error === true;
            result = typeof event.result === "string" ? clip(event.result, RESULT_LIMIT) : null;
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
          result,
          apiKeySource,
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
          result: null,
          apiKeySource: null,
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
 * How much of the result text an outcome keeps. It ends up on `job.error`, in
 * the catalog row and in the panel, so a paragraph is plenty; a session that
 * finished normally can write a long summary here and none of it is wanted.
 */
const RESULT_LIMIT = 1_000;

function clip(text: string, limit: number): string {
  const trimmed = text.trim();
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit - 1)}…`;
}

/**
 * Every environment variable the CLI reads to decide *which credential* a
 * session uses and *where its requests go*. Under `STUDIO_AGENT_AUTH=login`,
 * the default, none of them reaches the agent, so the CLI falls back to the
 * account this machine is logged in to.
 *
 * Found by reading the variable names out of the installed CLI (2.1.274)
 * rather than from memory, and grouped by what each one does:
 *
 * - The credential itself: an API key, a bearer token, an OAuth token or a
 *   file descriptor carrying one, and the workload-identity federation set
 *   (`ANTHROPIC_IDENTITY_TOKEN*`, `ANTHROPIC_FEDERATION_RULE_ID`,
 *   `ANTHROPIC_SERVICE_ACCOUNT_ID`, `ANTHROPIC_SCOPE`, and `ANTHROPIC_PROFILE`
 *   and `ANTHROPIC_CONFIG_DIR`, which name the federation config file).
 * - Where requests go and what they carry: the base URLs, custom headers, and
 *   the organisation and workspace ids a key-based request is scoped by.
 *   `ANTHROPIC_BASE_URL` is here even when it names the public API, because a
 *   base URL is half of an auth setup and a login needs neither half.
 * - The switches to another provider (Bedrock, Vertex, Foundry and the rest)
 *   and the credentials those take directly. Their AWS and Google variables
 *   are left alone: with the switch off the CLI never reads them, and they
 *   belong to other tools on the same machine.
 * - A parent SDK host's hand-off (`CLAUDE_CODE_SDK_HAS_*_REFRESH`,
 *   `CLAUDE_CODE_HOST_*`, `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST`,
 *   `CLAUDE_CODE_SESSION_ACCESS_TOKEN`). A studio started from inside a Claude
 *   session inherits these, and they tell the child that a host it does not
 *   have will supply and refresh its credential.
 *
 * `CLAUDE_CONFIG_DIR` is deliberately **not** here: it is where the login
 * itself is stored, so stripping it would move the agent off the very account
 * this list exists to put it on.
 */
export const AGENT_AUTH_ENV: readonly string[] = [
  // The credential.
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR",
  "CLAUDE_CODE_OAUTH_REFRESH_TOKEN",
  "CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR",
  "ANTHROPIC_IDENTITY_TOKEN",
  "ANTHROPIC_IDENTITY_TOKEN_FILE",
  "ANTHROPIC_FEDERATION_RULE_ID",
  "ANTHROPIC_SERVICE_ACCOUNT_ID",
  "ANTHROPIC_SCOPE",
  "ANTHROPIC_PROFILE",
  "ANTHROPIC_CONFIG_DIR",
  // Where requests go, and what they carry.
  "ANTHROPIC_BASE_URL",
  "CLAUDE_CODE_API_BASE_URL",
  "ANTHROPIC_CUSTOM_HEADERS",
  "ANTHROPIC_ORGANIZATION_ID",
  "ANTHROPIC_WORKSPACE_ID",
  "CLAUDE_CODE_ORGANIZATION_UUID",
  // Another provider, and the credentials those take directly.
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
  "CLAUDE_CODE_USE_ANTHROPIC_AWS",
  "CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD",
  "CLAUDE_CODE_USE_GATEWAY",
  "CLAUDE_CODE_USE_MANTLE",
  "AWS_BEARER_TOKEN_BEDROCK",
  "ANTHROPIC_AWS_API_KEY",
  "ANTHROPIC_FOUNDRY_API_KEY",
  "ANTHROPIC_FOUNDRY_AUTH_TOKEN",
  // A parent SDK host's credential hand-off.
  "CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST",
  "CLAUDE_CODE_HOST_AUTH_ENV_VAR",
  "CLAUDE_CODE_HOST_CREDS_FILE",
  "CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH",
  "CLAUDE_CODE_SDK_HAS_OAUTH_REFRESH",
  "CLAUDE_CODE_SESSION_ACCESS_TOKEN",
];

/**
 * The agent's environment: this process's, less the auth variables under
 * `login`, with `TMPDIR` and `CLAUDE_CODE_TMPDIR` pointed into the job
 * workspace.
 *
 * Built from a copy, never by deleting from `process.env`, because the runner
 * itself (and `STUDIO_AGENT_AUTH=env` on the next job) still reads it.
 */
export function agentEnv(base: NodeJS.ProcessEnv, auth: AgentAuth, tmp: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  if (auth === "login") {
    for (const name of AGENT_AUTH_ENV) delete env[name];
  }
  // Playwright puts the browser profile under os.tmpdir(), so every Chromium
  // this job launches lands under a directory named after the job. That
  // string is what `sweepOrphans` matches on.
  env.TMPDIR = tmp;
  // The CLI's own temp root, which it does not take from `TMPDIR`: it is
  // `CLAUDE_CODE_TMPDIR`, else `/tmp`, plus `claude-<uid>/`. The session's
  // scratchpad lives under it, and the CLI allows every write there before it
  // reads an allow rule (measured on 2.1.274; `claudeTempRules` in
  // `settings.ts` has the detail). Left alone, a job wrote a snippet into
  // `/private/tmp/claude-501/<cwd>/<session>/scratchpad/`, outside its
  // workspace, and the tool said "File created successfully". Pointed here,
  // the scratchpad is inside the job's own `tmp/` and goes with the job.
  env.CLAUDE_CODE_TMPDIR = tmp;
  return env;
}

/**
 * Start one attempt.
 *
 * The argv is the security surface, so every flag on it earns its place:
 *
 * - `--settings <per-job file>` is the primary control, written first, with
 *   the job's Bash guard (`diagram-guard.ts`) as a `PreToolUse` hook in it.
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
 * - `--add-dir <scratch>` and `--add-dir <candidate>` because both sit in the
 *   job workspace, which is outside the repository whenever `STUDIO_HOME` is,
 *   and `blockReadsOutsideWorkingDirectories` would otherwise refuse the agent
 *   its own snippets and the document it is drawing. The candidate directory
 *   and not the workspace: the workspace root holds the runner's records.
 * - `--max-turns` capped server side regardless of the brief.
 * - `--strict-mcp-config` with an empty `--mcp-config` seals the session from
 *   this machine's own MCP servers, `claude_desktop_config.json` included.
 *   Measured (docs/STUDIO-CHAT-FIRST.md, D34, open question 4): without it, a
 *   spawn on this machine loaded this account's claude.ai connectors anyway —
 *   Gmail, Slack, Drive, Calendar, Docs, 90 tools and about 69,500 tokens of
 *   definitions on every request, a Gmail send tool among them, guarded only by
 *   `--permission-prompts none`, which refuses a *call* but does not stop the
 *   definitions riding the request. `--setting-sources ""` alone does not close
 *   this: connectors are not a setting source.
 * - `--append-system-prompt-file <manual>` adds the tldraw manual to Claude
 *   Code's own system prompt (docs/STUDIO-CHAT-FIRST.md, D30). The file form
 *   rather than `--append-system-prompt <text>`: the text is about 38,000
 *   characters, well inside the argument limit, but it would sit in every
 *   `ps` listing and in each recorded argv, and the file is already on disk
 *   under its hash. Measured on the installed CLI (2.1.274): a `--resume`
 *   sends the system prompt recorded on the session's first request and
 *   ignores a different file passed later (`--system-prompt-snapshot`, on by
 *   default), so attempts two and three read the manual attempt one started
 *   with. The job's own file is still passed on every attempt, never the
 *   newest, so the two agree even where the CLI renders the prompt again,
 *   which it does after a compaction (M1).
 */
export async function startAgent(options: AgentOptions): Promise<AgentRun> {
  const file = settingsPath(options.jobId);
  await mkdir(scratchDir(options.jobId), { recursive: true });
  await mkdir(candidateDir(options.jobId), { recursive: true });
  await mkdir(tmpDir(options.jobId), { recursive: true });
  // The enqueue check again, for a job queued before the studio home moved:
  // refused before anything is spawned, with the same sentence.
  const pathProblem = diagramPathProblem(studioHome());
  if (pathProblem !== null) throw new Error(`the diagram agent cannot run from this studio home: ${pathProblem}`);
  // After the directories, so the policy can name their resolved spellings.
  const guard = await writeDiagramGuard(options.jobId, options.slug);
  const settingsInput: SettingsInput = {
    jobId: options.jobId,
    slug: options.slug,
    guard,
    ...(options.source === undefined ? {} : { source: options.source }),
  };
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
    "--strict-mcp-config",
    "--mcp-config",
    '{"mcpServers":{}}',
    "--add-dir",
    scratchDir(options.jobId),
    "--add-dir",
    candidateDir(options.jobId),
    "--model",
    options.model,
    "--max-turns",
    String(MAX_TURNS),
    ...(options.manualPath === undefined || options.manualPath === null
      ? []
      : ["--append-system-prompt-file", options.manualPath]),
    ...(options.resume ? ["--resume", options.sessionId] : ["--session-id", options.sessionId]),
  ];

  return spawnClaude(argv, {
    cwd: REPO_ROOT,
    // Deliberate rather than inherited: `agentEnv` and `STUDIO_AGENT_AUTH` in
    // `config.ts` say why a shell's `ANTHROPIC_API_KEY` must not reach here.
    env: agentEnv(process.env, options.auth ?? agentAuth(), tmpDir(options.jobId)),
    watch: {
      onLine: options.onLine,
      ...(options.onInit === undefined ? {} : { onInit: options.onInit }),
      attemptMs: ATTEMPT_TIMEOUT_MS,
      idleMs: IDLE_TIMEOUT_MS,
    },
  });
}

/**
 * Spawn `claude` with an argv somebody else built, into its own process
 * group, and watch it. The one place either runner starts an agent, so the
 * group, the stream parsing and the stop are the same for both kinds.
 */
export function spawnClaude(
  argv: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; watch: RunWatch },
): AgentRun {
  const child = spawn(CLAUDE_BIN, argv, {
    cwd: options.cwd,
    // A new process group, so cancel is one signal to the group rather than a
    // signal to a parent whose children outlive it.
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: options.env,
  });
  return new AgentRun(child, options.watch);
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
  return sweepByMarker(tmpDir(jobId));
}
