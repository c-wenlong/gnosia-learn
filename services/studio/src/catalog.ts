import { NPM, run } from "./proc";

/**
 * Postgres, reached only through `npm run --silent catalog --`.
 *
 * The studio opens no connection of its own, and that is a deliberate choice
 * with three consequences worth stating.
 *
 * **There is one implementation of every rule.** `job enqueue` is where the
 * lease, the idempotency key and the topic foreign key live; `assert-output` is
 * where "what a diagram asset row looks like" lives, through the same reader
 * the full index calls. Phase 1 drives those verbs. A second copy here would be
 * a second set of rules that agrees with the first until it does not.
 *
 * **A database that is down is one failed subprocess, not a crash.** Every call
 * returns a result rather than throwing, so the caller decides. D16 is the
 * policy: no tldrawkc build refuses the job outright, no database does not —
 * the artifacts are files and the index is derived from them.
 *
 * **The disk record is written first.** Rule 7: `job.json` and `session.ndjson`
 * are the write-ahead log and Postgres is the query surface, so every function
 * here is called after the runner has already recorded what happened.
 */

export interface CatalogResult {
  ok: boolean;
  json: unknown;
  /** A sentence a person can act on, when `ok` is false. */
  error: string | null;
}

async function catalog(args: string[], timeoutMs = 120_000): Promise<CatalogResult> {
  try {
    const result = await run(NPM, ["run", "--silent", "catalog", "--", ...args, "--json"], {
      timeoutMs,
    });
    if (result.code === 0) return { ok: true, json: result.json, error: null };
    const detail = (result.stderr.trim() || result.stdout.trim() || "").split("\n").slice(-4).join(" ");
    return {
      ok: false,
      json: result.json,
      error: result.timedOut
        ? `catalog ${args[0] ?? ""} timed out after ${timeoutMs}ms`
        : `catalog ${args.join(" ")} exited ${result.code}: ${detail}`,
    };
  } catch (error) {
    return { ok: false, json: null, error: `could not run the catalog CLI: ${(error as Error).message}` };
  }
}

export interface SessionStartInput {
  id: string;
  title: string;
  goal?: string;
  agentSessionId?: string;
}

export function sessionStart(input: SessionStartInput): Promise<CatalogResult> {
  return catalog([
    "session",
    "start",
    "--id",
    input.id,
    "--kind",
    "studio",
    "--title",
    input.title,
    ...(input.goal === undefined ? [] : ["--goal", input.goal]),
    ...(input.agentSessionId === undefined ? [] : ["--agent-session", input.agentSessionId]),
  ]);
}

export function sessionEnd(id: string, state: string, error?: string): Promise<CatalogResult> {
  return catalog([
    "session",
    "end",
    "--id",
    id,
    "--state",
    state,
    ...(error === undefined ? [] : ["--error", error.slice(0, 500)]),
  ]);
}

/** `job enqueue --brief <file>`. The file is the job workspace's own brief.json. */
export function jobEnqueue(briefFile: string): Promise<CatalogResult> {
  return catalog(["job", "enqueue", "--brief", briefFile]);
}

export function jobClaim(jobId: string, runner: string, sessionId: string): Promise<CatalogResult> {
  return catalog(["job", "claim", "--job", jobId, "--runner", runner, "--session", sessionId]);
}

export interface JobFinishInput {
  jobId: string;
  state: string;
  phase?: string;
  candidatePath?: string;
  gateFile?: string;
  exitCode?: number | null;
  turns?: number | null;
  costUsd?: number | null;
  errorKind?: string;
  error?: string;
}

export function jobFinish(input: JobFinishInput): Promise<CatalogResult> {
  return catalog([
    "job",
    "finish",
    "--job",
    input.jobId,
    "--state",
    input.state,
    ...(input.phase === undefined ? [] : ["--phase", input.phase]),
    ...(input.candidatePath === undefined ? [] : ["--candidate", input.candidatePath]),
    ...(input.gateFile === undefined ? [] : ["--gate", input.gateFile]),
    ...(input.exitCode === undefined || input.exitCode === null
      ? []
      : ["--exit-code", String(input.exitCode)]),
    ...(input.turns === undefined || input.turns === null ? [] : ["--turns", String(input.turns)]),
    ...(input.costUsd === undefined || input.costUsd === null
      ? []
      : ["--cost", String(input.costUsd)]),
    ...(input.errorKind === undefined ? [] : ["--error-kind", input.errorKind]),
    ...(input.error === undefined ? [] : ["--error", input.error.slice(0, 500)]),
  ]);
}

/**
 * `job accept --path <p> --path <p>`: the asserts and the transition, in one
 * transaction the catalog owns.
 *
 * This is the only step of accept that needs Postgres, and it is deliberately
 * last. Everything that can fail has already happened by the time it runs, and
 * if it fails anyway the files are still on disk where a person put them: the
 * job reports `indexed: false` with the reason and a Reindex re-runs it.
 */
export function jobAccept(jobId: string, paths: string[]): Promise<CatalogResult> {
  return catalog(["job", "accept", "--job", jobId, ...paths.flatMap((p) => ["--path", p])]);
}

export function jobDiscard(jobId: string): Promise<CatalogResult> {
  return catalog(["job", "discard", "--job", jobId]);
}

export function jobShow(jobId: string): Promise<CatalogResult> {
  return catalog(["job", "show", "--job", jobId]);
}

/** `catalog status`, used by `/api/health` to say whether Postgres is answering. */
export function status(): Promise<CatalogResult> {
  return catalog(["status"], 30_000);
}
