import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  asset,
  assetJob,
  canonicalJson,
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
  readableOwners,
  diagram as diagramTable,
  draft as draftTable,
  session as sessionTable,
  topic as topicTable,
  video as videoTable,
} from "@self-learn/schema";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

import { CLI_OWNER, ownersExist } from "../content/scope";
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

/**
 * Whose jobs a verb acts on (phase 4 of docs/CONTENT-MIGRATION.md): the
 * owner's own, `--owner` or the CLI's. A job is one owner's, never the
 * commons', so this is an equality, not the readable list. Another owner's
 * job is "no job" to every verb, as a missing one is. On a database from
 * before 0010 `job` has no `owner_id` and holds one owner's jobs, so there is
 * no clause.
 */
async function ownedJobs(db: CatalogDatabase, owner: string): Promise<SQL | undefined> {
  return (await ownersExist(db)) ? eq(jobTable.ownerId, owner) : undefined;
}

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
  /** The studio chat that asked for it (D35 of docs/STUDIO-CHAT-FIRST.md), or null. */
  draft: string | null;
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
  /**
   * The parent `--discard-parent` discarded in the same transaction as this
   * insert (D52 of docs/STUDIO-VIDEOS.md), or null when none was, including
   * a retried submit that found its job already made.
   */
  discarded: { id: string; from: string; to: "discarded" } | null;
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
    draft: row.draftId,
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
  /** The draft whose Draw press this is, when a chat asked for it. */
  draft?: string;
  brief?: Record<string, unknown>;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new JobError(`the brief needs a non-empty "${field}"`);
  }
  return value.trim();
}

/** Where a studio video's logical name lives: `videos/<slug>.mp4` (docs/STUDIO-VIDEOS.md, "Schema"). */
export const VIDEOS_DIR = "videos";

/** A studio video's slug: kebab-case, 3 to 60 characters, as the brief's `slug` rule says. */
export const VIDEO_SLUG = /^(?=.{3,60}$)[a-z0-9]+(-[a-z0-9]+)*$/;

/** The slug a video target names, or null when the target is not one. */
export function videoSlugOf(targetPath: string): string | null {
  const match = /^videos\/([^/]+)\.mp4$/.exec(targetPath);
  return match !== null && VIDEO_SLUG.test(match[1] as string) ? (match[1] as string) : null;
}

/**
 * A target path the lease can be taken on, by the job's kind.
 *
 * A diagram's is repo-relative, directly inside `learn/assets/`, and a
 * `.tldr`: the editable source is the lease key rather than the SVG, since the
 * export is derived from it and is claimed alongside it.
 *
 * A video's is `videos/<slug>.mp4`, a logical name that is no file anywhere
 * (the cut is a blob, D49), leased exactly as a diagram's is so two drafts
 * cannot make the same slug at once (edge case V8).
 */
export function briefTarget(given: string, kind: JobKind = "diagram"): string {
  const cleaned = given.trim().replaceAll("\\", "/");
  const normalised = path.posix.normalize(cleaned);
  if (kind === "video") {
    if (videoSlugOf(normalised) === null) {
      throw new JobError(
        `"${given}" is not a video target. Pass ${VIDEOS_DIR}/<slug>.mp4, the slug kebab-case and 3 to 60 characters.`,
      );
    }
    return normalised;
  }
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
  /** Whose job this is. Default: the CLI's owner. */
  owner?: string;
  /**
   * D52 of docs/STUDIO-VIDEOS.md: discard this parent, a video job awaiting
   * review, in the transaction that inserts the new job, so the lease on the
   * slug passes from one to the other with no gap and a refused insert leaves
   * the parent as it was. Must be the brief's `parentJob`.
   */
  discardParent?: string;
}

