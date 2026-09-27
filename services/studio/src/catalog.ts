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
  /**
   * True only when there is demonstrably **nothing there to talk to**: no
   * `DATABASE_URL`, nothing listening on the address, a name that does not
   * resolve, or a CLI that would not start.
   *
   * This is the distinction D16 turns on, and two callers need it, because
   * `false` means "refuse" and `true` means "run this job without the
   * database-backed lease". That second one is only safe when no other runner
   * can be holding that lease, which is why the test is this narrow rather than
   * "the error looks like a connection problem".
   *
   * A live database that refused *this* process is emphatically not offline:
   * bad credentials, `too many clients`, a server still starting up, a dropped
   * socket. In every one of those the database is up and a correctly configured
   * runner may be working against it right now, so running lease-free would put
   * two agents on one candidate path. They are refusals, and the studio says so.
   *
   * `false` on a successful call too, which never reads it.
   */
  offline: boolean;
}

/**
 * The catalog CLI's exit code for "nothing there to talk to".
 *
 * The same number as `EXIT_UNREACHABLE` in
 * `services/catalog/src/connection-failure.ts`, repeated rather than imported:
 * the studio reaches the catalog only through its CLI, and the catalog package
 * exports nothing but `./state`. `test/catalog-offline.test.ts` runs the real
 * CLI against a dead port, which is what keeps the two in step.
 *
 * The CLI decides it from the driver's error codes (`ECONNREFUSED`,
 * `ENOTFOUND`, `EAI_AGAIN`), after unwrapping drizzle's `Failed query: ...`
 * wrapper, and a live server that refused (bad credentials, no such database,
 * too many clients) stays exit 1. That is the same bar the list below sets:
 * not "this is a connection error" but **"this proves nothing else is using the
 * database either"**, because the caller runs the job lease-free on it.
 */
export const CATALOG_UNREACHABLE = 3;

/**
 * The fallback, for a catalog CLI older than {@link CATALOG_UNREACHABLE}, which
 * exited 1 for everything and left the message as the only signal.
 *
 * It never matched what that CLI actually printed for a dead port, because
 * drizzle wrapped the driver error as `Failed query: <sql>` and the code never
 * reached the text. It stays for the lines it does match (a CLI that would not
 * start, an unwrapped driver message) and because anything not on it is a
 * refusal, which is the direction that costs a job rather than corrupting one.
 */
const OFFLINE =
  /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|could not run the catalog CLI|DATABASE_URL/i;

async function catalog(args: string[], timeoutMs = 120_000): Promise<CatalogResult> {
  try {
    const result = await run(NPM, ["run", "--silent", "catalog", "--", ...args, "--json"], {
      timeoutMs,
    });
    if (result.code === 0) return { ok: true, json: result.json, error: null, offline: false };
    const detail = (result.stderr.trim() || result.stdout.trim() || "").split("\n").slice(-4).join(" ");
    const error = result.timedOut
      ? `catalog ${args[0] ?? ""} timed out after ${timeoutMs}ms`
      : `catalog ${args.join(" ")} exited ${result.code}: ${detail}`;
    return {
      ok: false,
      json: result.json,
      error,
      // A timeout is not offline: the server may be alive and slow, or busy
      // serving somebody else, and "slow" is not a licence to skip the lease.
      offline:
        !result.timedOut && (result.code === CATALOG_UNREACHABLE || OFFLINE.test(detail)),
    };
  } catch (error) {
    return {
      ok: false,
      json: null,
      error: `could not run the catalog CLI: ${(error as Error).message}`,
      offline: true,
    };
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
  /** `result` or `stream`: whether that figure is the bill or an estimate. */
  costSource?: string | null;
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
    ...(input.costSource === undefined || input.costSource === null
      ? []
      : ["--cost-source", input.costSource]),
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
