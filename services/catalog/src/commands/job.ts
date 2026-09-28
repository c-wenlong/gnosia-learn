import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  asset,
  assetJob,
  canTransition,
  COST_SOURCES,
  job as jobTable,
  JOB_ACTIVE_STATES,
  JOB_KINDS,
  JOB_STATES,
  JOB_TRANSITIONS,
  type Job,
  type JobKind,
  type JobState,
  type NewJob,
  session as sessionTable,
} from "@self-learn/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { withDatabase, type CatalogDatabase } from "../db";
import { REPO_ROOT } from "../env";
import { ASSETS_DIR } from "../index/diagrams";
import { fileFacts } from "../index/files";
import { constraintName, SQLSTATE, sqlstate } from "../state/errors";

/**
 * `catalog job`: the job lifecycle, driven by hand.
 *
 * These verbs exist before the studio does, and that is the point of phase 0: a
 * diagram drawn from a terminal with `npm run canvas` can already be recorded,
 * reviewed and attributed, with nothing running but Postgres.
 *
 * **Every transition is a conditional update.** `UPDATE … WHERE id = ? AND
 * state IN (<the states that can reach this one>)`, so two runners cannot both
 * claim one job and a replayed finish against a row that already moved on
 * writes nothing and says it wrote nothing. The vocabulary of legal moves is
 * `JOB_TRANSITIONS` in `@self-learn/schema/shared`, which the runner and the UI
 * read too: a second copy of a state machine is a second state machine.
 *
 * **Enqueue is idempotent through `idempotency_key`, not through the target.**
 * A retried submit returns the job it already made. A *different* submit for a
 * path someone else is holding is a refusal, not a reuse, and it names the
 * holder.
 */

/** A refusal the caller can fix: a bad brief, a transition that is not allowed. */
export class JobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobError";
  }
}

/* -------------------------------------------------------------------------- */
/* The JSON shapes                                                            */
/* -------------------------------------------------------------------------- */

/**
 * One job as every `--json` output reports it. Flat, with instants as ISO
 * strings and the jsonb columns left out: `show` adds those, because a list of
 * twenty briefs is a context window nobody asked for.
 */
export interface JobSummary {
  id: string;
  kind: string;
  state: string;
  phase: string | null;
  session: string | null;
  parentJob: string | null;
  topic: string;
  targetPath: string;
  candidatePath: string | null;
  targetHashBefore: string | null;
  idempotencyKey: string;
  attempt: number;
  runner: string | null;
  runnerJobId: string | null;
  exitCode: number | null;
  turns: number | null;
  costUsd: number | null;
  costSource: string | null;
  errorKind: string | null;
  error: string | null;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  reviewedAt: string | null;
  heartbeatAt: string | null;
  cancelRequestedAt: string | null;
}

export interface JobOutput {
  assetId: string;
  path: string | null;
  kind: string | null;
  title: string | null;
  contentHash: string;
  bytes: number;
  writtenAt: string;
  /**
   * True when the asset still holds the bytes the job wrote: its row's
   * `content_hash` is the one the job recorded. Null when the asset is gone.
   */
  current: boolean | null;
}

export interface EnqueueResult {
  ok: true;
  command: "enqueue";
  /** False when the idempotency key had already been used: this is that job. */
  created: boolean;
  job: JobSummary;
}

export interface ClaimResult {
  ok: true;
  command: "claim";
  claimed: boolean;
  job: JobSummary | null;
}

export interface TransitionResult {
  ok: true;
  command: "finish" | "accept" | "discard";
  from: string;
  to: string;
  job: JobSummary;
  /** What an accepted job landed, from its `asset_job` rows. Empty for the other verdicts. */
  outputs: JobOutput[];
}

export interface ListResult {
  ok: true;
  command: "ls";
  /** How many rows matched, before the limit. */
  total: number;
  jobs: JobSummary[];
}

export interface ShowResult {
  ok: true;
  command: "show";
  job: JobSummary;
  brief: unknown;
  gate: unknown;
  errorDetail: unknown;
  session: { id: string; kind: string; state: string; startedAt: string } | null;
  outputs: JobOutput[];
  /** Jobs that revise this one. */
  children: string[];
  /** The transitions this job can still make. Empty for a terminal state. */
  next: string[];
}