export async function runEnqueue(options: EnqueueOptions): Promise<EnqueueResult> {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const document = options.brief;

  const kind = (document.kind ?? "diagram").trim();
  if (!(JOB_KINDS as readonly string[]).includes(kind)) {
    throw new JobError(`unknown job kind "${kind}". Known: ${JOB_KINDS.join(", ")}.`);
  }
  const topicSlug = asString(document.topic, "topic");
  const targetPath = briefTarget(asString(document.target, "target"), kind as JobKind);
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
  if (kind === "video") assertVideoBrief(brief as Record<string, unknown>, targetPath, topicSlug);
  const discardParent = options.discardParent?.trim() || undefined;
  if (discardParent !== undefined) {
    if (kind !== "video") {
      throw new JobError("--discard-parent is for a video change job (D52 of docs/STUDIO-VIDEOS.md); a diagram revises only a finished job.");
    }
    if (document.parentJob?.trim() !== discardParent) {
      throw new JobError(
        `--discard-parent ${discardParent} must be the brief's "parentJob" (${JSON.stringify(document.parentJob ?? null)}): ` +
          `only the job this one changes is discarded for it.`,
      );
    }
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
  // A video's target is no file: its "hash before" is the cut the video row
  // holds, read below with the database.
  const absolute = path.join(repoRoot, targetPath);
  const targetHashBefore =
    kind === "video" || (await stat(absolute).catch(() => null)) === null
      ? null
      : (await fileFacts(absolute)).contentHash;

  const row: NewJob = {
    id,
    kind: kind as JobKind,
    sessionId: document.session?.trim() || null,
    parentJobId: document.parentJob?.trim() || null,
    draftId: document.draft?.trim() || null,
    state: "queued",
    topicSlug,
    targetPath,
    candidatePath,
    targetHashBefore,
    brief: brief as Record<string, unknown>,
    idempotencyKey,
  };

  const owner = options.owner ?? CLI_OWNER;
  return withDatabase(async ({ db }) => {
    const scoped = await ownersExist(db);
    // A key is global, so another owner's job under it is a refusal that
    // names nothing of theirs, rather than that job handed back.
    const theirs = (found: Job | undefined): found is Job => scoped && found !== undefined && found.ownerId !== owner;
    const keyTaken = () =>
      new JobError(`idempotency key "${idempotencyKey}" is already taken by another job. Submit under a new key.`);
    const existing = await byIdempotencyKey(db, idempotencyKey);
    if (theirs(existing)) throw keyTaken();
    if (existing !== undefined) {
      return { ok: true as const, command: "enqueue" as const, created: false, job: summarise(existing), discarded: null };
    }
    await assertOwnReferences(
      db,
      { sessionId: row.sessionId ?? null, parentJobId: row.parentJobId ?? null, draftId: row.draftId ?? null },
      owner,
      scoped,
    );
    if (scoped) await assertDrawable(db, row, owner);
    if (kind === "video") row.targetHashBefore = await videoCutHash(db, targetPath, owner);
    try {
      // One transaction, so a discarded parent and the new job land together
      // or not at all: a refused insert (the topic, the lease, the key) rolls
      // the discard back and the video in review is untouched.
      const { inserted, discarded } = await db.transaction(async (tx) => {
        const discarded =
          discardParent === undefined ? null : await discardForChange(tx, discardParent, row, scoped ? owner : undefined);
        const [inserted] = await tx
          .insert(jobTable)
          .values(scoped ? { ...row, ownerId: owner } : row)
          .returning();
        return { inserted: inserted!, discarded };
      });
      return {
        ok: true as const,
        command: "enqueue" as const,
        created: true,
        job: summarise(inserted),
        discarded,
      };
    } catch (error) {
      if (error instanceof JobError) {
        // Two submits of one change race: the winner discarded the parent and
        // inserted the child, and the loser, waiting on the parent's row lock,
        // then finds it discarded. The honest answer is the winner's job,
        // exactly as for the key race below.
        //
        // Only when the job found is this same request, though: a different
        // change that happened to use the key gets this request's own
        // refusal, not someone else's job as if it were its retry.
        if (discardParent !== undefined) {
          const winner = await byIdempotencyKey(db, idempotencyKey);
          if (winner !== undefined && sameRequest(winner, row, scoped ? owner : undefined)) {
            return { ok: true as const, command: "enqueue" as const, created: false, job: summarise(winner), discarded: null };
          }
        }
        throw error;
      }
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
        if (theirs(winner)) throw keyTaken();
        if (winner !== undefined) {
          return {
            ok: true as const,
            command: "enqueue" as const,
            created: false,
            job: summarise(winner),
            discarded: null,
          };
        }
      }
      throw await explainEnqueue(db, error, row, scoped ? owner : undefined);
    }
  });
}

