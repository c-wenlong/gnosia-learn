import { studioOwner } from "./config";
import { NPM, run } from "./proc";

/**
 * Postgres, reached only through `npm run --silent catalog --`.
 *
 * The studio opens no connection of its own, and that is a deliberate choice
 * with three consequences worth stating.
 *
 * **There is one implementation of every rule.** `job enqueue` is where the
 * lease, the idempotency key and the topic foreign key live; `diagram put` is
 * where "what a diagram's rows look like" lives, through the same reader the
 * full import calls. Phase 1 drives those verbs. A second copy here would be
 * a second set of rules that agrees with the first until it does not.
 *
 * **A database that is down is one failed subprocess, not a crash.** Every call
 * returns a result rather than throwing, so the caller decides. D16 is the
 * policy: no tldrawkc build refuses the job outright, no database does not,
 * since drawing needs only files. Landing a diagram does need it now: a
 * diagram lives in the database (Track D of docs/CONTENT-MIGRATION.md), so
 * with Postgres down Accept refuses and the candidate waits (edge case 1).
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

function catalog(args: string[], timeoutMs = 120_000): Promise<CatalogResult> {
  return npmCli("catalog", args, timeoutMs);
}

/**
 * One of the repository's two CLIs, with `--json`: `catalog`, or `learn`
 * for what only it answers (a concept note's text). The same exit codes, so
 * the same reading of "offline".
 */
async function npmCli(script: "catalog" | "learn", args: string[], timeoutMs: number): Promise<CatalogResult> {
  try {
    const result = await run(NPM, ["run", "--silent", script, "--", ...args, "--json"], {
      timeoutMs,
    });
    if (result.code === 0) return { ok: true, json: result.json, error: null, offline: false };
    const detail = (result.stderr.trim() || result.stdout.trim() || "").split("\n").slice(-4).join(" ");
    const error = result.timedOut
      ? `${script} ${args[0] ?? ""} timed out after ${timeoutMs}ms`
      : `${script} ${args.join(" ")} exited ${result.code}: ${detail}`;
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
      error: `could not run the ${script} CLI: ${(error as Error).message}`,
      offline: true,
    };
  }
}

/**
 * Told after every write that changes what the grid lists: a diagram, a
 * video or a topic landing. The runner keeps its lists (`listings.ts`) and
 * drops them here, so the next page after a write this studio made reads the
 * catalog again rather than the list from before it. A listener is told
 * whether the write took or not: a refused write costs one fresh read.
 */
const writeListeners = new Set<() => void>();

export function onCatalogWrite(listener: () => void): () => void {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}

function wrote(result: Promise<CatalogResult>): Promise<CatalogResult> {
  return result.finally(() => {
    for (const listener of writeListeners) listener();
  });
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
    ...owned(),
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
    ...owned(),
  ]);
}

/** `job enqueue --brief <file>`. The file is the job workspace's own brief.json. */
export function jobEnqueue(briefFile: string, options: { discardParent?: string } = {}): Promise<CatalogResult> {
  return catalog([
    "job",
    "enqueue",
    "--brief",
    briefFile,
    // A video change whose parent is still in review (D52 of
    // docs/STUDIO-VIDEOS.md): the parent is discarded and this job inserted in
    // one transaction, so the slug's lease passes across with no gap and a
    // refusal leaves the parent as it was.
    ...(options.discardParent === undefined ? [] : ["--discard-parent", options.discardParent]),
    ...owned(),
  ]);
}

export function jobClaim(jobId: string, runner: string, sessionId: string): Promise<CatalogResult> {
  return catalog(["job", "claim", "--job", jobId, "--runner", runner, "--session", sessionId, ...owned()]);
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
    ...owned(),
  ]);
}

/**
 * `job accept --job <id>`: the transition to `accepted`, which the catalog
 * allows once the job's outputs are recorded (`asset_job` rows, written by
 * `diagram put --job` in the transaction that landed the diagram).
 *
 * Its own call, after the put, so a failure here leaves the diagram landed and
 * the job answering Reindex, which runs this again.
 */
export function jobAccept(jobId: string): Promise<CatalogResult> {
  return wrote(catalog(["job", "accept", "--job", jobId, ...owned()]));
}

/* -------------------------------------------------------------------------- */
/* Diagrams (Track D of docs/CONTENT-MIGRATION.md)                            */
/* -------------------------------------------------------------------------- */