export type JobResult =
  | EnqueueResult
  | ClaimResult
  | TransitionResult
  | ListResult
  | ShowResult;

const iso = (value: Date | null): string | null => (value === null ? null : value.toISOString());

export function summarise(row: Job): JobSummary {
  return {
    id: row.id,
    kind: row.kind,
    state: row.state,
    phase: row.phase,
    session: row.sessionId,
    parentJob: row.parentJobId,
    topic: row.topicSlug,
    targetPath: row.targetPath,
    candidatePath: row.candidatePath,
    targetHashBefore: row.targetHashBefore,
    idempotencyKey: row.idempotencyKey,
    attempt: row.attempt,
    runner: row.runner,
    runnerJobId: row.runnerJobId,
    exitCode: row.exitCode,
    turns: row.turns,
    costUsd: row.costUsd,
    costSource: row.costSource,
    errorKind: row.errorKind,
    error: row.error,
    requestedAt: row.requestedAt.toISOString(),
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
    reviewedAt: iso(row.reviewedAt),
    heartbeatAt: iso(row.heartbeatAt),
    cancelRequestedAt: iso(row.cancelRequestedAt),
  };
}

/* -------------------------------------------------------------------------- */
/* The brief                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The brief file `enqueue` reads. Everything the schema promotes to a column is
 * a named field; `brief` is the generator's own, stored as jsonb and joined on
 * by nothing.
 */
export interface BriefDocument {
  /** Optional. A uuid is minted when absent. */
  id?: string;
  kind?: string;
  topic?: string;
  /** The committed path the job intends to land on, and the lease key. */
  target?: string;
  /**
   * Optional. Defaults to `jobs/<id>/candidate/<name>.tldr`, the job's own
   * workspace relative to the runner's `STUDIO_HOME`, and when given must be
   * exactly that.
   */
  candidate?: string;
  /** Required, and supplied by the caller: this is what makes a retry safe. */
  idempotencyKey?: string;
  session?: string;
  parentJob?: string;
  brief?: Record<string, unknown>;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new JobError(`the brief needs a non-empty "${field}"`);
  }
  return value.trim();
}

/**
 * A target path the lease can be taken on: repo-relative, directly inside
 * `learn/assets/`, and a `.tldr`.
 *
 * The `.tldr` is the lease key rather than the SVG because it is the editable
 * source; the export is derived from it and is claimed alongside it.
 */
export function briefTarget(given: string): string {
  const cleaned = given.trim().replaceAll("\\", "/");
  const normalised = path.posix.normalize(cleaned);
  if (path.isAbsolute(normalised) || normalised.startsWith("..")) {
    throw new JobError(`"${given}" is not a repo-relative path. Pass ${ASSETS_DIR}/<name>.tldr.`);
  }
  if (path.posix.dirname(normalised) !== ASSETS_DIR) {
    throw new JobError(
      `"${normalised}" is not directly inside ${ASSETS_DIR}, so it is not a path the ` +
        `diagrams indexer would ever read.`,
    );
  }
  if (path.posix.extname(normalised) !== ".tldr") {
    throw new JobError(
      `"${normalised}" is not a .tldr. The lease is taken on the editable source; the ` +
        `exported .svg is claimed with it.`,
    );
  }
  return normalised;
}

/** A job id: one path segment, since it names the job's workspace. A UUID passes. */
const JOB_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

/**
 * Where a job writes before anyone accepts it: `jobs/<id>/candidate/<name>`,
 * relative to the runner's `STUDIO_HOME`.
 *
 * Derived from the job's id and its target, because the runner writes nowhere
 * else: each job draws in its own workspace (phase 2 of
 * docs/CONTENT-MIGRATION.md), so no two jobs share a candidate and none lives
 * in the tree. Relative rather than absolute because `STUDIO_HOME` is the
 * runner's to set and move, and an absolute path would put this machine's home
 * directory into a database that moves to the cloud at go-live. The same shape
 * as a manimkc asset's `out/...` path, which is relative to a data root the
 * catalog does not own either.
 *
 * Rows written before the move keep `learn/assets/.candidates/<name>`, as
 * history: nothing reads this column to find a file.
 */