/**
 * What a job points at has to be the owner's to draw (phase 4): a topic they
 * may read, and a target that is not another owner's diagram. Another owner's
 * topic is refused with the sentence a missing one gets; a slug another owner
 * holds says only that it is taken, since ids are global (D23) and the put at
 * Accept would refuse it anyway, after the agent had been paid to draw.
 */
async function assertDrawable(db: CatalogDatabase, row: NewJob, owner: string): Promise<void> {
  const [filed] = await db
    .select({ ownerId: topicTable.ownerId })
    .from(topicTable)
    .where(eq(topicTable.slug, row.topicSlug))
    .limit(1);
  if (filed !== undefined && !readableOwners(owner).includes(filed.ownerId)) throw noTopic(row.topicSlug);
  if (row.kind === "video") {
    const slug = videoSlugOf(row.targetPath) as string;
    const [held] = await db
      .select({ ownerId: videoTable.ownerId })
      .from(videoTable)
      .where(eq(videoTable.slug, slug))
      .limit(1);
    if (held !== undefined && held.ownerId !== owner) {
      throw new JobError(
        `${row.targetPath} names a video this owner cannot make: slugs are shared across owners ` +
          `(D23 of docs/CONTENT-MIGRATION.md), so choose another name.`,
      );
    }
    return;
  }
  const slug = path.posix.basename(row.targetPath, ".tldr");
  const [held] = await db
    .select({ ownerId: diagramTable.ownerId })
    .from(diagramTable)
    .where(eq(diagramTable.slug, slug))
    .limit(1);
  if (held !== undefined && held.ownerId !== owner) {
    throw new JobError(
      `${row.targetPath} names a diagram this owner cannot draw on: slugs are shared across owners ` +
        `(D23 of docs/CONTENT-MIGRATION.md), so choose another name.`,
    );
  }
}

/**
 * What the catalog can hold a video job's brief to at enqueue: where it says
 * which video and which topic, the columns say the same. The brief's own
 * rules (the script, the length) are `validateVideoBrief`'s, in the studio;
 * these are only the ones a row would otherwise contradict.
 */
function assertVideoBrief(brief: Record<string, unknown>, targetPath: string, topicSlug: string): void {
  const slug = videoSlugOf(targetPath);
  if (brief.slug !== undefined && brief.slug !== slug) {
    throw new JobError(`the brief's slug ${JSON.stringify(brief.slug)} is not the target's, "${slug}" (${targetPath}).`);
  }
  if (brief.topic !== undefined && brief.topic !== topicSlug) {
    throw new JobError(`the brief's topic ${JSON.stringify(brief.topic)} is not the job's, "${topicSlug}".`);
  }
}

/** The sha256 of the cut a video holds now, read from its blob key, or null when it has none. */
async function videoCutHash(db: CatalogDatabase, targetPath: string, owner: string): Promise<string | null> {
  const slug = videoSlugOf(targetPath);
  if (slug === null) return null;
  const [row] = await db
    .select({ key: videoTable.mp4BlobKey })
    .from(videoTable)
    .where(and(eq(videoTable.slug, slug), eq(videoTable.ownerId, owner)))
    .limit(1);
  return /\/([0-9a-f]{64})\.[a-z0-9]+$/.exec(row?.key ?? "")?.[1] ?? null;
}

/**
 * D52: the parent of a video change job, discarded inside the transaction
 * that inserts the child. Locked first, so a concurrent Accept of the same
 * parent either lands before this reads it (and it is `accepted`, which this
 * refuses) or waits and then finds it discarded. Another owner's job reads as
 * a missing one.
 */
