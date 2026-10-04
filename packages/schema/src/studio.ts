import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { createdAt, instant, ownerId, updatedAt } from "./columns";
import { asset, topic } from "./content";
import { learner } from "./state";
import {
  COST_SOURCES,
  DRAFT_ERROR_KINDS,
  DRAFT_KINDS,
  DRAFT_STATES,
  JOB_ACTIVE_STATES,
  JOB_KINDS,
  JOB_STATES,
  SESSION_KINDS,
  SESSION_STATES,
} from "./shared";

/**
 * The studio half: who asked for something to be made, and what came out.
 *
 * `SCHEMA.md` splits the catalog into content (derived from files), state (the
 * only copy of what a learner did) and operational (what the indexers did to
 * themselves). These are a fourth group.
 *
 * They have the state half's durability — losing them loses the brief and the
 * failure record, and no re-index writes either back — and none of its meaning.
 * A render error is not a thing a learner did, and a row saying Chromium fell
 * over sitting beside a Bayesian belief about the dot product would make both
 * harder to read. So they are counted apart by `catalog status`, the way
 * `OPERATIONAL_TABLES` already is.
 *
 * What deliberately does not happen here: no new `asset` kind (a diagram is a
 * kind `asset` already has), no new event type (a failed render is not evidence
 * about a learner and nothing projects it into `mastery`), and no column on
 * `asset` pointing back at a job (see `asset_job`).
 */

const inList = (column: string, values: readonly string[]) =>
  sql.raw(`${column} in (${values.map((v) => `'${v}'`).join(", ")})`);

const jsonObject = (column: string, nullable = false) =>
  sql.raw(
    nullable
      ? `${column} is null or jsonb_typeof(${column}) = 'object'`
      : `jsonb_typeof(${column}) = 'object'`,
  );

/**
 * One run of something that writes to the knowledge base: a tutoring session or
 * a studio generation session.
 *
 * The id is minted by the caller and is readable rather than a UUID
 * (`2026-09-14-dot-product`), because `learn session log --id` is typed by hand
 * and the session log's filename is the same string.
 *
 * A `tutor` session only ever uses `running`, `closed` and `interrupted`. The
 * other two states exist for a studio runner, which can observe a non-zero exit
 * and can acknowledge a cancel; a tutoring session has no process watching it
 * that could tell those apart.
 *
 * `log_asset_id` is the one `ON DELETE SET NULL` in this file, and it points the
 * opposite way from everything else: the markdown log is a derived `asset` row
 * that a full re-index can prune, and losing the pointer must not take the
 * session with it. There is no `asset_session` link table, because the only
 * asset a session produces without a job is that log.
 */