export function candidateFor(jobId: string, targetPath: string): string {
  return path.posix.join("jobs", jobId, "candidate", path.posix.basename(targetPath));
}

/**
 * A candidate path the job is allowed to write to, which is exactly one.
 *
 * Held to equality with {@link candidateFor} rather than to a containment rule,
 * because the path is fully determined by the job: anything else is either a
 * mistake or a job describing a write outside its own workspace, which its
 * permission file should never have let it make. An absolute path is refused
 * rather than trimmed, since the catalog cannot tell a runner's `STUDIO_HOME`
 * from any other directory that happens to end the same way.
 */
export function briefCandidate(given: string, jobId: string, targetPath: string): string {
  const cleaned = given.trim().replaceAll("\\", "/");
  const normalised = path.posix.normalize(cleaned);
  const wanted = candidateFor(jobId, targetPath);
  if (path.posix.isAbsolute(normalised)) {
    throw new JobError(
      `"${given}" is absolute. A candidate is recorded relative to the runner's STUDIO_HOME: ${wanted}.`,
    );
  }
  if (normalised !== wanted) {
    throw new JobError(
      `"${normalised}" is not this job's candidate. Job ${jobId} writes ${wanted}, in its own ` +
        `workspace, and nowhere else; nothing under ${ASSETS_DIR}/ changes until a person accepts.`,
    );
  }
  return normalised;
}

export async function readBrief(file: string): Promise<BriefDocument> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    throw new JobError(`could not read the brief at ${file}: ${(error as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new JobError(`${file} is not JSON: ${(error as Error).message}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new JobError(`${file} must hold a JSON object, not ${JSON.stringify(parsed)}`);
  }
  return parsed as BriefDocument;
}

/* -------------------------------------------------------------------------- */
/* enqueue                                                                    */
/* -------------------------------------------------------------------------- */

export interface EnqueueOptions {
  brief: BriefDocument;
  repoRoot?: string;
}

export async function runEnqueue(options: EnqueueOptions): Promise<EnqueueResult> {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const document = options.brief;

  const kind = (document.kind ?? "diagram").trim();
  if (!(JOB_KINDS as readonly string[]).includes(kind)) {
    throw new JobError(`unknown job kind "${kind}". Known: ${JOB_KINDS.join(", ")}.`);
  }
  const topicSlug = asString(document.topic, "topic");
  const targetPath = briefTarget(asString(document.target, "target"));
  const idempotencyKey = asString(document.idempotencyKey, "idempotencyKey");
  const id = document.id?.trim() || randomUUID();
  // The id is a directory name now, in the candidate path below and in the
  // runner's workspace, so a slash or a dot-dot in it would move both.
  if (!JOB_ID.test(id)) {
    throw new JobError(`"id" ${JSON.stringify(id)} is not a job id: letters, digits and dashes, up to 64.`);
  }
  const candidatePath =
    document.candidate === undefined
      ? candidateFor(id, targetPath)
      : briefCandidate(document.candidate, id, targetPath);
  const brief = document.brief ?? {};
  if (typeof brief !== "object" || brief === null || Array.isArray(brief)) {
    throw new JobError(`"brief" must be a JSON object`);
  }

  // Recorded at enqueue, and deliberately not compared here or at accept.
  //
  // The comparison it exists for belongs to whoever owns the rename: the check
  // has to happen *before* the candidate goes over the target, and phase 0 does
  // not rename — a person does, and then says so. By the time `catalog job
  // accept` runs, the target has already been replaced and "did a human edit
  // this while the job ran" is no longer a question the file can answer. Storing
  // the hash now is what makes it answerable by the phase that does the rename.
  //
  // What phase 0 can already see is drift afterwards: `asset_job.content_hash`
  // is what the job landed, and `catalog job show` re-hashes the file and
  // reports `current: false` when the bytes have moved since.
  const absolute = path.join(repoRoot, targetPath);
  const targetHashBefore =
    (await stat(absolute).catch(() => null)) === null
      ? null
      : (await fileFacts(absolute)).contentHash;

  const row: NewJob = {
    id,
    kind: kind as JobKind,
    sessionId: document.session?.trim() || null,
    parentJobId: document.parentJob?.trim() || null,
    state: "queued",
    topicSlug,
    targetPath,
    candidatePath,
    targetHashBefore,
    brief: brief as Record<string, unknown>,
    idempotencyKey,
  };

  return withDatabase(async ({ db }) => {
    const existing = await byIdempotencyKey(db, idempotencyKey);
    if (existing !== undefined) {
      return { ok: true as const, command: "enqueue" as const, created: false, job: summarise(existing) };
    }
    try {
      const [inserted] = await db.insert(jobTable).values(row).returning();
      return {
        ok: true as const,
        command: "enqueue" as const,
        created: true,
        job: summarise(inserted!),
      };
    } catch (error) {
      // Two submits of one key can both miss the lookup above and race to the
      // insert. The loser lands here, and the honest answer is the same one the
      // lookup would have given: this key already belongs to that job. Throwing
      // would make the key idempotent only when nothing is concurrent, which is
      // when nobody needs it.
      if (
        sqlstate(error) === "23505" &&
        constraintName(error) === "job_idempotency_key_key"
      ) {
        const winner = await byIdempotencyKey(db, idempotencyKey);
        if (winner !== undefined) {
          return {
            ok: true as const,
            command: "enqueue" as const,
            created: false,
            job: summarise(winner),
          };
        }
      }
      throw await explainEnqueue(db, error, row);
    }
  });
}