async function discardForChange(
  tx: CatalogDatabase,
  parentId: string,
  child: NewJob,
  owner: string | undefined,
): Promise<{ id: string; from: string; to: "discarded" }> {
  const [parent] = await tx
    .select()
    .from(jobTable)
    .where(and(eq(jobTable.id, parentId), owner === undefined ? undefined : eq(jobTable.ownerId, owner)))
    .limit(1)
    .for("update");
  if (parent === undefined) throw new JobError(`no job "${parentId}" to revise.`);
  if (parent.kind !== "video") {
    throw new JobError(`job ${parentId} is a ${parent.kind} job; --discard-parent discards only a video job for its change.`);
  }
  if (parent.state !== "awaiting_review") {
    throw new JobError(
      `job ${parentId} is ${parent.state}, not awaiting_review, so there is nothing to discard for this change. ` +
        `Enqueue without --discard-parent` +
        (parent.state === "queued" || parent.state === "running" ? `, once it has finished.` : `.`),
    );
  }
  if (parent.targetPath !== child.targetPath) {
    throw new JobError(
      `job ${parentId} makes ${parent.targetPath} and this job ${child.targetPath}: a change keeps its video's slug, ` +
        `so the parent it discards is the one holding the same lease.`,
    );
  }
  const updated = await tx
    .update(jobTable)
    .set({ state: "discarded", reviewedAt: sql`now()`, updatedAt: sql`now()` })
    .where(and(eq(jobTable.id, parentId), eq(jobTable.state, "awaiting_review")))
    .returning({ id: jobTable.id });
  if (updated.length === 0) throw new JobError(`job ${parentId} moved while it was being discarded; nothing was changed.`);
  return { id: parentId, from: parent.state, to: "discarded" };
}

/**
 * The session a job hangs off and the job it revises have to be the owner's
 * too (phase 4): another learner's session reads as a missing one, and so
 * does another owner's job, with the sentences their foreign keys would give.
 * Otherwise `job show` would print that session's kind, state and start, and
 * the parent's `job show` would list the child.
 */
async function assertOwnReferences(
  db: CatalogDatabase,
  refs: { sessionId: string | null; parentJobId: string | null; draftId?: string | null },
  owner: string,
  scoped: boolean,
): Promise<void> {
  if (refs.sessionId !== null) {
    const [held] = await db
      .select({ learnerId: sessionTable.learnerId })
      .from(sessionTable)
      .where(eq(sessionTable.id, refs.sessionId))
      .limit(1);
    if (held !== undefined && held.learnerId !== owner) {
      throw new JobError(`no session "${refs.sessionId}". Start one before pointing a job at it.`);
    }
  }
  if (refs.parentJobId !== null && scoped) {
    const [parent] = await db
      .select({ ownerId: jobTable.ownerId })
      .from(jobTable)
      .where(eq(jobTable.id, refs.parentJobId))
      .limit(1);
    if (parent !== undefined && parent.ownerId !== owner) throw new JobError(`no job "${refs.parentJobId}" to revise.`);
  }
  // A draft is one owner's (0014 came after 0010, so it always has the
  // column); another owner's reads as a missing one, with the foreign key's
  // sentence, so no job of theirs can hang off it.
  if (refs.draftId !== undefined && refs.draftId !== null) {
    const [held] = await db
      .select({ ownerId: draftTable.ownerId })
      .from(draftTable)
      .where(eq(draftTable.id, refs.draftId))
      .limit(1);
    if (held === undefined || held.ownerId !== owner) throw noDraft(refs.draftId);
  }
}

function noDraft(id: string): JobError {
  return new JobError(`no draft "${id}". Record it with \`catalog draft upsert\` before a job names it.`);
}

function noTopic(slug: string): JobError {
  return new JobError(
    `no topic "${slug}" in the catalog. Add it with \`npm run catalog -- topic add\`, ` +
      `or enqueue under a slug that exists.`,
  );
}

/**
 * Whether a job already under a key is the request now being made: the same
 * owner, kind, parent, target, topic, draft and brief. Asked where a refusal
 * would otherwise be answered with the job under the key, so a different
 * request sharing the key keeps its refusal.
 */