/**
 * `--owner`, on every diagram, draft, job, session and topic verb, and on the
 * `learn` verb (`concept show`): the catalog then lists, shows and checks out
 * only what this studio's owner may read (their own diagrams and topics and
 * the commons'), acts only on their jobs and sessions, and writes as them
 * (phase 4). Without it the CLI would act as its own default owner, which is
 * only the same person by coincidence, and `topic ls` would list every
 * owner's topics. `test/owner.test.ts` fails a verb here that leaves it out.
 */
function owned(): string[] {
  return ["--owner", studioOwner()];
}

/** `catalog diagram list`: every live diagram this studio's owner may read. */
export function diagramList(): Promise<CatalogResult> {
  return catalog(["diagram", "list", ...owned()], 60_000);
}

/** `catalog diagram show <slug> --dir <work>`: one diagram and where its checkout stands. */
export function diagramShow(slug: string, dir: string): Promise<CatalogResult> {
  return catalog(["diagram", "show", slug, "--dir", dir, ...owned()], 60_000);
}

/** `catalog diagram checkout <slug> --dir <work>`: refresh the file every verb runs on. */
export function diagramCheckout(slug: string, dir: string): Promise<CatalogResult> {
  return catalog(["diagram", "checkout", slug, "--dir", dir, ...owned()], 60_000);
}

/** `catalog diagram commit <slug>`: the checkout into the database, refused when its base moved. */
export function diagramCommit(slug: string, dir: string, reason: string): Promise<CatalogResult> {
  return wrote(catalog(["diagram", "commit", slug, "--dir", dir, "--reason", reason, ...owned()]));
}

export interface DiagramPutInput {
  slug: string;
  /** Absolute paths: the job's candidates. */
  tldr: string;
  svg: string | null;
  jobId: string;
  /** The revision the job started from, null for a new diagram, undefined for a record older than the base check. */
  base: number | null | undefined;
  reason: string;
}

/**
 * `catalog diagram put --job`: the whole of an accept's write, one transaction
 * the catalog owns, after the SVG is safely in the blob store.
 */
export function diagramPut(input: DiagramPutInput): Promise<CatalogResult> {
  return wrote(catalog([
    "diagram",
    "put",
    "--slug",
    input.slug,
    "--tldr",
    input.tldr,
    ...(input.svg === null ? [] : ["--svg", input.svg]),
    "--job",
    input.jobId,
    ...(input.base === undefined ? [] : ["--base", input.base === null ? "none" : String(input.base)]),
    "--reason",
    input.reason,
    ...owned(),
  ]));
}

/* -------------------------------------------------------------------------- */
/* Drafts (docs/STUDIO-CHAT-FIRST.md)                                         */
/* -------------------------------------------------------------------------- */

/**
 * `catalog draft upsert --file <draft.json>`: the row mirrored from the disk
 * record, which the runner has already written (rule 7).
 */
export function draftUpsert(file: string): Promise<CatalogResult> {
  return catalog(["draft", "upsert", "--file", file, ...owned()], 60_000);
}

/**
 * `catalog draft delete --id <id>`: the row goes only when no job row names
 * it, decided in one transaction (D40). `json.outcome` says `deleted`,
 * `no-draft` or `has-jobs`.
 */
export function draftDelete(id: string): Promise<CatalogResult> {
  return catalog(["draft", "delete", "--id", id, ...owned()], 60_000);
}

/** A topic the planner proposed, as `catalog topic add` takes it. */
export interface TopicProposal {
  slug: string;
  title: string;
  domain: string;
  summary: string | null;
  aliases: string[];
  relations: { kind: string; to: string }[];
}

/**
 * The flags for `topic add`, every value in `--flag=value` form, so a title
 * the planner wrote that happens to begin with `--` is a title and never an
 * option. No shell is involved, so nothing else in a value is special.
 */
function topicFlags(entry: TopicProposal): string[] {
  return [
    `--slug=${entry.slug}`,
    `--title=${entry.title}`,
    `--domain=${entry.domain}`,
    ...(entry.summary === null || entry.summary === "" ? [] : [`--summary=${entry.summary}`]),
    ...entry.aliases.map((alias) => `--alias=${alias}`),
    ...entry.relations.map((relation) => `--relate=${relation.kind}:${relation.to}`),
  ];
}

/**
 * `catalog topic add --dry-run`: whether the planner's proposed topic would be
 * accepted, and which existing topics look like it. Writes nothing.
 *
 * `--owner`, so the checks and the near matches are against this owner's
 * topics and the commons', never another owner's.
 */
export function topicAddDryRun(entry: TopicProposal): Promise<CatalogResult> {
  return catalog(["topic", "add", ...topicFlags(entry), "--dry-run", ...owned()], 60_000);
}