async function byIdempotencyKey(db: CatalogDatabase, key: string): Promise<Job | undefined> {
  const rows = await db
    .select()
    .from(jobTable)
    .where(eq(jobTable.idempotencyKey, key))
    .limit(1);
  return rows[0];
}

/**
 * Turn the database's verdict into a sentence with a fix in it.
 *
 * The three that matter each have a named cause. A `23505` on
 * `job_active_target_key` is another job holding the path, and the only useful
 * thing to say is which one. A `23505` on the idempotency key is a race with a
 * concurrent submit of the same key, which is exactly what the key is for, so
 * it resolves to that job. A `23503` on `topic_slug` is the refuse-never-skip
 * rule firing before any GPU time is spent.
 */
async function explainEnqueue(
  db: CatalogDatabase,
  error: unknown,
  row: NewJob,
): Promise<Error> {
  const code = sqlstate(error);
  const constraint = constraintName(error);
  if (code === "23505" && constraint === "job_active_target_key") {
    const holder = await db
      .select({ id: jobTable.id, state: jobTable.state })
      .from(jobTable)
      .where(
        and(
          eq(jobTable.targetPath, row.targetPath),
          inArray(jobTable.state, [...JOB_ACTIVE_STATES]),
        ),
      )
      .limit(1);
    const held = holder[0];
    return new JobError(
      `${row.targetPath} is already held by job ${held?.id ?? "(unknown)"} ` +
        `(${held?.state ?? "active"}). One job per committed path: accept or discard that one ` +
        `first, because this brief would be written against a file it has not landed yet.`,
    );
  }
  if (code === "23505" && constraint === "job_idempotency_key_key") {
    // Only reachable when the winning row has vanished between the failed
    // insert and this lookup, which takes a concurrent delete.
    return new JobError(
      `idempotency key "${row.idempotencyKey}" is already taken, by a job that is no longer there.`,
    );
  }
  if (code === SQLSTATE.foreignKeyViolation && constraint === "job_topic_slug_topic_slug_fk") {
    return new JobError(
      `no topic "${row.topicSlug}" in the catalog. Add it to content/topics.yaml and run ` +
        `\`npm run catalog -- import --only topics\`, or enqueue under a slug that exists.`,
    );
  }
  if (code === SQLSTATE.foreignKeyViolation && constraint === "job_session_id_session_id_fk") {
    return new JobError(`no session "${row.sessionId}". Start one before pointing a job at it.`);
  }
  if (code === SQLSTATE.foreignKeyViolation && constraint === "job_parent_job_id_job_id_fk") {
    return new JobError(`no job "${row.parentJobId}" to revise.`);
  }
  return error as Error;
}

/* -------------------------------------------------------------------------- */
/* claim                                                                      */
/* -------------------------------------------------------------------------- */

