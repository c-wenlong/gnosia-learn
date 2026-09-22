import { randomUUID } from "node:crypto";
import { copyFile, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { JobState } from "@self-learn/schema";

import { type ValidBrief } from "./brief";
import { AgentRun, startAgent, sweepOrphans } from "./agent";
import { buildComparison, readSide, sideFromGate, type Side } from "./compare";
import {
  CONCURRENCY,
  dailyCapUsd,
  DAILY_WINDOW_MS,
  JOB_TIMEOUT_MS,
  MAX_ATTEMPTS,
  RUNNER_NAME,
} from "./config";
import { costFromLog, JobCostMeter, spendWindow, type CostReading } from "./cost";
import { jobClaim, jobEnqueue, jobFinish, sessionEnd, sessionStart } from "./catalog";
import { narrate, runGate } from "./gate";
import {
  absolute,
  candidatePath,
  sessionLogPath,
  candidateSvgPath,
  jobDir,
  mermaidPath,
  rejectedDir,
  scratchDir,
  shotPath,
  targetPath,
  targetSvgPath,
  CANDIDATES_DIR,
} from "./paths";
import { buildPrompt, buildResumePrompt, buildRetryPrompt, buildRevisePrompt } from "./prompt";
import { dirtyFiles } from "./review";
import type { GateResult, JobRecord, JobStore } from "./store";

/**
 * The queue, the claim, the attempts and the verdict.
 *
 * One runner, one generator kind, one queue (D25): a tldrawkc job and a future
 * manimkc video job have nothing in common that a shared queue could be sized
 * for, so this process claims `diagram` jobs and nothing else.
 *
 * Concurrency is one. Every tldrawkc verb launches its own Chromium and a job
 * is four or more of them, so the knob exists, defaults to 1 and caps at 2
 * (D9). It also makes two jobs on one file structurally impossible, which is
 * belt and braces over the lease the partial unique index already holds.
 */

export class JobRefused extends Error {
  readonly status: number;
  readonly detail: unknown;
  constructor(status: number, message: string, detail: unknown = null) {
    super(message);
    this.name = "JobRefused";
    this.status = status;
    this.detail = detail;
  }
}

interface Running {
  record: JobRecord;
  agent: AgentRun | null;
  cancelled: boolean;
  /**
   * True when the 45-minute ceiling stopped it rather than a person.
   *
   * The two share one mechanism — both kill the process group and wait — and
   * they must not share a verdict. A2 says a job over its ceiling is `failed`
   * with `reason: "timeout"`, and a row that says "stopped on request" when
   * nobody asked is a lie in the one record a person reads to find out what
   * happened.
   */
  timedOut: boolean;
  jobTimer: NodeJS.Timeout;
  /**
   * What this job has spent so far, fed every line of the agent's stdout.
   *
   * One meter per job rather than per attempt, because a job is up to three
   * attempts and every one of them spends. Live, so a cancel or the ceiling can
   * read a real figure at the moment it kills the process — which is the whole
   * point of phase 7, since neither of those ever sees a result event.
   */
  meter: JobCostMeter;
  /** When the meter's figure was last written to the record. See `syncCost`. */
  costWrittenAt: number;
}

/**
 * How often the running total is written to `job.json` while a job runs.
 *
 * Not a config knob: it trades a write against how stale the cap's view of an
 * in-flight job can be, and neither side of that is something a person tunes.
 */
const COST_SYNC_MS = 2_000;

/** What `enqueue` needs to know about the job a revision continues. */
export interface ParentJob {
  jobId: string;
  /** The headless session `--resume` continues, when the parent had one. */
  agentSessionId: string | null;
  /**
   * What the person asked to be different this time, or `null` for a resume.
   *
   * The two callers are the two reasons to continue somebody else's session and
   * they are not the same fact. `revise` carries a change request, because a
   * revise with nothing to change is a re-run. A resume carries none: nothing
   * about an interrupted job was wrong, the runner simply died under it, and a
   * Resume button that had to invent a sentence would file words on the record
   * as something a person asked for.
   */
  changes: string | null;
}

export class Runner {
  private readonly store: JobStore;
  private readonly running = new Map<string, Running>();
  private draining = false;

  constructor(store: JobStore) {
    this.store = store;
  }

  /* ------------------------------------------------------------------ */
  /* Reconcile                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * What to do about jobs that outlived the process that was running them.
   *
   * `running` becomes `interrupted`: with concurrency 1 and one runner, a row
   * in `running` at start has no process behind it by definition. The candidate
   * is left alone and offered for review with a note that no gate ran on it
   * (S1), because the file outlives the process and deleting it would throw
   * away the only thing the job produced.
   *
   * `queued` survives, because nothing was in flight to lose, and the state
   * machine has no `queued → interrupted` edge for that reason.
   *
   * `awaiting_review` survives too, and that is a departure worth naming. The
   * lifecycle allows `awaiting_review → interrupted`, and marking them on every
   * start would empty the review queue each time the runner restarts — the
   * candidate is written, the gate has run and the record is complete, so there
   * is nothing a restart learns that makes it less trustworthy.
   *
   * Nothing is auto-requeued. manimkc requeues because nobody is watching it;
   * a person is watching this one, and an app that starts paid agent sessions
   * on launch is a surprise (D15).
   */
  async reconcile(): Promise<{ interrupted: string[]; swept: number[] }> {
    const interrupted: string[] = [];
    const swept: number[] = [];
    for (const record of this.store.list()) {
      if (record.state !== "running") continue;
      swept.push(...(await sweepOrphans(record.id)));
      // What is at the candidate path right now, so a later Resume can tell
      // this job's half-finished work from a *different* job's leftovers. The
      // path is per slug, not per job, and an interrupted job releases the
      // target's lease — so another job can write that same path before anyone
      // presses Resume. Without the hash, resuming would pick up whatever was
      // there and offer it for review as this job's output.
      const candidateHash = await sha256(absolute(record.candidatePath));
      // The one cost that cannot be read live, because the process that would
      // have read it is the process that died. `session.ndjson` is the
      // write-ahead log (rule 7) and every usage event the agent emitted is
      // still in it, so the meter is rebuilt from the file and the row stops
      // saying $0.00 for an attempt that really spent. Known gap in phase 3,
      // closed here.
      const cost = await this.costFromDisk(record);
      await this.store.update(record.id, {
        state: "interrupted",
        candidateHash,
        ...(cost?.usd === undefined || cost.usd === null
          ? {}
          : { costUsd: cost.usd, costSource: cost.source }),
        // Kept, not cleared, for the reason `finish` keeps it: "it died while
        // linting" is the only thing anyone can say about a job no gate ran on,
        // and clearing it throws that away to store a null.
        finishedAt: new Date().toISOString(),
        errorKind: "interrupted",
        error: "the runner died while this job was running",
        reconciled: true,
      });
      interrupted.push(record.id);
      const finished = await jobFinish({
        jobId: record.id,
        state: "interrupted",
        errorKind: "interrupted",
        error: "the runner died while this job was running",
        ...(cost?.usd === undefined || cost.usd === null
          ? {}
          : { costUsd: cost.usd, costSource: cost.source }),
      });
      if (!finished.ok) await this.store.noteCatalogError(record.id, finished.error ?? "");
      if (record.sessionId !== null) await sessionEnd(record.sessionId, "interrupted");
    }
    return { interrupted, swept };
  }

  /**
   * Rebuild a dead job's spend from its own transcript.
   *
   * The studio's own progress events are appended to the same file, and are
   * ignored here because none of them is an assistant or a result event — the
   * meter only ever reads those two. A log that cannot be read at all is a job
   * with no recoverable figure, which is a null and not a zero: zero is a claim
   * that nothing was spent, and nobody knows that.
   */
  private async costFromDisk(record: JobRecord): Promise<CostReading | null> {
    try {
      const body = await readFile(sessionLogPath(record.id), "utf8");
      return costFromLog(body, record.brief.model);
    } catch {
      return null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Enqueue                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Record the job on disk, then in Postgres, then wake the queue.
   *
   * That order is rule 7, and the refusals are checked in the order that costs
   * least: an idempotency key that already exists returns its job, a target
   * another job is holding is a 409 naming the holder, and only then does the
   * catalog get asked — where the same two rules are enforced again by a unique
   * index that does not depend on this process being the only one.
   */
  async enqueue(
    brief: ValidBrief,
    parent?: ParentJob,
  ): Promise<{ record: JobRecord; created: boolean; jobsAhead: number }> {
    const existing = this.store.byIdempotencyKey(brief.idempotencyKey);
    if (existing !== undefined) {
      return { record: existing, created: false, jobsAhead: this.queued().length };
    }

    const target = targetPath(brief.slug);
    const holder = this.store.activeOn(target);
    if (holder !== undefined) {
      throw new JobRefused(
        409,
        `${target} is already held by job ${holder.id} (${holder.state}). One job per committed ` +
          `path: accept or discard that one first, because this brief would be written against a ` +
          `file it has not landed yet.`,
        { holder: holder.id, state: holder.state },
      );
    }

    const targetExists = (await stat(absolute(target)).catch(() => null)) !== null;
    if (brief.mode === "new" && targetExists) {
      throw new JobRefused(
        409,
        `${target} already exists, and this brief says mode "new". Use "extend" to build on it, ` +
          `or pick another slug. The agent never decides this.`,
      );
    }
    if (brief.mode === "extend" && !targetExists) {
      throw new JobRefused(
        409,
        `${target} does not exist, and this brief says mode "extend". There is nothing to extend.`,
      );
    }

    // The sixth guard, and last in the order because it is the only one that is
    // about the *account* rather than about this brief. A10's five — the cheap
    // model, the turn cap, three attempts, the ceiling, and the recorded
    // figure — all still fire where they already did, and none of them moved.
    this.refuseOverCap();

    const id = randomUUID();
    const record: JobRecord = {
      id,
      kind: "diagram",
      state: "queued",
      phase: null,
      brief,
      targetPath: target,
      targetSvgPath: targetSvgPath(brief.slug),
      candidatePath: candidatePath(brief.slug),
      candidateSvgPath: candidateSvgPath(brief.slug),
      topic: brief.topic,
      slug: brief.slug,
      attempt: 0,
      sessionId: null,
      // A revision inherits its parent's headless session, so its first attempt
      // continues that transcript with a change request instead of paying for
      // the whole drawing again. That is what `POST /api/jobs/{id}/revise`
      // means in the API table, and what the Resume button A7 describes does.
      agentSessionId: parent?.agentSessionId ?? null,
      parentJobId: parent?.jobId ?? null,
      changes: parent?.changes ?? null,
      idempotencyKey: brief.idempotencyKey,
      targetHashBefore: targetExists ? await sha256(absolute(target)) : null,
      requestedAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      reviewedAt: null,
      heartbeatAt: null,
      cancelRequestedAt: null,
      exitCode: null,
      turns: null,
      costUsd: null,
      costSource: null,
      gate: null,
      errorKind: null,
      error: null,
      written: [],
      indexed: false,
      catalogErrors: [],
    };
    await this.store.create(record);

    const briefFile = path.join(jobDir(id), "brief.json");
    await writeFile(
      briefFile,
      `${JSON.stringify(
        {
          id,
          kind: "diagram",
          topic: brief.topic,
          target,
          candidate: record.candidatePath,
          idempotencyKey: brief.idempotencyKey,
          brief,
        },
        null,
        1,
      )}\n`,
      "utf8",
    );
    const enqueued = await jobEnqueue(briefFile);
    if (!enqueued.ok && !enqueued.offline) {
      // The catalog answered and said no, and its reasons are the durable ones:
      // a topic that is not in the vocabulary, a lease another process holds.
      // The disk record is removed, and forgotten, rather than left as a job
      // nothing will ever claim while still holding this target's lease in
      // memory against every brief that follows it.
      await rm(jobDir(id), { recursive: true, force: true });
      this.store.forget(id);
      throw new JobRefused(
        enqueued.error?.includes("already held") === true ? 409 : 400,
        enqueued.error ?? "the catalog would not take this job",
      );
    }
    if (!enqueued.ok) {
      // The catalog never answered, which is a different fact and a different
      // policy. D16: a missing `dist/` refuses the job and a missing Postgres
      // does not, and U3 says the studio keeps browsing and drawing with the
      // database down, reading its jobs from disk. Deleting the workspace here
      // would have made "the database is down" the one thing that loses work,
      // in the service whose whole write path is a disk record first (rule 7).
      // The row is reconciled from `job.json` when the database is back.
      await this.store.noteCatalogError(id, enqueued.error ?? "");
    }

    void this.kick();
    return { record, created: true, jobsAhead: Math.max(0, this.queued().length - 1) };
  }

  /* ------------------------------------------------------------------ */
  /* The daily cap                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * What has been spent in the last rolling 24 hours.
   *
   * Read from the disk records rather than from Postgres, which is the same
   * reading every other refusal here takes: rule 7 makes `job.json` the record
   * and the database the query surface, and D16 says a database that is down
   * does not stop the studio drawing. A cap that needed Postgres would be a cap
   * that silently switched itself off exactly when nothing was watching.
   *
   * Includes the estimated figures. That is the phase: a cancelled attempt's
   * spend is real spend, and a cap that counted only the clean finishes would
   * be a cap anybody could walk past by pressing Cancel.
   */
  spend(now: number = Date.now()): ReturnType<typeof spendWindow> {
    return spendWindow(this.store.list(), DAILY_WINDOW_MS, now);
  }

  /** What the cap is, and where it stands. For `/api/health` and the UI. */
  capStatus(now: number = Date.now()): {
    capUsd: number | null;
    totalUsd: number;
    jobs: number;
    oldestStartedAt: string | null;
    oldestAgesOutAt: string | null;
    exceeded: boolean;
  } {
    const window = this.spend(now);
    const cap = dailyCapUsd();
    return {
      capUsd: cap,
      ...window,
      exceeded: cap !== null && window.totalUsd >= cap,
    };
  }

  /**
   * Refuse a new job once the rolling day's spend has crossed the cap.
   *
   * **`>=`, not `>`.** The figures being summed are partly estimates and
   * estimates here run low, so a total sitting exactly on the cap has probably
   * already passed it. Refusing at the line is the direction that costs a job
   * rather than the direction that costs money.
   *
   * **It refuses the next job; it never stops a running one.** Killing paid
   * work halfway is a bill with nothing to show for it, and the 45 minute
   * ceiling is already the guard for a job that will not stop.
   *
   * 429 rather than 409: nothing about this brief is wrong, and the same
   * request will succeed later. The body says the total, the cap, and when the
   * oldest counted attempt leaves the window, because a refusal that does not
   * say when to come back is a dead end.
   */
  private refuseOverCap(now: number = Date.now()): void {
    const cap = dailyCapUsd();
    if (cap === null) return;
    const window = this.spend(now);
    if (window.totalUsd < cap) return;
    const dollars = (value: number): string => `$${value.toFixed(2)}`;
    throw new JobRefused(
      429,
      `the studio has spent ${dollars(window.totalUsd)} in the last 24 hours, which is at or over ` +
        `the ${dollars(cap)} STUDIO_DAILY_USD cap. Nothing was queued. The oldest attempt ` +
        `counted here started ${window.oldestStartedAt ?? "(unknown)"} and leaves the window at ` +
        `${window.oldestAgesOutAt ?? "(unknown)"}, which is the earliest this total can fall. ` +
        `Raise STUDIO_DAILY_USD, or wait.`,
      {
        reason: "daily-cap",
        totalUsd: window.totalUsd,
        capUsd: cap,
        jobs: window.jobs,
        windowHours: DAILY_WINDOW_MS / 3_600_000,
        oldestStartedAt: window.oldestStartedAt,
        oldestAgesOutAt: window.oldestAgesOutAt,
      },
    );
  }

  private queued(): JobRecord[] {
    return this.store
      .list({ state: "queued" })
      .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
  }

  /** Start whatever the concurrency limit allows. Safe to call at any time. */
  async kick(): Promise<void> {
    if (this.draining) return;
    while (this.running.size < CONCURRENCY) {
      const next = this.queued().find((record) => !this.running.has(record.id));
      if (next === undefined) return;
      // Registered before the first await, so a second kick cannot claim it.
      const entry: Running = {
        record: next,
        agent: null,
        cancelled: false,
        timedOut: false,
        // Seeded with the brief's model rather than left null: the stream names
        // the model on its first assistant event, and an attempt killed before
        // one arrived would otherwise have tokens it could not price.
        meter: new JobCostMeter(next.brief.model),
        // Zero, not `Date.now()`: the first line of a job should land a figure
        // rather than wait out a throttle window it never asked for.
        costWrittenAt: 0,
        jobTimer: setTimeout(() => {
          // Caught rather than left to reject: by the time the ceiling fires
          // the job may already be finishing, and `cancel` refuses a job that
          // is no longer running. That refusal is the right answer and an
          // unhandled rejection is not.
          void this.cancel(next.id, "job-timeout").catch(() => undefined);
        }, JOB_TIMEOUT_MS),
      };
      this.running.set(next.id, entry);
      void this.execute(entry).catch(async (error: unknown) => {
        await this.store.update(next.id, {
          state: "failed",
          phase: null,
          finishedAt: new Date().toISOString(),
          errorKind: "internal",
          error: `the runner threw: ${(error as Error).message}`,
        });
      }).finally(() => {
        clearTimeout(entry.jobTimer);
        this.running.delete(next.id);
        void this.kick();
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* One job                                                            */
  /* ------------------------------------------------------------------ */

  private async execute(entry: Running): Promise<void> {
    const id = entry.record.id;
    const sessionId = `studio-${id}`;
    // A revision carries its parent's headless session and continues it; every
    // other job mints one. Reading the record rather than always minting is the
    // difference between `revise` resuming a stored session and `revise` paying
    // for the whole drawing a second time.
    const inherited = entry.record.agentSessionId;
    let agentSessionId = inherited ?? randomUUID();
    let resumeFromParent = inherited !== null;

    // Persisted before the agent launches, which is the fix manimkc already
    // made after losing a session to a restart: a kill at any point leaves
    // something `--resume` can continue rather than a paid attempt with no way
    // back to it.
    let record = await this.store.update(id, {
      state: "running",
      phase: "reading",
      startedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
      sessionId,
      agentSessionId,
      attempt: 0,
    });
    await this.store.emit(id, { type: "phase", phase: "reading", note: "reading the brief", state: "running" });

    const opened = await sessionStart({
      id: sessionId,
      title: record.brief.title,
      goal: record.brief.intent,
      agentSessionId,
    });
    if (!opened.ok) await this.store.noteCatalogError(id, opened.error ?? "");

    const claimed = await jobClaim(id, RUNNER_NAME, sessionId);
    if (!claimed.ok) {
      await this.store.noteCatalogError(id, claimed.error ?? "");
      if (!claimed.offline) {
        // The catalog answered and would not hand this job over, which means
        // the row is no longer `queued`: another runner claimed it, or a person
        // cancelled it. Continuing anyway would put a second paid agent on the
        // same candidate path, and the loser would then write terminal state
        // over the winner's. The claim is the only lease that does not depend
        // on this process being the only one, so a refusal ends the attempt.
        //
        // No `job finish` here on purpose: the row belongs to whoever holds it,
        // and finishing it would transition *their* running job to failed.
        await this.abandon(entry, claimed.error ?? "the catalog would not hand this job over");
        return;
      }
      // Offline is the degraded mode, not a refusal. D16, and the same
      // reading enqueue takes.
    }

    const dirtyBefore = new Set(await dirtyFiles());

    await mkdir(absolute(CANDIDATES_DIR), { recursive: true });
    await mkdir(scratchDir(id), { recursive: true });

    /* The before half of the comparison, and the only moment it can be read.
     *
     * After an accept there is no before left on disk: the rename replaces the
     * committed file, and the picture of what was there is gone with it. So the
     * screenshot and the counts are taken now, against the committed file as it
     * is at this instant, and stored on the record.
     *
     * A job in `new` mode has no before at all, and the panel says so rather
     * than showing an empty tile — there is nothing to compare a first drawing
     * against, and an empty box beside a real one reads as a failure. */
    const before = await this.readBefore(record);
    await this.store.update(id, { comparison: buildComparison(before, null, { beforeHash: record.targetHashBefore }) });

    // Extend reads a copy, never the committed file. Lifting an existing
    // document is how every diagram ends up looking like the first one, which
    // is the reason manimkc's clean-room rule exists and the reason this one
    // does; the copy is what lets the rule hold while extending still works.
    //
    // **Except when the candidate is the work being resumed.** A resume of an
    // interrupted job re-derives `extend` from the target existing, and copying
    // the committed file over the candidate would then delete the partial
    // drawing the reconcile pass deliberately left on disk — a resume that
    // begins by destroying what it is resuming. Caught in review on this PR;
    // the phase's own testing never hit it, because every job it ran had no
    // committed target and so resumed as `new`.
    //
    // Whether the candidate on disk *is* the preserved work is a question with
    // an answer, and asking it is the difference between resuming a job and
    // adopting whatever happens to be at that path: the reconcile pass hashed
    // the candidate when it wrote `interrupted`, so a byte-for-byte match is
    // this job's own half-drawn document and anything else is somebody's.
    const resumedWork = await this.holdsResumedWork(record);
    let unchangedHash: string | null = null;
    if (record.brief.mode === "extend") {
      if (!resumedWork) {
        await copyFile(absolute(record.targetPath), absolute(record.candidatePath));
        // Remembered so the gate can tell "extended it" from "left the copy
        // exactly as it found it". Without it, an agent that did nothing at all
        // presents the runner's own copy of the committed diagram for review and
        // passes every check, because the committed diagram was already good.
        unchangedHash = await sha256(absolute(record.candidatePath));
      }
      // A resumed candidate gets no `unchangedHash` on purpose. It is not the
      // runner's copy of anything, and a resume whose agent looks at a finished
      // drawing and only re-exports it has done the right thing — which is the
      // same reasoning that moved the gate's freshness check to the parent's
      // start. The other five gate steps still judge the artifact.
    }
    const hasMermaid = record.brief.mermaid !== undefined;
    if (hasMermaid) {
      await writeFile(mermaidPath(id), record.brief.mermaid ?? "", "utf8");
    }

    let gate: GateResult | null = null;
    let findings: string[] = [];
    let outcome: Awaited<AgentRun["done"]> | null = null;
    /** True once this session id has a transcript, so the next call resumes it. */
    let startedSession = false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      if (entry.cancelled) break;
      // A first attempt opens on `planning`, not `drawing`. What the agent
      // actually does first is read `canvas api` and work out a layout, so the
      // old value was a phase list that went drawing, planning, drawing in the
      // first twenty seconds of every job — measured on the first real one.
      // A retry does open on drawing: it is handed a finding and goes to fix
      // it in the document it already has.
      const opening = attempt === 1 ? "planning" : "drawing";
      record = await this.store.update(id, {
        attempt,
        phase: opening,
        heartbeatAt: new Date().toISOString(),
      });
      await this.store.emit(id, {
        type: "phase",
        phase: opening,
        note: attempt === 1 ? "the agent is planning the drawing" : `attempt ${attempt}: fixing what the check found`,
        state: "running",
      });

      // What to say, and whether to continue a transcript, are one question
      // asked of the state rather than of the attempt number: a fresh session
      // after a failed resume is attempt two and still needs the whole prompt.
      const started = startedSession;
      const prompt =
        findings.length > 0
          ? buildRetryPrompt(findings, record.slug)
          : resumeFromParent
            ? record.changes !== null
              ? buildRevisePrompt(record.changes, record.slug)
              : // A parent with no change request is a resume: the job this one
                // continues was interrupted rather than reviewed, so there is
                // nothing different to ask for and the whole brief is already
                // in the transcript being resumed.
                buildResumePrompt(record.slug)
            : buildPrompt({ jobId: id, brief: record.brief, hasMermaid });
      startedSession = true;

      const agent = await startAgent({
        jobId: id,
        slug: record.slug,
        ...(record.brief.source === undefined ? {} : { source: record.brief.source }),
        prompt,
        model: record.brief.model,
        sessionId: agentSessionId,
        resume: resumeFromParent || started,
        onLine: (line) => {
          void this.onAgentLine(id, line);
        },
      });
      entry.agent = agent;
      outcome = await agent.done;
      entry.agent = null;

      if (entry.cancelled || outcome.stopReason === "cancelled") break;

      if (outcome.spawnFailed) {
        // Nothing ran, so there is nothing on disk to judge and no point paying
        // for two more attempts at the same missing binary.
        await this.finish(entry, "failed", {
          errorKind: "spawn",
          error: `the agent never started: ${outcome.stderr || "the process could not be spawned"}`,
          exitCode: null,
          turns: null,
          // Not null. This attempt spent nothing, but an earlier one may have:
          // a spawn that fails on attempt two still owes attempt one's bill.
          cost: entry.meter.read(),
        });
        return;
      }

      if (resumeFromParent && outcome.turns === null && outcome.exitCode !== 0) {
        // A `--resume` against a session this machine no longer has exits
        // without taking a turn. Retrying the same id twice more would spend
        // two attempts on the same missing transcript, so the revision falls
        // back to a session of its own and draws from the brief instead.
        agentSessionId = randomUUID();
        resumeFromParent = false;
        startedSession = false;
        record = await this.store.update(id, { agentSessionId });
        findings = [];
        await this.store.emit(id, {
          type: "phase",
          note: "the stored session could not be resumed, so this attempt starts a fresh one",
          state: "running",
        });
        continue;
      }
      if (outcome.stopReason === "attempt-timeout" || outcome.stopReason === "idle-timeout") {
        await this.finish(entry, "failed", {
          errorKind: "timeout",
          error:
            outcome.stopReason === "idle-timeout"
              ? "the agent stopped saying anything for five minutes, which is what a browser that never answered looks like"
              : "the attempt ran past fifteen minutes",
          exitCode: outcome.exitCode,
          turns: outcome.turns,
          // A killed session writes no result event, so `outcome` never carried
          // a figure here at all. The meter has one.
          cost: entry.meter.read(),
        });
        return;
      }

      await this.store.update(id, { phase: "linting", heartbeatAt: new Date().toISOString() });
      gate = await runGate({
        slug: record.slug,
        topic: record.topic,
        candidatePath: record.candidatePath,
        candidateSvgPath: record.candidateSvgPath,
        startedAtMs: gateFreshnessFrom(record, this.store, resumedWork),
        elements: record.brief.elements,
        relations: record.brief.relations,
        unchangedHash,
        shotPath: shotPath(id, "after"),
        onStep: (step) => {
          void this.store.emit(id, { type: "step", note: narrate(step), state: "running" });
          // The gate runs `export` and `verify` itself, and until phase 3 asked
          // for a seven-row list those two phases only ever appeared if the
          // agent happened to run the verbs before it exited. The phase named
          // here is the one about to run, read off the step that just finished,
          // so the list advances on the runner's own calls rather than on the
          // agent's habits.
          const next = GATE_PHASE_AFTER[step.name];
          if (next !== undefined && step.ok) void this.advancePhase(id, next);
        },
      });
      // The comparison is rewritten on every attempt, so the panel of a job
      // that looped twice shows what the last attempt actually produced rather
      // than the first one's numbers.
      await this.store.update(id, {
        gate,
        comparison: buildComparison(before, sideFromGate(gate), {
          beforeHash: record.targetHashBefore,
        }),
      });
      findings = gate.findings;
      if (gate.ok) break;
      if (attempt === MAX_ATTEMPTS) break;
    }

    if (entry.cancelled) {
      await this.acknowledgeCancel(entry, outcome);
      return;
    }

    /* The A4 backstop. A zero exit and a clean gate still do not entitle a job
     * to have written anything outside the candidates directory. */
    const dirtyAfter = await dirtyFiles();
    const stray = dirtyAfter.filter((file) => !dirtyBefore.has(file) && !isOutput(file, record));
    if (stray.length > 0) {
      await this.finish(entry, "failed", {
        errorKind: "wrote-outside",
        error:
          `the job left files dirty that it was never allowed to write: ${stray.join(", ")}. ` +
          `Nothing was reverted, because a revert can destroy a concurrent edit — look at them ` +
          `and decide.`,
        exitCode: outcome?.exitCode ?? null,
        turns: outcome?.turns ?? null,
        cost: entry.meter.read(),
        gate,
      });
      return;
    }

    if (gate !== null && gate.ok) {
      await this.finish(entry, "awaiting_review", {
        gate,
        exitCode: outcome?.exitCode ?? null,
        turns: outcome?.turns ?? null,
        cost: entry.meter.read(),
      });
      return;
    }

    // Three attempts spent. The partials move where a person can look at them,
    // and the findings are what the panel shows.
    await this.moveToRejected(record);
    await this.finish(entry, "failed", {
      gate,
      errorKind: "gate",
      error:
        gate === null
          ? `the agent produced nothing a gate could look at (${outcome?.subtype ?? "no result"})`
          : gate.findings.join(" "),
      exitCode: outcome?.exitCode ?? null,
      turns: outcome?.turns ?? null,
      // Every attempt, not just the last: three tries at one diagram is three
      // bills, and reading the final result event alone forgot the two before it.
      cost: entry.meter.read(),
    });
  }

  /**
   * One line of the agent's stdout: to the log verbatim, then to the phase.
   *
   * The phase is inferred from the commands the agent actually runs rather than
   * from anything it says about itself, which is the same rule the gate keeps
   * one step later (D24). It is a label on a progress list, so a wrong guess
   * costs a word; a claim about the output would cost more, and none is made
   * here.
   */
  private async onAgentLine(id: string, line: string): Promise<void> {
    // Synchronously, before the first await: the meter must see every line in
    // the order it arrived, and a cancel landing mid-append should still find
    // the figure up to date.
    this.running.get(id)?.meter.observe(line);
    await this.store.appendRaw(id, line);
    await this.syncCost(id);
    const phase = phaseFromLine(line);
    if (phase === null) return;
    await this.advancePhase(id, phase);
  }

  /**
   * Move the job to `phase`, and say so once.
   *
   * Idempotent on purpose: the agent runs `inspect` four times in a loop and
   * the gate runs it again, and a phase list that flickered on each would be
   * noise rather than progress. A phase the job is already in is not an event.
   */
  private async advancePhase(id: string, phase: string): Promise<void> {
    const record = this.store.get(id);
    if (record === undefined || record.phase === phase) return;
    await this.store.update(id, { phase, heartbeatAt: new Date().toISOString() });
    await this.store.emit(id, {
      type: "phase",
      phase,
      note: PHASE_NOTES[phase] ?? phase,
      state: "running",
    });
  }

  /**
   * The committed diagram as it is right now: its counts, its lints, a picture.
   *
   * Null when there is nothing at the target path, which is every `new` job.
   * That null is the honest answer and the panel prints it: a first drawing has
   * no before, and an empty tile beside a real one reads as a screenshot that
   * failed rather than as a diagram that did not exist.
   *
   * Two Chromium launches, both of them survivable: a document that will not
   * inspect comes back with null counts and a picture that was not taken comes
   * back as `shot: false`. Neither is a verdict on the job, because neither is
   * about the job's own output.
   */
  private async readBefore(record: JobRecord): Promise<Side | null> {
    if ((await stat(absolute(record.targetPath)).catch(() => null)) === null) return null;
    const side = await readSide({
      file: record.targetPath,
      svgFile: record.targetSvgPath,
      shotPath: shotPath(record.id, "before"),
    });
    await this.store.emit(record.id, {
      type: "step",
      state: "running",
      note:
        side.shapes === null
          ? `the committed ${record.targetPath} would not inspect, so there is no before to compare against`
          : `read the committed diagram: ${side.shapes} shapes, ${side.lints.length} lint${side.lints.length === 1 ? "" : "s"}`,
    });
    return side;
  }

  /**
   * Write the running total onto the record, at most every few seconds.
   *
   * Two things want a figure before the job has a verdict. The cap, which would
   * otherwise ignore a job that has been spending for twenty minutes and let a
   * second one start beside it; and the panel's chip, which is the only place a
   * person can see a job getting expensive while it still can be stopped.
   *
   * **Not folded into `advancePhase`, which was the first attempt.** A phase is
   * inferred from the commands the agent happens to run, so tying the money to
   * it means a job that spends heavily without changing phase records nothing —
   * and the reconcile pass then has to find it. The throttle is time, not
   * phases: a `job.json` write is a temp file and a rename, and the stream
   * arrives faster than either needs to happen.
   */
  private async syncCost(id: string): Promise<void> {
    const entry = this.running.get(id);
    if (entry === undefined) return;
    const now = Date.now();
    if (now - entry.costWrittenAt < COST_SYNC_MS) return;
    const cost = entry.meter.read();
    if (cost.usd === null) return;
    const record = this.store.get(id);
    if (record === undefined) return;
    if (record.costUsd === cost.usd && record.costSource === cost.source) return;
    entry.costWrittenAt = now;
    await this.store.update(id, { costUsd: cost.usd, costSource: cost.source });
  }

  /**
   * Is the candidate on disk the work this job is resuming?
   *
   * Three things have to hold, and the third is the one the first version of
   * this missed. It has to be a resume — a parent, and no change request. The
   * parent has to have recorded a candidate when it was interrupted. And the
   * bytes have to still match: the path is `learn/assets/.candidates/<slug>`,
   * which is per slug rather than per job, and an interrupted job holds no
   * lease on its target, so a later job for the same slug can write that path
   * and leave its own file behind. Adopting it would mean resuming one job and
   * offering another's artifact for review under its name.
   */
  private async holdsResumedWork(record: JobRecord): Promise<boolean> {
    if (record.parentJobId === null || record.changes !== null) return false;
    const parent = this.store.get(record.parentJobId);
    const expected = parent?.candidateHash ?? null;
    if (expected === null) return false;
    return (await sha256(absolute(record.candidatePath))) === expected;
  }

  private async finish(
    entry: Running,
    state: JobState,
    patch: {
      gate?: GateResult | null;
      errorKind?: string;
      error?: string;
      exitCode?: number | null;
      turns?: number | null;
      /** The job's meter, read at the moment it stopped. See `cost.ts`. */
      cost?: CostReading | null;
    },
  ): Promise<void> {
    const id = entry.record.id;
    const record = await this.store.update(id, {
      state,
      // The phase a job stopped in is kept rather than cleared. The failure
      // panel's whole shape is "the phase list with the failed phase marked",
      // and a record that forgets which phase that was can only say so when a
      // browser happened to be watching the stream at the time. `ready` is the
      // one the runner names itself, because nothing emits it.
      phase: state === "awaiting_review" ? "ready" : (this.store.get(id)?.phase ?? null),
      finishedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
      gate: patch.gate ?? this.store.get(id)?.gate ?? null,
      exitCode: patch.exitCode ?? null,
      turns: patch.turns ?? null,
      costUsd: patch.cost?.usd ?? null,
      costSource: patch.cost?.source ?? null,
      errorKind: patch.errorKind ?? null,
      error: patch.error ?? null,
    });
    await this.store.emit(id, {
      type: state === "awaiting_review" ? "done" : "error",
      state,
      note: noteFor(record),
      ...(record.gate === null ? {} : { gate: record.gate }),
    });

    const gateFile = path.join(jobDir(id), "gate.json");
    if (record.gate !== null) {
      await writeFile(gateFile, `${JSON.stringify(record.gate, null, 1)}\n`, "utf8");
    }
    const finished = await jobFinish({
      jobId: id,
      state,
      ...(record.phase === null ? {} : { phase: record.phase }),
      candidatePath: record.candidatePath,
      ...(record.gate === null ? {} : { gateFile }),
      exitCode: record.exitCode,
      turns: record.turns,
      costUsd: record.costUsd,
      ...(record.costSource === null ? {} : { costSource: record.costSource }),
      ...(record.errorKind === null ? {} : { errorKind: record.errorKind }),
      ...(record.error === null ? {} : { error: record.error }),
    });
    if (!finished.ok) await this.store.noteCatalogError(id, finished.error ?? "");
    if (record.sessionId !== null) {
      await sessionEnd(
        record.sessionId,
        state === "awaiting_review" ? "closed" : state === "cancelled" ? "cancelled" : "failed",
        record.error ?? undefined,
      );
    }
  }

  /* ------------------------------------------------------------------ */
  /* Cancel                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Stop a job, and do not call it stopped until Chromium is gone.
   *
   * `cancel_requested_at` is a timestamp rather than a state because a job
   * being cancelled is still running until the runner has killed the browser,
   * and the row should say so (S2). If the runner never gets to acknowledge it,
   * the reconcile pass writes `interrupted` instead, which is the honest
   * distinction: "the user stopped it" and "it died" are different facts.
   */
  async cancel(id: string, reason: "requested" | "job-timeout" = "requested"): Promise<JobRecord> {
    const record = this.store.get(id);
    if (record === undefined) throw new JobRefused(404, `no job ${id}`);

    if (record.state === "queued") {
      // Nothing started, so there is nothing to wait for.
      const updated = await this.store.update(id, {
        state: "cancelled",
        cancelRequestedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        errorKind: "cancelled",
        error: "cancelled before it started",
      });
      const finished = await jobFinish({
        jobId: id,
        state: "cancelled",
        errorKind: "cancelled",
        error: "cancelled before it started",
      });
      if (!finished.ok) await this.store.noteCatalogError(id, finished.error ?? "");
      return updated;
    }

    if (record.state !== "running") {
      throw new JobRefused(409, `job ${id} is ${record.state}, so there is nothing to cancel`);
    }

    const entry = this.running.get(id);
    const updated = await this.store.update(id, { cancelRequestedAt: new Date().toISOString() });
    await this.store.emit(id, {
      type: "phase",
      note:
        reason === "job-timeout"
          ? "the job ran past its ceiling and is being stopped"
          : "stopping: the browser is being closed",
      state: "running",
    });
    if (entry !== undefined) {
      entry.cancelled = true;
      if (reason === "job-timeout") entry.timedOut = true;
      await entry.agent?.stop("cancelled");
    }
    return updated;
  }

  /**
   * Called once the agent has actually exited. Sweeps, then writes the verdict.
   *
   * Two verdicts, because the ceiling and a person share a mechanism and not a
   * meaning. A2 says a job past forty-five minutes is `failed` with
   * `reason: "timeout"`; only a job somebody stopped is `cancelled`. Writing
   * "stopped on request" over a timeout puts a sentence in the record that
   * nobody can act on, and hides the one number that needs raising.
   */
  private async acknowledgeCancel(
    entry: Running,
    outcome: Awaited<AgentRun["done"]> | null,
  ): Promise<void> {
    const swept = await sweepOrphans(entry.record.id);
    const sweptNote =
      swept.length === 0
        ? "the process group kill was enough"
        : `${swept.length} process${swept.length === 1 ? "" : "es"} survived the group kill and were swept`;
    await this.finish(entry, entry.timedOut ? "failed" : "cancelled", {
      errorKind: entry.timedOut ? "timeout" : "cancelled",
      error: entry.timedOut
        ? `the job ran past its ${Math.round(JOB_TIMEOUT_MS / 60_000)} minute ceiling and was ` +
          `stopped; ${sweptNote}. The session id is kept, so a revise can continue it rather ` +
          `than paying for the drawing again.`
        : `stopped on request; ${sweptNote}`,
      exitCode: outcome?.exitCode ?? null,
      turns: outcome?.turns ?? null,
      cost: entry.meter.read(),
    });
  }

  /**
   * End a job the catalog would not hand over, without touching the catalog.
   *
   * `finish` is the wrong tool here: it calls `job finish`, and the row is
   * somebody else's by definition — that is what the refused claim said. So the
   * disk record and the session are closed and the row is left alone.
   */
  private async abandon(entry: Running, reason: string): Promise<void> {
    const id = entry.record.id;
    const error =
      `${reason}. Another runner holds this job, or it was cancelled between being queued and ` +
      `being picked up, so no agent was started and nothing was spent.`;
    const updated = await this.store.update(id, {
      state: "failed",
      finishedAt: new Date().toISOString(),
      errorKind: "not-claimed",
      error,
    });
    await this.store.emit(id, { type: "error", state: "failed", note: noteFor(updated) });
    if (updated.sessionId !== null) await sessionEnd(updated.sessionId, "failed", error);
  }

  /** Partial artifacts, kept where a person can look at them. */
  private async moveToRejected(record: JobRecord): Promise<void> {
    const directory = rejectedDir(record.id);
    await mkdir(directory, { recursive: true });
    for (const relative of [record.candidatePath, record.candidateSvgPath]) {
      const from = absolute(relative);
      if ((await stat(from).catch(() => null)) === null) continue;
      await rename(from, path.join(directory, path.basename(relative)));
    }
  }

  /** Stop starting new work. Used by the process's own shutdown path. */
  async drain(): Promise<void> {
    this.draining = true;
    for (const entry of this.running.values()) {
      entry.cancelled = true;
      await entry.agent?.stop("cancelled");
    }
  }

  get busy(): number {
    return this.running.size;
  }
}

async function sha256(file: string): Promise<string | null> {
  try {
    return createHash("sha256").update(await readFile(file)).digest("hex");
  } catch {
    return null;
  }
}

/** The two files a job is entitled to leave dirty once it has been accepted. */
function isOutput(file: string, record: JobRecord): boolean {
  return file === record.targetPath || file === record.targetSvgPath;
}

/**
 * The moment the gate measures the candidate's age against.
 *
 * Normally the job's own start: a candidate older than that is a file left
 * behind by something else, and calling it this job's output would attribute a
 * drawing to a session that never made it.
 *
 * **A resumed job is the exception, and phase 3 found out the hard way.** The
 * work a resume continues is already on disk — that is what makes it a resume
 * rather than a re-run — so an agent that picks up a finished drawing, checks
 * it and stops has done exactly the right thing and wrote nothing. Measured
 * against its own start, every such job failed step 1 three times and then
 * failed the job, which made Resume a button that could only ever produce a
 * failure. Measured against the parent's start, the candidate is this work's
 * output, which it is, and every other gate step still checks the artifact.
 *
 * Only a resume (no change request). A revision's parent was accepted,
 * discarded or failed, so nothing of its candidate is left at that path, and
 * the stricter reading is the right one there.
 */
function gateFreshnessFrom(record: JobRecord, store: JobStore, resumedWork: boolean): number {
  const own = Date.parse(record.startedAt ?? record.requestedAt);
  // Only when the candidate on disk really is the parent's preserved work. A
  // file at that path that hashes differently belongs to some other job, and
  // leniency about *its* age would let this job present it for review.
  if (!resumedWork || record.parentJobId === null) return own;
  const parent = store.get(record.parentJobId);
  if (parent === undefined) return own;
  const parentStart = Date.parse(parent.startedAt ?? parent.requestedAt);
  return Number.isFinite(parentStart) ? Math.min(own, parentStart) : own;
}

/**
 * What the gate is about to do, read off the step it has just finished.
 *
 * The gate's own order is candidate, inspect, brief, topic, export, verify, so
 * a finished `topic` means the export is next and a finished `export` means the
 * verify is. Only the two, because the phases before them are already set: the
 * runner writes `linting` before the gate starts and `ready` when it passes.
 */
const GATE_PHASE_AFTER: Record<string, string | undefined> = {
  topic: "exporting",
  export: "verifying",
};

const PHASE_NOTES: Record<string, string> = {
  reading: "reading the brief",
  planning: "planning the layout",
  drawing: "drawing on the canvas",
  linting: "checking the drawing",
  exporting: "exporting the SVG",
  verifying: "verifying the export",
  ready: "ready for review",
};

/**
 * Which phase a line of the agent's stream implies.
 *
 * Matched on the command the agent ran, not on its prose. Returns null for
 * everything else, and null means "leave the phase alone".
 */
export function phaseFromLine(line: string): string | null {
  if (!line.includes("tool_use") || !line.includes("canvas")) return null;
  if (line.includes("canvas -- verify") || line.includes("verify ")) return "verifying";
  if (line.includes("canvas -- export") || line.includes("--svg")) return "exporting";
  if (line.includes("canvas -- inspect")) return "linting";
  if (line.includes("canvas -- run") || line.includes("canvas -- from-mermaid")) return "drawing";
  if (line.includes("canvas -- new") || line.includes("canvas -- api")) return "planning";
  return null;
}

/** The plain-English line every response carries. manimkc's `_enrich_status`. */
export function noteFor(record: JobRecord): string {
  switch (record.state) {
    case "queued":
      return "queued: no runner has picked it up yet";
    case "running":
      return record.cancelRequestedAt !== null
        ? "stopping: the runner is closing the browser, and the job is running until it has"
        : `${PHASE_NOTES[record.phase ?? "drawing"] ?? "working"}, attempt ${record.attempt}`;
    case "awaiting_review":
      return (
        `the candidate is written and checked, and nothing under learn/assets/ has changed. ` +
        (record.gate?.exportFailed === true
          ? "The document saved and the export did not, which accept will redo."
          : `${record.gate?.shapes ?? "?"} shapes, ${record.gate?.lints ?? 0} lints.`)
      );
    case "accepted":
      return `accepted: ${record.written.join(" and ")} are in learn/assets/, uncommitted. Committing is yours.`;
    case "discarded":
      return "discarded: the candidate is deleted and nothing under learn/assets/ ever changed";
    case "failed":
      return `failed: ${record.error ?? "no reason recorded"}`;
    case "cancelled":
      return `cancelled: ${record.error ?? "stopped on request"}`;
    case "interrupted":
      return "interrupted: the runner died while this was running, and no gate ran on what is on disk";
    default:
      return record.state;
  }
}
