/**
 * Every number and name the runner reads from the environment, with the reason
 * it has the value it has.
 *
 * The three timers are guesses and the design says so. They belong here rather
 * than inline so the first ten real jobs can move them without a code read.
 */

function integer(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

/** Loopback only. Not a default that can be widened: see `bindHost`. */
export const PORT = integer("STUDIO_PORT", 7250, 1024, 65535);

/**
 * `127.0.0.1`, and not configurable.
 *
 * D10 makes loopback binding the boundary that replaces the same-origin and
 * rate-limit guards the app's agent routes carry. A `STUDIO_HOST` knob would be
 * a way to switch that boundary off from a dotenv, which is not a knob this
 * service should own.
 */
export const HOST = "127.0.0.1";

/**
 * One job at a time, capped at two.
 *
 * Every tldrawkc verb launches its own Chromium and a job is four or more of
 * them at a 1904px viewport. D9 also notes the second benefit: at 1, two jobs
 * on one file is structurally impossible rather than something a lock has to
 * get right.
 */
export const CONCURRENCY = integer("STUDIO_CONCURRENCY", 1, 1, 2);

/** Per attempt. A diagram job is short Chromium launches, not a video render. */
export const ATTEMPT_TIMEOUT_MS = integer("STUDIO_ATTEMPT_TIMEOUT_MS", 15 * 60_000, 30_000, 3_600_000);

/** Per job, across every attempt. */
export const JOB_TIMEOUT_MS = integer("STUDIO_JOB_TIMEOUT_MS", 45 * 60_000, 60_000, 6 * 3_600_000);

/**
 * Silence on the agent's stdout. This is the one that catches a browser that
 * never answered the bridge, where the CLI's own 30 second exec timeout never
 * fires because the CLI is not the thing that is stuck.
 */
export const IDLE_TIMEOUT_MS = integer("STUDIO_IDLE_TIMEOUT_MS", 5 * 60_000, 30_000, 3_600_000);

/** Capped server side regardless of what a brief asks for. */
export const MAX_TURNS = integer("STUDIO_MAX_TURNS", 60, 1, 200);

/** Three attempts, and a retry only ever carries a specific gate finding. */
export const MAX_ATTEMPTS = integer("STUDIO_MAX_ATTEMPTS", 3, 1, 5);

/** Drawing loops are mechanical, so the default is the cheaper tier. */
export const DEFAULT_MODEL = "sonnet";
export const MODELS = ["sonnet", "opus"] as const;
export type Model = (typeof MODELS)[number];

/** Seconds between SIGTERM to the process group and SIGKILL. */
export const KILL_GRACE_MS = integer("STUDIO_KILL_GRACE_MS", 5_000, 500, 60_000);

/** How many SSE events one connection buffers before it starts dropping. */
export const SSE_BUFFER = integer("STUDIO_SSE_BUFFER", 500, 50, 10_000);

/** The name this runner claims jobs under. One runner per generator kind: D25. */
export const RUNNER_NAME = "studio-diagrams";

/** The `claude` binary. Overridable the way manimkc's `MANIMKC_CLAUDE_BIN` is. */
export const CLAUDE_BIN = process.env.STUDIO_CLAUDE_BIN?.trim() || "claude";

/**
 * Where the spawned agent's credential comes from: `login` or `env`.
 *
 * `login`, the default, strips the Anthropic auth variables out of the agent's
 * environment (`AGENT_AUTH_ENV` in `agent.ts` lists them), so `claude -p` uses
 * the account this machine is logged in to, which is what an interactive
 * `claude` uses. `env` passes them through, for a machine that really does run
 * the CLI on an API key.
 *
 * The default is `login` because inheriting was an accident rather than a
 * choice. `npm run studio` inherits whatever the shell it was started from
 * exports, and a login shell that exports an `ANTHROPIC_API_KEY` for some other
 * tool hands that key to the agent. In `-p` mode the CLI uses an environment
 * key without asking, where an interactive session asks first and remembers a
 * refusal, so the same machine could run `claude` fine by hand and have every
 * studio job fail on its first request. It happened: an organisation key with
 * no workspace scope, three attempts at `API Error: 400`, and a panel that
 * reported a missing file.
 *
 * A function rather than a constant, like `dailyCapUsd`: it is read once per
 * job, so a restart is enough to change it and a test can set it without
 * controlling import order. Anything other than `env` means `login`, because
 * the safe reading of a typo is the one that does not hand a key to a child.
 */
export type AgentAuth = "login" | "env";

export function agentAuth(): AgentAuth {
  return process.env.STUDIO_AGENT_AUTH?.trim().toLowerCase() === "env" ? "env" : "login";
}

/** What `/api/health` and the startup banner say about the agent's credential. */
export interface AgentAuthReport {
  mode: AgentAuth;
  /** The setting as written, so a typo that fell back to `login` is visible. */
  setting: string | null;
  /** Whether the runner's own environment has a non-empty key. Never the key. */
  apiKeySet: boolean;
  note: string;
}

export function agentAuthReport(): AgentAuthReport {
  const mode = agentAuth();
  const setting = process.env.STUDIO_AGENT_AUTH?.trim() || null;
  const apiKeySet = (process.env.ANTHROPIC_API_KEY?.trim() ?? "") !== "";
  const note =
    mode === "login"
      ? apiKeySet
        ? "the agent runs on this machine's claude login; the ANTHROPIC_API_KEY in the runner's environment is stripped before it starts"
        : "the agent runs on this machine's claude login"
      : apiKeySet
        ? "the agent runs on the ANTHROPIC_API_KEY in the runner's environment"
        : "STUDIO_AGENT_AUTH=env, and ANTHROPIC_API_KEY is not set, so the agent uses whatever credential the rest of the environment or the login gives it";
  return { mode, setting, apiKeySet, note };
}

/** A cap on every free-text brief field, so none can carry a paragraph of prompt. */
export const TEXT_LIMIT = integer("STUDIO_TEXT_LIMIT", 2_000, 200, 20_000);

/** A cap on the mermaid source, which is written to a file and never to the prompt. */
export const MERMAID_LIMIT = integer("STUDIO_MERMAID_LIMIT", 20_000, 1_000, 200_000);

/**
 * How long a mirror nobody has asked about is kept open.
 *
 * A browser leaving the canvas screen cannot be relied on to say so — a closed
 * lid sends nothing — so the lifecycle is a timer rather than a DELETE. Fifteen
 * minutes is long enough to read a diagram, think, and come back to the same
 * tab, and short enough that a forgotten window is not a Node process and a
 * port held overnight.
 */
export const MIRROR_IDLE_MS = integer("STUDIO_MIRROR_IDLE_MS", 15 * 60_000, 30_000, 6 * 3_600_000);

/** How long `serve` gets to print the object that says it is listening. */
export const MIRROR_START_MS = integer("STUDIO_MIRROR_START_MS", 30_000, 2_000, 300_000);

/**
 * How long `/api/health` reuses the last vocabulary read instead of spawning
 * `catalog topic ls` again. Every studio page render asks health, and a
 * `topic ls` is a Node process and a database round trip; a brief is still
 * checked against a fresh read, so this only bounds how old the health line is.
 */
export const VOCABULARY_STATUS_MS = integer("STUDIO_VOCABULARY_STATUS_MS", 30_000, 0, 600_000);

/** The server-side poll of a mirror's own `/api/health`, which the page cannot do (D13). */
export const MIRROR_HEALTH_MS = integer("STUDIO_MIRROR_HEALTH_MS", 2_000, 200, 30_000);

/** A `canvas` verb the UI triggers: one Chromium launch, so generous but bounded. */
export const VERB_TIMEOUT_MS = integer("STUDIO_VERB_TIMEOUT_MS", 180_000, 10_000, 900_000);

/**
 * The rolling-day spend cap, in US dollars. Unset means no cap at all.
 *
 * Phase 7, and the sixth guard on top of A10's five rather than a replacement
 * for any of them: `sonnet` by default, sixty turns per attempt, three attempts
 * with a specific finding attached to each retry, and the forty-five minute
 * ceiling all still fire first and in that order. This one is checked last, at
 * enqueue, and only ever refuses — it never stops a job that is already
 * running, because killing paid work halfway is how a cap turns into a bill
 * with nothing to show for it.
 *
 * A float, not an integer: the jobs this meters cost about thirteen cents each,
 * so a cap that could only be whole dollars would have no useful setting
 * between "seven jobs" and "fifteen".
 *
 * A function rather than a constant, unlike every other knob in this file.
 * Those are read once because a runner's timers and concurrency cannot change
 * under it; a cap is the one thing somebody raises *because* they have just
 * been refused, and reading it per enqueue means a restart is enough rather
 * than a restart at the right moment. It is also the only way a test can set
 * one without controlling module import order.
 *
 * Unset is the default and stays the default. One user on one machine has
 * nothing to meter, which is the design's own reason for putting this phase
 * last; a knob that defaulted to a number would be this service inventing a
 * budget nobody asked it to hold.
 */
export function dailyCapUsd(): number | null {
  const raw = process.env.STUDIO_DAILY_USD?.trim();
  if (raw === undefined || raw === "") return null;
  // `Number.parseFloat` takes a numeric *prefix*, so it reads `0.2oops` as a
  // $0.20 cap — a typo silently becoming a real budget that then refuses jobs,
  // which is the opposite of the behaviour documented below. The whole trimmed
  // value has to be a number. Caught by Greptile on the phase 7 PR.
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const parsed = Number.parseFloat(raw);
  // A value that is not a number is not a cap of zero. Refusing every job
  // because a dotenv has a typo in it is the worst of both answers, so an
  // unreadable value means unset — and `/api/health` reports what is in force.
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

/** The window the cap counts over. Rolling, never a calendar day. */
export const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