export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    learnerId: text("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "restrict", onUpdate: "cascade" }),
    state: text("state").notNull().default("running"),
    title: text("title"),
    goal: text("goal"),
    /** The headless agent session this ran under, for Resume. Not our id space. */
    agentSessionId: text("agent_session_id"),
    logAssetId: text("log_asset_id").references(() => asset.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    startedAt: instant("started_at").notNull().default(sql`now()`),
    endedAt: instant("ended_at"),
    /** Last sign of life. A stale one plus a dead process is `interrupted`. */
    heartbeatAt: instant("heartbeat_at"),
    /** A short machine-readable reason: `timeout`, `nonzero-exit`, `gate`. */
    errorKind: text("error_kind"),
    error: text("error"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("session_kind_check", inList("kind", SESSION_KINDS)),
    check("session_state_check", inList("state", SESSION_STATES)),
    check("session_metadata_object_check", jsonObject("metadata")),
    // A running session has not ended. The converse is deliberately not
    // asserted: the backfill in migration 0006 marks a session that never
    // closed `interrupted` with no `ended_at`, because nothing in the event log
    // says when it stopped and inventing an instant would be worse than a null.
    check("session_ended_at_check", sql`state <> 'running' or ended_at is null`),
    check("session_order_check", sql`ended_at is null or ended_at >= started_at`),
    index("session_kind_state_idx").on(t.kind, t.state),
    index("session_started_at_idx").on(t.startedAt),
    index("session_learner_id_idx").on(t.learnerId),
    index("session_log_asset_id_idx").on(t.logAssetId),
  ],
);

/**
 * One conversation with the studio's planner (docs/STUDIO-CHAT-FIRST.md,
 * D32): the headless session every turn resumes, where its transcript lives,
 * and the latest brief that passed `validateBrief`.
 *
 * **Disk first, like `job`.** The runner writes `drafts/<id>/draft.json` and
 * appends to `transcript.ndjson` before it mirrors the row here, so a database
 * that was down during a conversation loses nothing; this row is the query
 * surface. `transcript_path` is relative to the runner's `STUDIO_HOME` for the
 * reason `job.candidate_path` is: that directory moves between machines.
 *
 * **A draft has many jobs, and the link lives on `job` (D35).** A failed
 * drawing and a second Draw, or a second diagram in the same conversation, is
 * the normal case, and a `draft.job_id` would overwrite the first job's link.
 *
 * `kind` is what the draft's briefs produce (D42). Only `diagram` exists; the
 * column is here now so a second kind needs no backfill.
 *
 * `name` is the owner's, `title` the planner's: a conversation shows its
 * name, else its title, else the person's first message (the runner has
 * that; this row does not).
 *
 * `turns` counts the person's turns against the turn cap. `cost_usd` sums
 * every planner turn with the same paired source check as `job`; the daily
 * cap dates each turn at its own end from the runner's disk record, not from
 * this sum (D36).
 */
export const draft = pgTable(
  "draft",
  {
    id: text("id").primaryKey(),
    state: text("state").notNull().default("open"),
    kind: text("kind").notNull().default("diagram"),
    /** The slug of the diagram an extend draft was opened on. */
    source: text("source"),
    /** The latest brief's title, for the drafts list. Written by the planner's briefs, and moves with each one. */
    title: text("title"),
    /**
     * The name the owner gave the conversation (the sidebar's Rename), or
     * null for none. Every page shows it before `title`, which keeps moving
     * with the briefs underneath it. Set and cleared by the runner's
     * `PUT /api/drafts/{id}/name`; one line, at most 200 characters.
     */
    name: text("name"),
    /** The headless session every turn resumes. Minted before the first spawn. */
    plannerSessionId: text("planner_session_id").notNull(),
    /** `drafts/<id>/transcript.ndjson`, relative to the runner's `STUDIO_HOME`. */
    transcriptPath: text("transcript_path").notNull(),
    /** The latest brief that passed `validateBrief`. */
    brief: jsonb("brief"),
    briefAt: instant("brief_at"),
    /**
     * The topic entry the planner proposed and the dry run accepted, when the
     * brief's topic does not exist yet. Cleared when the Draw press creates it.
     */
    pendingTopic: jsonb("pending_topic"),
    turns: integer("turns").notNull().default(0),
    costUsd: doublePrecision("cost_usd"),
    costSource: text("cost_source"),
    errorKind: text("error_kind"),
    error: text("error"),
    ownerId: ownerId(() => learner.id),
    createdAt: createdAt(),
    /** Moves on every event, and drives pruning. */
    updatedAt: updatedAt(),
  },
  (t) => [
    check("draft_state_check", inList("state", DRAFT_STATES)),
    check("draft_kind_check", inList("kind", DRAFT_KINDS)),
    check("draft_brief_object_check", jsonObject("brief", true)),
    check("draft_pending_topic_object_check", jsonObject("pending_topic", true)),
    // A pending topic belongs to a brief that names it, so one with no brief
    // beside it is a proposal nothing would ever draw.
    check("draft_pending_topic_brief_check", sql`pending_topic is null or brief is not null`),
    // The runner trims a name and sends a blank one as null, so an empty
    // string here is a writer that skipped that, not a name.
    check("draft_name_check", sql`name is null or char_length(name) between 1 and 200`),
    check("draft_turns_check", sql`turns >= 0`),
    check("draft_cost_usd_check", sql`cost_usd is null or cost_usd >= 0`),
    check(
      "draft_cost_source_check",
      sql.raw(
        `cost_source is null or cost_source in (${COST_SOURCES.map((v) => `'${v}'`).join(", ")})`,
      ),
    ),
    check("draft_cost_source_paired_check", sql`cost_source is null or cost_usd is not null`),
    check(
      "draft_error_kind_check",
      sql.raw(
        `error_kind is null or error_kind in (${DRAFT_ERROR_KINDS.map((v) => `'${v}'`).join(", ")})`,
      ),
    ),
    index("draft_owner_id_idx").on(t.ownerId),
    index("draft_state_idx").on(t.state),
    index("draft_updated_at_idx").on(t.updatedAt),
  ],
);

/**
 * One request to generate one file, and everything that happened to it.
 *
 * **`target_path` and `candidate_path` are different things.** The job writes
 * only the candidate, in its own workspace (`jobs/<id>/candidate/<name>`,
 * relative to the runner's `STUDIO_HOME`); nothing lands until a person
 * accepts. `target_path` is the diagram's logical name, which the job never
 * opens, and it is also the lease key: the partial unique
 * index below stops a second job claiming a path an unaccepted candidate is
 * still holding.
 *
 * **`topic_slug` is a column and a foreign key, and the rest of the brief is
 * jsonb.** A foreign key does not survive being stuffed into JSON, and the
 * topic is the earliest moment "refuse, never skip" can fire: an agent naming a
 * slug that is not in `content/topics.yaml` fails the enqueue with a `23503`
 * before any GPU time, rather than producing a file the indexer then refuses.
 *
 * **`state` is checked and `phase` is not.** `state` is what a transition is
 * guarded with, so it stays small enough to reason about; `phase` is the
 * progress label the UI shows (`drawing`, `linting`, `exporting`) and differs
 * per generator, so a CHECK on it would grow every time a pipeline gains a
 * step.
 *
 * `cancel_requested_at` is a timestamp rather than a state for the same reason:
 * a job being cancelled is still running until the runner has killed Chromium,
 * and the row should say so.
 */
export const job = pgTable(
  "job",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    /** The session that ran it. Null while queued: no runner has claimed it. */
    sessionId: text("session_id").references(() => session.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    /** The job this one revises, for a retry or a resume. */
    parentJobId: text("parent_job_id").references((): AnyPgColumn => job.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    state: text("state").notNull().default("queued"),
    /** Free text for the progress list. Not a state; see the note above. */
    phase: text("phase"),
    topicSlug: text("topic_slug")
      .notNull()
      .references(() => topic.slug, { onDelete: "restrict", onUpdate: "cascade" }),
    /** The committed path the job intends to land on, and the lease key. */
    targetPath: text("target_path").notNull(),
    /**
     * Where it actually writes: `jobs/<id>/candidate/<name>`, relative to the
     * runner's `STUDIO_HOME`. Rows from before phase 2 of the content migration
     * keep `learn/assets/.candidates/<name>`, as history.
     */
    candidatePath: text("candidate_path"),
    /**
     * The target's content hash when the job was enqueued, or null when there
     * was no file there yet. One of the three hashes that make a human edit
     * landing mid-job visible: accept refuses when the target has moved since.
     */
    targetHashBefore: text("target_hash_before"),
    brief: jsonb("brief").notNull().default(sql`'{}'::jsonb`),
    /** What the gate found. Null until it has run. */
    gate: jsonb("gate"),
    /**
     * Supplied by the caller, so a retried submit returns the existing job
     * instead of queueing the render twice. Unique, and therefore the one
     * column here that makes enqueue idempotent.
     */
    idempotencyKey: text("idempotency_key").notNull(),
    /** How many times a runner has claimed it. Capped at three by the runner. */
    attempt: integer("attempt").notNull().default(0),
    requestedAt: instant("requested_at").notNull().default(sql`now()`),
    startedAt: instant("started_at"),
    finishedAt: instant("finished_at"),
    /** When a person accepted or discarded it. */
    reviewedAt: instant("reviewed_at"),
    heartbeatAt: instant("heartbeat_at"),
    cancelRequestedAt: instant("cancel_requested_at"),
    /** Which runner holds it, and that runner's own id for the work. */
    runner: text("runner"),
    runnerJobId: text("runner_job_id"),
    exitCode: integer("exit_code"),
    turns: integer("turns"),
    costUsd: doublePrecision("cost_usd"),
    /**
     * Where `cost_usd` came from, and therefore whether it is exact.
     *
     * A10 wrote that column from the agent's final `stream-json` result event
     * and from nowhere else, so a cancelled, timed-out or interrupted attempt
     * recorded nothing for work that was really paid for — which made the
     * column useless as the basis of a cap. The runner now accumulates from the
     * intermediate usage events too, and this says which kind of number a row
     * is holding: `result` is the bill, `stream` is an under-estimate.
     */
    costSource: text("cost_source"),
    errorKind: text("error_kind"),
    error: text("error"),
    errorDetail: jsonb("error_detail"),
    /**
     * The chat that asked for it (D35), or null for a job briefed through the
     * form or the CLI. Set null rather than blocked when a draft is pruned:
     * the job is the record of what was drawn and outlives the conversation.
     */
    draftId: text("draft_id").references(() => draft.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /** Whose job it is. Only `session` carried a learner before (D3). */
    ownerId: ownerId(() => learner.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("job_idempotency_key_key").on(t.idempotencyKey),
    // Two jobs cannot hold the same committed path at once. Partial rather than
    // total, because the whole history of a path is jobs that have finished
    // with it, and a lease that outlived its holder would be a lock nobody can
    // release. An advisory lock was the alternative and dies with its
    // connection, so the UI could never show who holds it.
    uniqueIndex("job_active_target_key")
      .on(t.targetPath)
      .where(inList("state", JOB_ACTIVE_STATES)),
    check("job_kind_check", inList("kind", JOB_KINDS)),
    check("job_state_check", inList("state", JOB_STATES)),
    check("job_brief_object_check", jsonObject("brief")),
    check("job_gate_object_check", jsonObject("gate", true)),
    check("job_error_detail_object_check", jsonObject("error_detail", true)),
    check("job_attempt_check", sql`attempt >= 0`),
    check("job_turns_check", sql`turns is null or turns >= 0`),
    check("job_cost_usd_check", sql`cost_usd is null or cost_usd >= 0`),
    // Spelled with the null arm rather than left to `NULL in (…)`, which is
    // NULL and therefore passes a CHECK by accident rather than on purpose.
    check(
      "job_cost_source_check",
      sql.raw(
        `cost_source is null or cost_source in (${COST_SOURCES.map((v) => `'${v}'`).join(", ")})`,
      ),
    ),
    // A source with no figure beside it says where a number came from and then
    // does not have one, which is not a state any writer here can produce.
    check("job_cost_source_paired_check", sql`cost_source is null or cost_usd is not null`),
    check("job_not_own_parent_check", sql`parent_job_id is distinct from id`),
    check("job_started_at_check", sql`started_at is null or started_at >= requested_at`),
    check(
      "job_finished_at_check",
      sql`finished_at is null or started_at is null or finished_at >= started_at`,
    ),
    // A queued job is one no runner has claimed, and that is what the lease
    // index and the reconcile pass both assume. Saying it here means a claim
    // that forgot to set `started_at` fails loudly instead of leaving a row
    // that looks queued and is not.
    check("job_queued_check", sql`state <> 'queued' or (started_at is null and runner is null)`),
    index("job_session_id_idx").on(t.sessionId),
    index("job_state_idx").on(t.state),
    index("job_topic_slug_idx").on(t.topicSlug),
    index("job_parent_job_id_idx").on(t.parentJobId),
    index("job_requested_at_idx").on(t.requestedAt),
    index("job_owner_id_idx").on(t.ownerId),
    index("job_draft_id_idx").on(t.draftId),
  ],
);

/**
 * Which job wrote which file: provenance as a link table, not a column.
 *
 * A column on `asset` is overwritten the next time the diagram is regenerated,
 * and the earlier job's claim is gone. The relationship is many-to-many over
 * time and one-to-many at any instant, which is a link table for the same
 * reason every other relationship in this schema is.
 *
 * `content_hash` is what the job wrote, and `asset.content_hash` is what is on
 * disk now. The two disagreeing is how an edit that landed after the accept
 * becomes visible at all.
 *
 * An asset with no row here had no job — it was scanned, or drawn by hand — and
 * that absence is the statement. Nothing needs backfilling into it.
 */
export const assetJob = pgTable(
  "asset_job",
  {
    assetId: text("asset_id")
      .notNull()
      .references(() => asset.id, { onDelete: "cascade", onUpdate: "cascade" }),
    jobId: text("job_id")
      .notNull()
      // Restrict, not cascade: the job row is the record of who made the file,
      // and a delete that silently took the provenance with it would leave an
      // asset claiming no author rather than refusing the delete.
      .references(() => job.id, { onDelete: "restrict", onUpdate: "cascade" }),
    /** sha256 of the bytes the job landed, lowercase hex. */
    contentHash: text("content_hash").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    writtenAt: instant("written_at").notNull().default(sql`now()`),
    ownerId: ownerId(() => learner.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.assetId, t.jobId] }),
    check("asset_job_bytes_check", sql`bytes >= 0`),
    index("asset_job_job_id_idx").on(t.jobId),
    index("asset_job_owner_id_idx").on(t.ownerId),
  ],
);