export interface ClaimOptions {
  /** A specific job, or the oldest queued one when absent. */
  jobId?: string;
  kind?: string;
  runner?: string;
  sessionId?: string;
}

export async function runClaim(options: ClaimOptions): Promise<ClaimResult> {
  return withDatabase(async ({ db }) => {
    const assignments = {
      state: "running" as const,
      startedAt: sql`now()`,
      heartbeatAt: sql`now()`,
      attempt: sql`${jobTable.attempt} + 1`,
      runner: options.runner ?? null,
      sessionId: options.sessionId ?? sql`${jobTable.sessionId}`,
      phase: null,
      updatedAt: sql`now()`,
    };

    if (options.jobId !== undefined) {
      const claimed = await db
        .update(jobTable)
        .set(assignments)
        .where(and(eq(jobTable.id, options.jobId), eq(jobTable.state, "queued")))
        .returning();
      if (claimed.length === 0) throw await explainRefusal(db, options.jobId, "running");
      return { ok: true as const, command: "claim" as const, claimed: true, job: summarise(claimed[0]!) };
    }

    // `FOR UPDATE SKIP LOCKED` inside the subquery is what makes two runners
    // claiming at once pick different rows rather than one of them failing.
    const oldest = db
      .select({ id: jobTable.id })
      .from(jobTable)
      .where(
        options.kind === undefined
          ? eq(jobTable.state, "queued")
          : and(eq(jobTable.state, "queued"), eq(jobTable.kind, options.kind)),
      )
      .orderBy(asc(jobTable.requestedAt))
      .limit(1)
      .for("update", { skipLocked: true });

    const claimed = await db
      .update(jobTable)
      .set(assignments)
      .where(and(eq(jobTable.state, "queued"), inArray(jobTable.id, oldest)))
      .returning();
    return {
      ok: true as const,
      command: "claim" as const,
      claimed: claimed.length > 0,
      job: claimed.length === 0 ? null : summarise(claimed[0]!),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* finish, accept, discard                                                    */
/* -------------------------------------------------------------------------- */

/** The states a transition into `to` may start from. */
function sourcesOf(to: JobState): JobState[] {
  return (JOB_STATES as readonly JobState[]).filter((from) =>
    canTransition(JOB_TRANSITIONS, from, to),
  );
}

/**
 * Why a conditional update matched nothing. Read after the fact, so the update
 * stays one statement and the explanation costs a query only when it is needed.
 */
async function explainRefusal(
  db: CatalogDatabase,
  jobId: string,
  to: JobState,
): Promise<Error> {
  const rows = await db.select().from(jobTable).where(eq(jobTable.id, jobId)).limit(1);
  const row = rows[0];
  if (row === undefined) {
    return new JobError(`no job "${jobId}". \`catalog job ls\` lists them.`);
  }
  const allowed = JOB_TRANSITIONS[row.state as JobState] ?? [];
  return new JobError(
    `job ${jobId} is ${row.state}, and ${row.state} → ${to} is not a transition. ` +
      (allowed.length === 0
        ? `${row.state} is terminal.`
        : `From ${row.state} it can go to: ${allowed.join(", ")}.`),
  );
}

export interface FinishOptions {
  jobId: string;
  state: string;
  phase?: string;
  candidatePath?: string;
  exitCode?: number;
  turns?: number;
  costUsd?: number;
  /**
   * Whether `costUsd` is the agent's own `total_cost_usd` or the runner's
   * accumulation from the intermediate usage events.
   *
   * A killed attempt never writes a result event, so a row that recorded only
   * the exact figure recorded nothing for work that was paid for. Both are
   * stored now, and this is what stops the two being read as the same fact.
   */
  costSource?: string;
  gate?: Record<string, unknown>;
  errorKind?: string;
  error?: string;
  errorDetail?: Record<string, unknown>;
}

/**
 * The runner's side of the lifecycle: `awaiting_review`, `failed`, `cancelled`
 * or `interrupted`. `accepted` and `discarded` are a person's and have their
 * own verbs, so a runner cannot accept its own work.
 */
export async function runFinish(options: FinishOptions): Promise<TransitionResult> {
  const to = options.state as JobState;
  if (!(JOB_STATES as readonly string[]).includes(to)) {
    throw new JobError(`unknown job state "${options.state}". Known: ${JOB_STATES.join(", ")}.`);
  }
  if (
    options.costSource !== undefined &&
    !(COST_SOURCES as readonly string[]).includes(options.costSource)
  ) {
    // Checked here rather than left to the column's own CHECK, which would come
    // back as a bare 23514 naming a constraint instead of a sentence naming the
    // flag. The same reading every other refusal in this file takes.
    throw new JobError(
      `unknown --cost-source "${options.costSource}". Known: ${COST_SOURCES.join(", ")}.`,
    );
  }
  if (options.costSource !== undefined && options.costUsd === undefined) {
    throw new JobError("--cost-source says where a figure came from, so it needs --cost beside it.");
  }
  if (to === "accepted" || to === "discarded") {
    throw new JobError(
      `${to} is a person's verdict, not a runner's. Use \`catalog job ${to === "accepted" ? "accept" : "discard"}\`.`,
    );
  }
  const from = sourcesOf(to);
  if (from.length === 0) {
    throw new JobError(`nothing can transition to ${to}.`);
  }

  return withDatabase(async ({ db }) => {
    const rows = await db.select().from(jobTable).where(eq(jobTable.id, options.jobId)).limit(1);
    const before = rows[0];
    const candidatePath =
      options.candidatePath === undefined || before === undefined
        ? options.candidatePath
        : briefCandidate(options.candidatePath, before.id, before.targetPath);
    const updated = await db
      .update(jobTable)
      .set({
        state: to,
        finishedAt: sql`now()`,
        heartbeatAt: sql`now()`,
        phase: options.phase ?? (to === "awaiting_review" ? "ready" : null),
        candidatePath: candidatePath ?? sql`${jobTable.candidatePath}`,
        exitCode: options.exitCode ?? null,
        turns: options.turns ?? null,
        costUsd: options.costUsd ?? null,
        costSource: options.costSource ?? null,
        gate: options.gate ?? null,
        errorKind: options.errorKind ?? null,
        error: options.error ?? null,
        errorDetail: options.errorDetail ?? null,
        updatedAt: sql`now()`,
      })
      .where(and(eq(jobTable.id, options.jobId), inArray(jobTable.state, from)))
      .returning();
    if (updated.length === 0) throw await explainRefusal(db, options.jobId, to);
    return {
      ok: true as const,
      command: "finish" as const,
      from: before?.state ?? "(unknown)",
      to,
      job: summarise(updated[0]!),
      outputs: [],
    };
  });
}

export interface VerdictOptions {
  jobId: string;
}

/**
 * Accept: record that the job's output landed, and move the row to
 * `accepted`.
 *
 * The landing itself is `catalog diagram put --job` (Track D of
 * docs/CONTENT-MIGRATION.md): the diagram, its SVG, its asset rows and the
 * `asset_job` rows that name this job, in one transaction. This is the
 * transition after it, refused until those rows exist, so a job can never be
 * `accepted` with nothing to show for it. Its own call, so a put that landed
 * and an accept that did not is a retry of this alone (the studio's Reindex).
 */
export async function runAccept(options: VerdictOptions): Promise<TransitionResult> {
  return withDatabase(({ db }) =>
    db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(jobTable)
        .where(eq(jobTable.id, options.jobId))
        .limit(1);
      const before = rows[0];
      if (before === undefined) throw await explainRefusal(tx, options.jobId, "accepted");
      // Checked before anything is written, so a job in the wrong state gets
      // the transition refusal rather than a complaint about its outputs. The
      // conditional update at the end still guards the row itself: this is the
      // message, that is the lock.
      if (!canTransition(JOB_TRANSITIONS, before.state, "accepted")) {
        throw await explainRefusal(tx, options.jobId, "accepted");
      }

      // An accepted job says what it landed, so one with nothing to point at is
      // not accepted, it is a row claiming a result it cannot name.
      const outputs = await jobOutputs(tx, options.jobId);
      if (outputs.length === 0) {
        const slug = /^learn\/assets\/(.+)\.tldr$/.exec(before.targetPath)?.[1] ?? "<slug>";
        throw new JobError(
          `job ${options.jobId} has no output to accept. Land it first: \`catalog diagram put ` +
            `--slug ${slug} --tldr <candidate> --svg <candidate.svg> --job ${options.jobId} --reason "..."\`.`,
        );
      }

      const updated = await tx
        .update(jobTable)
        .set({
          state: "accepted",
          reviewedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(and(eq(jobTable.id, options.jobId), inArray(jobTable.state, sourcesOf("accepted"))))
        .returning();
      if (updated.length === 0) throw await explainRefusal(tx, options.jobId, "accepted");

      return {
        ok: true as const,
        command: "accept" as const,
        from: before.state,
        to: "accepted",
        job: summarise(updated[0]!),
        outputs,
      };
    }),
  );
}

/** Discard: the candidate is gone and the lease is released. */
export async function runDiscard(options: VerdictOptions): Promise<TransitionResult> {
  return withDatabase(async ({ db }) => {
    const before = await db
      .select({ state: jobTable.state })
      .from(jobTable)
      .where(eq(jobTable.id, options.jobId))
      .limit(1);
    const updated = await db
      .update(jobTable)
      .set({ state: "discarded", reviewedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(jobTable.id, options.jobId), inArray(jobTable.state, sourcesOf("discarded"))))
      .returning();
    if (updated.length === 0) throw await explainRefusal(db, options.jobId, "discarded");
    return {
      ok: true as const,
      command: "discard" as const,
      from: before[0]?.state ?? "(unknown)",
      to: "discarded",
      job: summarise(updated[0]!),
      outputs: [],
    };
  });
}

/* -------------------------------------------------------------------------- */
/* ls and show                                                                */
/* -------------------------------------------------------------------------- */

export const LIST_LIMIT = 20;
export const LIST_LIMIT_MAX = 100;

export interface ListOptions {
  state?: string;
  kind?: string;
  limit?: number;
}

export async function runList(options: ListOptions = {}): Promise<ListResult> {
  if (options.state !== undefined && !(JOB_STATES as readonly string[]).includes(options.state)) {
    throw new JobError(`unknown job state "${options.state}". Known: ${JOB_STATES.join(", ")}.`);
  }
  const limit = Math.min(Math.max(options.limit ?? LIST_LIMIT, 1), LIST_LIMIT_MAX);

  return withDatabase(async ({ db }) => {
    const filters = [
      options.state === undefined ? undefined : eq(jobTable.state, options.state),
      options.kind === undefined ? undefined : eq(jobTable.kind, options.kind),
    ].filter((f) => f !== undefined);
    const where = filters.length === 0 ? undefined : and(...filters);

    const counted = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(jobTable)
      .where(where);
    const rows = await db
      .select()
      .from(jobTable)
      .where(where)
      .orderBy(desc(jobTable.requestedAt))
      .limit(limit);
    return {
      ok: true as const,
      command: "ls" as const,
      total: counted[0]?.total ?? 0,
      jobs: rows.map(summarise),
    };
  });
}

export async function runShow(jobId: string): Promise<ShowResult> {
  return withDatabase(async ({ db }) => {
    const rows = await db.select().from(jobTable).where(eq(jobTable.id, jobId)).limit(1);
    const row = rows[0];
    if (row === undefined) {
      throw new JobError(`no job "${jobId}". \`catalog job ls\` lists them.`);
    }

    const sessionRows =
      row.sessionId === null
        ? []
        : await db
            .select()
            .from(sessionTable)
            .where(eq(sessionTable.id, row.sessionId))
            .limit(1);

    const outputs = await jobOutputs(db, jobId);

    const children = await db
      .select({ id: jobTable.id })
      .from(jobTable)
      .where(eq(jobTable.parentJobId, jobId))
      .orderBy(asc(jobTable.requestedAt));

    const session = sessionRows[0];
    return {
      ok: true as const,
      command: "show" as const,
      job: summarise(row),
      brief: row.brief,
      gate: row.gate,
      errorDetail: row.errorDetail,
      session:
        session === undefined
          ? null
          : {
              id: session.id,
              kind: session.kind,
              state: session.state,
              startedAt: session.startedAt.toISOString(),
            },
      outputs,
      children: children.map((c) => c.id),
      next: [...(JOB_TRANSITIONS[row.state as JobState] ?? [])],
    };
  });
}

/**
 * What a job landed: its `asset_job` rows, each with whether the asset still
 * holds those bytes. The hash the job recorded against the row's own, since
 * the bytes are a database row and a blob now, not a file to hash.
 */
async function jobOutputs(db: CatalogDatabase, jobId: string): Promise<JobOutput[]> {
  const rows = await db
    .select({
      assetId: assetJob.assetId,
      contentHash: assetJob.contentHash,
      bytes: assetJob.bytes,
      writtenAt: assetJob.writtenAt,
      path: asset.path,
      kind: asset.kind,
      title: asset.title,
      current: asset.contentHash,
    })
    .from(assetJob)
    .leftJoin(asset, eq(asset.id, assetJob.assetId))
    .where(eq(assetJob.jobId, jobId))
    .orderBy(asc(assetJob.assetId));
  return rows.map((row) => ({
    assetId: row.assetId,
    path: row.path,
    kind: row.kind,
    title: row.title,
    contentHash: row.contentHash,
    bytes: row.bytes,
    writtenAt: row.writtenAt.toISOString(),
    current: row.kind === null ? null : row.current === row.contentHash,
  }));
}

/* -------------------------------------------------------------------------- */
/* Human output                                                               */
/* -------------------------------------------------------------------------- */

function line(job: JobSummary): string {
  return `${job.state.padEnd(15)} ${job.kind.padEnd(8)} ${job.topic.padEnd(22)} ${job.targetPath}  ${job.id}`;
}

export function formatJob(result: JobResult): string {
  switch (result.command) {
    case "enqueue":
      return [
        result.created ? `queued ${result.job.id}` : `already queued as ${result.job.id}`,
        `  target    ${result.job.targetPath}`,
        `  candidate ${result.job.candidatePath ?? "(none)"}`,
        `  topic     ${result.job.topic}`,
        `  key       ${result.job.idempotencyKey}`,
      ].join("\n");
    case "claim":
      return result.job === null
        ? "nothing queued"
        : `claimed ${result.job.id} (attempt ${result.job.attempt})\n  ${result.job.targetPath}`;
    case "finish":
    case "accept":
    case "discard": {
      const lines = [`${result.job.id}: ${result.from} → ${result.to}`];
      for (const output of result.outputs) {
        lines.push(`  + ${output.path ?? "(asset gone)"}  ${output.assetId} (${output.kind ?? "?"})`);
      }
      return lines.join("\n");
    }
    case "ls": {
      if (result.jobs.length === 0) return "no jobs";
      const shown =
        result.jobs.length < result.total
          ? `\n\n${result.jobs.length} of ${result.total}`
          : `\n\n${result.total} job${result.total === 1 ? "" : "s"}`;
      return result.jobs.map(line).join("\n") + shown;
    }
    case "show": {
      const job = result.job;
      const lines = [
        `${job.id}`,
        `  kind      ${job.kind}`,
        `  state     ${job.state}${job.phase === null ? "" : ` (${job.phase})`}`,
        `  next      ${result.next.length === 0 ? "(terminal)" : result.next.join(", ")}`,
        `  topic     ${job.topic}`,
        `  target    ${job.targetPath}`,
        `  candidate ${job.candidatePath ?? "(none)"}`,
        `  session   ${result.session === null ? "(none)" : `${result.session.id} (${result.session.kind}, ${result.session.state})`}`,
        `  requested ${job.requestedAt}`,
        `  attempt   ${job.attempt}`,
      ];
      if (job.error !== null) lines.push(`  error     ${job.errorKind ?? "?"}: ${job.error}`);
      lines.push(`  outputs   ${result.outputs.length === 0 ? "(none)" : ""}`);
      for (const output of result.outputs) {
        const state = output.current === null ? "missing" : output.current ? "current" : "changed";
        lines.push(`    ${output.path ?? output.assetId}  ${output.bytes} bytes  ${state}`);
      }
      if (result.children.length > 0) lines.push(`  revised by ${result.children.join(", ")}`);
      return lines.join("\n");
    }
  }
}