/**
 * `catalog topic add`: the Draw press on a brief whose topic the planner
 * proposed. The person pressed the button, so they are the author, and the
 * reason names the draft the topic came out of. `--owner` makes it their
 * topic: without it the row was `local`'s, which this owner's own enqueue
 * then could not name.
 */
export function topicAdd(entry: TopicProposal, reason: string): Promise<CatalogResult> {
  return wrote(catalog(
    ["topic", "add", ...topicFlags(entry), `--reason=${reason}`, `--author=${studioOwner()}`, ...owned()],
    60_000,
  ));
}

export function jobDiscard(jobId: string): Promise<CatalogResult> {
  return catalog(["job", "discard", "--job", jobId, ...owned()]);
}

export function jobShow(jobId: string): Promise<CatalogResult> {
  return catalog(["job", "show", "--job", jobId, ...owned()]);
}

/* -------------------------------------------------------------------------- */
/* The vocabulary (D13 of docs/CONTENT-MIGRATION.md)                          */
/* -------------------------------------------------------------------------- */

/**
 * `catalog topic ls --owner`: every live topic this studio's owner may read
 * (theirs and the commons'), with its title, domain and the concepts filed
 * under it. The only way the studio reads the vocabulary, so a brief is
 * checked against the rows the enqueue's foreign key checks it against again.
 * Without `--owner` the listing is the operator's, every owner's topics, and
 * they would reach the planner, `/api/vocabulary` and the cache.
 */
export function topicList(): Promise<CatalogResult> {
  return catalog(["topic", "ls", ...owned()], 60_000);
}

/** `catalog status`, used by `/api/health` to say whether Postgres is answering. */
export function status(): Promise<CatalogResult> {
  return catalog(["status"], 30_000);
}

/**
 * One concept note as the database holds it (`learn concept show --json`):
 * its title and body, among the rest. The studio reads it for a brief whose
 * source names a note, since the cut-over left no file to read.
 *
 * `--owner`, like every catalog verb here: without it the `learn` CLI reads
 * as its own owner, `local`, so a studio serving anyone else was handed
 * `local`'s note under that slug, or none when the note was the owner's own.
 * `test/owner.test.ts` fails a `learn` verb here that leaves it out.
 */
export function conceptShow(slug: string): Promise<CatalogResult> {
  return npmCli("learn", ["concept", "show", slug, ...owned()], 60_000);
}

/* -------------------------------------------------------------------------- */
/* Videos (docs/STUDIO-VIDEOS.md)                                             */
/* -------------------------------------------------------------------------- */

/** `catalog video show <slug>`: one studio video this owner may read, or `video: null`. */
export function videoShow(slug: string): Promise<CatalogResult> {
  return catalog(["video", "show", slug, ...owned()], 60_000);
}

/** `catalog video checkout <slug> --dir <dir>`: the stored source files, written into `dir`. */
export function videoCheckout(slug: string, dir: string): Promise<CatalogResult> {
  return catalog(["video", "checkout", slug, "--dir", dir, "--force", ...owned()], 60_000);
}

export interface VideoPutInput {
  jobId: string;
  slug: string;
  /** The gate's `candidate/` directory, holding the copies and `copies.json`. */
  dir: string;
  /** The revision the job started from, null for a new video, undefined when unknown. */
  base: number | null | undefined;
  reason: string;
}

/**
 * `catalog video put --job`: Accept's whole write in one transaction, the
 * job's move to `accepted` included (D49). A repeat for the same job and the
 * same bytes is an idempotent own retry.
 */
export function videoPut(input: VideoPutInput): Promise<CatalogResult> {
  return wrote(catalog([
    "video",
    "put",
    "--job",
    input.jobId,
    "--slug",
    input.slug,
    "--dir",
    input.dir,
    ...(input.base === undefined ? [] : ["--base", input.base === null ? "none" : String(input.base)]),
    "--reason",
    input.reason,
    ...owned(),
  ], 600_000));
}

/** `catalog video list`: this owner's studio videos and manimkc videos. */
export function videoList(): Promise<CatalogResult> {
  return catalog(["video", "list", ...owned()], 60_000);
}

/** `catalog preference get --key <key>`: one owner-scoped preference, raw. */
export function preferenceGet(key: string): Promise<CatalogResult> {
  return catalog(["preference", "get", "--key", key, ...owned()], 60_000);
}

/** `catalog preference set --key <key> --value <json>`: store one owner-scoped preference; the catalog validates it. */
export function preferenceSet(key: string, value: unknown): Promise<CatalogResult> {
  return catalog(["preference", "set", "--key", key, "--value", JSON.stringify(value), ...owned()], 60_000);
}