function sameRequest(found: Job, row: NewJob, owner: string | undefined): boolean {
  return (
    (owner === undefined || found.ownerId === owner) &&
    found.kind === row.kind &&
    found.parentJobId === (row.parentJobId ?? null) &&
    found.targetPath === row.targetPath &&
    found.topicSlug === row.topicSlug &&
    found.draftId === (row.draftId ?? null) &&
    canonicalJson(found.brief) === canonicalJson(row.brief ?? {})
  );
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
  owner?: string,
): Promise<Error> {
  const code = sqlstate(error);
  const constraint = constraintName(error);
  if (code === "23505" && constraint === "job_active_target_key") {
    const holder = await db
      .select({ id: jobTable.id, state: jobTable.state, ownerId: jobTable.ownerId })
      .from(jobTable)
      .where(
        and(
          eq(jobTable.targetPath, row.targetPath),
          inArray(jobTable.state, [...JOB_ACTIVE_STATES]),
        ),
      )
      .limit(1);
    const held = holder[0];
    if (owner !== undefined && held !== undefined && held.ownerId !== owner) {
      return new JobError(`${row.targetPath} is already held by another job, which is not this owner's to accept or discard.`);
    }
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
    return noTopic(row.topicSlug);
  }
  if (code === SQLSTATE.foreignKeyViolation && constraint === "job_session_id_session_id_fk") {
    return new JobError(`no session "${row.sessionId}". Start one before pointing a job at it.`);
  }
  if (code === SQLSTATE.foreignKeyViolation && constraint === "job_draft_id_draft_id_fk") {
    return noDraft(row.draftId ?? "(none)");
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
  /** Whose jobs to claim from. Default: the CLI's owner. */
  owner?: string;
}

export async function runClaim(options: ClaimOptions): Promise<ClaimResult> {
  const owner = options.owner ?? CLI_OWNER;
  return withDatabase(async ({ db }) => {
    const mine = await ownedJobs(db, owner);
    await assertOwnReferences(db, { sessionId: options.sessionId ?? null, parentJobId: null }, owner, mine !== undefined);
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
        .where(and(eq(jobTable.id, options.jobId), eq(jobTable.state, "queued"), mine))
        .returning();
      if (claimed.length === 0) throw await explainRefusal(db, options.jobId, "running", owner);
      return { ok: true as const, command: "claim" as const, claimed: true, job: summarise(claimed[0]!) };
    }

    // `FOR UPDATE SKIP LOCKED` inside the subquery is what makes two runners
    // claiming at once pick different rows rather than one of them failing.
    const oldest = db
      .select({ id: jobTable.id })
      .from(jobTable)
      .where(
        and(
          eq(jobTable.state, "queued"),
          options.kind === undefined ? undefined : eq(jobTable.kind, options.kind),
          mine,
        ),
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
  owner: string,
): Promise<Error> {
  const rows = await db
    .select()
    .from(jobTable)
    .where(and(eq(jobTable.id, jobId), await ownedJobs(db, owner)))
    .limit(1);
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
  /** Whose job. Default: the CLI's owner. */
  owner?: string;
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

  const owner = options.owner ?? CLI_OWNER;
  return withDatabase(async ({ db }) => {
    const mine = await ownedJobs(db, owner);
    const rows = await db.select().from(jobTable).where(and(eq(jobTable.id, options.jobId), mine)).limit(1);
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
      .where(and(eq(jobTable.id, options.jobId), inArray(jobTable.state, from), mine))
      .returning();
    if (updated.length === 0) throw await explainRefusal(db, options.jobId, to, owner);
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
  /** Whose job. Default: the CLI's owner. */
  owner?: string;
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
  const owner = options.owner ?? CLI_OWNER;
  return withDatabase(({ db }) => db.transaction((tx) => acceptJobIn(tx, options.jobId, owner)));
}

/**
 * The checked transition to `accepted`, inside a transaction the caller holds:
 * `catalog job accept` opens its own, and `catalog video put --job` runs it in
 * the transaction that lands the video, so a video is never in the catalog
 * with its job still in review (D49 of docs/STUDIO-VIDEOS.md, "Accept").
 */
export async function acceptJobIn(tx: CatalogDatabase, jobId: string, owner: string): Promise<TransitionResult> {
  const mine = await ownedJobs(tx, owner);
  const rows = await tx
    .select()
    .from(jobTable)
    .where(and(eq(jobTable.id, jobId), mine))
    .limit(1);
  const before = rows[0];
  if (before === undefined) throw await explainRefusal(tx, jobId, "accepted", owner);
  // Checked before anything is written, so a job in the wrong state gets
  // the transition refusal rather than a complaint about its outputs. The
  // conditional update at the end still guards the row itself: this is the
  // message, that is the lock.
  if (!canTransition(JOB_TRANSITIONS, before.state, "accepted")) {
    throw await explainRefusal(tx, jobId, "accepted", owner);
  }

  // An accepted job says what it landed, so one with nothing to point at is
  // not accepted, it is a row claiming a result it cannot name.
  const outputs = await jobOutputs(tx, jobId);
  if (outputs.length === 0) {
    if (before.kind === "video") {
      const slug = videoSlugOf(before.targetPath) ?? "<slug>";
      throw new JobError(
        `job ${jobId} has no output to accept. A video lands and is accepted in one step: \`catalog video put ` +
          `--job ${jobId} --slug ${slug} --dir <candidate> --base <revision|none> --reason "..."\`.`,
      );
    }
    const slug = /^learn\/assets\/(.+)\.tldr$/.exec(before.targetPath)?.[1] ?? "<slug>";
    throw new JobError(
      `job ${jobId} has no output to accept. Land it first: \`catalog diagram put ` +
        `--slug ${slug} --tldr <candidate> --svg <candidate.svg> --job ${jobId} --reason "..."\`.`,
    );
  }

  const updated = await tx
    .update(jobTable)
    .set({
      state: "accepted",
      reviewedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(jobTable.id, jobId), inArray(jobTable.state, sourcesOf("accepted")), mine))
    .returning();
  if (updated.length === 0) throw await explainRefusal(tx, jobId, "accepted", owner);

  return {
    ok: true as const,
    command: "accept" as const,
    from: before.state,
    to: "accepted",
    job: summarise(updated[0]!),
    outputs,
  };
}

/** Discard: the candidate is gone and the lease is released. */
export async function runDiscard(options: VerdictOptions): Promise<TransitionResult> {
  const owner = options.owner ?? CLI_OWNER;
  return withDatabase(async ({ db }) => {
    const mine = await ownedJobs(db, owner);
    const before = await db
      .select({ state: jobTable.state })
      .from(jobTable)
      .where(and(eq(jobTable.id, options.jobId), mine))
      .limit(1);
    const updated = await db
      .update(jobTable)
      .set({ state: "discarded", reviewedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(jobTable.id, options.jobId), inArray(jobTable.state, sourcesOf("discarded")), mine))
      .returning();
    if (updated.length === 0) throw await explainRefusal(db, options.jobId, "discarded", owner);
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
  /** Whose jobs. Default: the CLI's owner. */
  owner?: string;
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
      await ownedJobs(db, options.owner ?? CLI_OWNER),
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

export async function runShow(jobId: string, owner: string = CLI_OWNER): Promise<ShowResult> {
  return withDatabase(async ({ db }) => {
    const rows = await db
      .select()
      .from(jobTable)
      .where(and(eq(jobTable.id, jobId), await ownedJobs(db, owner)))
      .limit(1);
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
            .where(and(eq(sessionTable.id, row.sessionId), eq(sessionTable.learnerId, owner)))
            .limit(1);

    const outputs = await jobOutputs(db, jobId);

    // The owner's own revisions only: another owner's job naming this one as
    // its parent is theirs to list.
    const children = await db
      .select({ id: jobTable.id })
      .from(jobTable)
      .where(and(eq(jobTable.parentJobId, jobId), await ownedJobs(db, owner)))
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
        ...(result.discarded === null ? [] : [`  discarded ${result.discarded.id} (was ${result.discarded.from})`]),
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
