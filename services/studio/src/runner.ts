import { randomUUID } from "node:crypto";
import { copyFile, mkdir, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { JobState } from "@self-learn/schema";

import { type ValidBrief } from "./brief";
import { AgentRun, startAgent, sweepOrphans, type AgentInit } from "./agent";
import { buildComparison, readSide, sideFromGate, type Side } from "./compare";
import {
  agentAuth,
  CONCURRENCY,
  dailyCapUsd,
  DAILY_WINDOW_MS,
  JOB_TIMEOUT_MS,
  MAX_ATTEMPTS,
  RUNNER_NAME,
  type AgentAuth,
} from "./config";
import { costFromLog, JobCostMeter, spendWindow, type CostReading, type SpendEntry } from "./cost";
import { diagramShow, jobClaim, jobEnqueue, jobFinish, sessionEnd, sessionStart } from "./catalog";
import { checkoutRevision, documentHashOf, ensureCheckout } from "./diagrams";
import { narrate, runGate } from "./gate";
import {
  absolute,
  candidateDir,
  candidatePath,
  candidateRef,
  sessionLogPath,
  candidateSvgPath,
  isLegacyCandidate,
  jobDir,
  mermaidPath,
  rejectedDir,
  scratchDir,
  shotPath,
  targetPath,
  targetSvgPath,
  workDir,
  workPath,
  workSvgPath,
} from "./paths";
import {
  buildPrompt,
  buildResumePrompt,
  buildRetryPrompt,
  buildRevisePrompt,
  type CandidateFiles,
} from "./prompt";
import type { ManualSource } from "./manual/source";
import { dirtyFiles } from "./review";
import { resolveSource } from "./source-note";
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
  /**
   * One promise per job this runner has started, resolved once it is finished
   * with it. See `settled`.
   *
   * One resolved promise per job, kept for the life of the process, which is
   * the growth the store already has: every record it has loaded or created
   * stays in memory so the API can answer about it.
   */
  private readonly settledJobs = new Map<string, Promise<void>>();
  /** Enqueues between their idempotency check and their record, by key. See `enqueue`. */
  private readonly enqueuing = new Map<string, Promise<{ record: JobRecord; created: boolean; jobsAhead: number }>>();
  private draining = false;
  /**
   * Whether a canvas is open on a diagram, by its logical name. Set by
   * `index.ts` once the mirrors exist, so a job never refreshes a checkout a
   * canvas could be saving into (see `ensureCheckout`).
   */
  canvasOpen: (target: string) => boolean = () => false;
  /**
   * Spend that is not a job: the planner's turns, one entry per turn dated at
   * its own end (D36 of docs/STUDIO-CHAT-FIRST.md). Set by `index.ts` once the
   * drafts exist, so the cap counts a chat as it counts a drawing.
   */
  extraSpend: () => readonly SpendEntry[] = () => [];
  /**
   * The tldraw manual the drawing agent's system prompt carries (D30 of
   * docs/STUDIO-CHAT-FIRST.md). Set by `index.ts`, which refreshes it at
   * start; `enqueue` refreshes it again, so a job queued after a rebuild of
   * tldrawkc gets a manual for that build. Null means no manual: every job
   * runs as it did before the manual existed, which is what a test that never
   * sets it gets.
   */
  manual: ManualSource | null = null;

  constructor(store: JobStore) {
    this.store = store;
  }

  /**
   * Resolves once the runner has written everything it is going to write
   * about `id`.
   *
   * A terminal state is not that moment, and the difference is a real window
   * rather than a theoretical one. `finish` puts the new state in the store's
   * in-memory map first and only then persists `job.json`, calls `job finish`
   * on the catalog, records any catalog error back onto the record and closes
   * the session. Anybody reading the state to decide the job is over is
   * reading the first of those five and acting as though all five had
   * happened.
   *
   * Resolves immediately for a job this runner never started. One still in
   * the queue has had nothing written about it since it was created, and one
   * a dead process ran is not this runner's to wait for.
   */
  settled(id: string): Promise<void> {
    return this.settledJobs.get(id) ?? Promise.resolve();
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
      // What is at the candidate path right now, so a later Resume adopts
      // exactly this job's half-finished work. The path is in this job's own
      // workspace, so no other job writes it; a record from before candidates
      // moved there names the shared per-slug path, where an interrupted job
      // holds no lease and a later job can write the same file before anyone
      // presses Resume. The hash is what tells the two apart in either case.
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
   * What a job on `slug` starts from: whether the diagram exists, its latest
   * revision (Accept's base) and its document hash (the before side's label).
   *
   * Asked of the catalog. When it cannot answer, the checkout on disk says
   * whether there is a diagram and its hash labels it, and the revision is
   * left unknown. An extend job fills it in from the checkout's record when
   * it copies the file; failing that, Accept checks this hash against the
   * stored document instead, so no job lands without a base (D16).
   */
  async startingPoint(
    slug: string,
  ): Promise<{ exists: boolean; revision: number | null | undefined; hash: string | null }> {
    const shown = await diagramShow(slug, workDir());
    const answer = shown.ok ? (shown.json as { diagram?: { revision: number | null; documentHash: string } | null } | null) : null;
    // Only an answer that names the diagram, or says there is none, counts.
    if (answer !== null && answer.diagram !== undefined) {
      return answer.diagram === null
        ? { exists: false, revision: null, hash: null }
        : { exists: true, revision: answer.diagram.revision, hash: answer.diagram.documentHash };
    }
    // The catalog's own definition of a document's hash (canonical JSON), not
    // the file's bytes, so Accept can compare it with `document_hash`.
    const hash = await documentHashOf(workPath(slug));
    return { exists: hash !== null, revision: undefined, hash };
  }

  /**
   * Every refusal `enqueue` makes about a brief before it writes anything: the
   * lease another job holds on the target, the mode against what the catalog
   * (or, with it down, the checkout) says exists, and the daily cap. Returns
   * what the job starts from.
   *
   * Public so a caller about to do something that cannot be undone first (the
   * Draw press creating a proposed topic) can ask the same questions first.
   * `enqueue` asks them again, and the catalog's own lease can still refuse a
   * job that passed here, if another process takes the target in between:
   * that is a race these checks narrow and do not close.
   */
  async admit(
    brief: Pick<ValidBrief, "slug" | "mode">,
  ): Promise<{ exists: boolean; revision: number | null | undefined; hash: string | null }> {
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

    // The diagram is its rows now, so whether it exists is the catalog's
    // answer, with the revision the job starts from: Accept's base. With the
    // database down (D16) the last checkout on disk is what there is.
    const base = await this.startingPoint(brief.slug);
    const targetExists = base.exists;
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
    this.assertUnderCap();
    return base;
  }

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
    options: { draftId?: string | null } = {},
  ): Promise<{ record: JobRecord; created: boolean; jobsAhead: number }> {
    // A second submit of a key whose first is still between its checks and
    // `store.create` waits for that one and returns its job. The store lookup
    // below cannot see a job that is not created yet, and every await on the
    // way there (the manual refresh, the catalog's answer about the target) is
    // a window a double click lands in.
    const pending = this.enqueuing.get(brief.idempotencyKey);
    if (pending !== undefined) {
      const first = await pending;
      return { record: first.record, created: false, jobsAhead: this.queued().length };
    }
    const attempt = this.enqueueOnce(brief, parent, options);
    this.enqueuing.set(brief.idempotencyKey, attempt);
    try {
      return await attempt;
    } finally {
      this.enqueuing.delete(brief.idempotencyKey);
    }
  }

  private async enqueueOnce(
    brief: ValidBrief,
    parent: ParentJob | undefined,
    options: { draftId?: string | null },
  ): Promise<{ record: JobRecord; created: boolean; jobsAhead: number }> {
    // First, so the job this creates starts on a manual for the build
    // installed now. One short `canvas api --json` when nothing changed; a
    // failure keeps the manual there was and never refuses the job, since
    // `doctor` is the gate on a broken tool. Before the idempotency check
    // rather than after it, so its half second does not sit between that
    // check and `store.create`, where a double submit could slip past both.
    await this.manual?.refresh().catch(() => null);

    const existing = this.store.byIdempotencyKey(brief.idempotencyKey);
    if (existing !== undefined) {
      return { record: existing, created: false, jobsAhead: this.queued().length };
    }

    const target = targetPath(brief.slug);
    const base = await this.admit(brief);

    const id = randomUUID();
    const record: JobRecord = {
      id,
      kind: "diagram",
      state: "queued",
      phase: null,
      brief,
      targetPath: target,
      targetSvgPath: targetSvgPath(brief.slug),
      // In the job's own workspace (`paths.ts` says why), absolute because
      // every canvas verb, the gate and the permission file take it as is.
      candidatePath: candidatePath(id, brief.slug),
      candidateSvgPath: candidateSvgPath(id, brief.slug),
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
      draftId: options.draftId ?? null,
      changes: parent?.changes ?? null,
      idempotencyKey: brief.idempotencyKey,
      targetHashBefore: base.hash,
      ...(base.revision === undefined ? {} : { targetRevisionBefore: base.revision }),
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
          // Relative to STUDIO_HOME, the form the catalog derives and checks.
          candidate: candidateRef(id, brief.slug),
          idempotencyKey: brief.idempotencyKey,
          ...(options.draftId === undefined || options.draftId === null ? {} : { draft: options.draftId }),
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
    // Whole records: `SpendEntry` is structural, so `startedAt`, `finishedAt`
    // and `costUsd` are read off them directly and nothing has to be kept in
    // step with a second shape.
    return spendWindow([...this.store.list(), ...this.extraSpend()], DAILY_WINDOW_MS, now);
  }

  /** What the cap is, and where it stands. For `/api/health` and the UI. */
  capStatus(now: number = Date.now()): {
    capUsd: number | null;
    exceeded: boolean;
    /** The planner's share of `totalUsd`, and how many turns it was. */
    plannerUsd: number;
    plannerTurns: number;
  } & ReturnType<typeof spendWindow> {
    const window = this.spend(now);
    const planner = spendWindow(this.extraSpend(), DAILY_WINDOW_MS, now);
    const cap = dailyCapUsd();
    return {
      capUsd: cap,
      ...window,
      plannerUsd: planner.totalUsd,
      plannerTurns: planner.jobs,
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
  assertUnderCap(now: number = Date.now()): void {
    const cap = dailyCapUsd();
    if (cap === null) return;
    const window = this.spend(now);
    if (window.totalUsd < cap) return;
    const dollars = (value: number): string => `$${value.toFixed(2)}`;
    throw new JobRefused(
      429,
      `the studio has spent ${dollars(window.totalUsd)} in the last 24 hours, which is at or over ` +
        `the ${dollars(cap)} STUDIO_DAILY_USD cap. Nothing was queued. The oldest job counted ` +
        `here is dated ${window.oldestCountedAt ?? "(unknown)"} and leaves the window at ` +
        `${window.oldestAgesOutAt ?? "(unknown)"}, which is the earliest this total can fall. ` +
        `Raise STUDIO_DAILY_USD, or wait.`,
      {
        reason: "daily-cap",
        totalUsd: window.totalUsd,
        capUsd: cap,
        jobs: window.jobs,
        windowHours: DAILY_WINDOW_MS / 3_600_000,
        oldestCountedAt: window.oldestCountedAt,
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
      // A promise of its own rather than the attempt's, so that `settled`
      // never hands out a verdict. Deriving one from the chain below would
      // also attach a rejection handler to it, which would silence a throw
      // inside the recovery handler that today is loud.
      let jobSettled: () => void = () => undefined;
      this.settledJobs.set(next.id, new Promise<void>((resolve) => {
        jobSettled = resolve;
      }));
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
        jobSettled();
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
      // A job queued before candidates moved into the job workspace still
      // names `learn/assets/.candidates/<slug>`. Nothing has been drawn for a
      // queued job, so it simply draws in its own workspace like any other,
      // and the permission file, the prompt and the gate all agree on where.
      ...(isLegacyCandidate(entry.record.candidatePath)
        ? {
            candidatePath: candidatePath(id, entry.record.slug),
            candidateSvgPath: candidateSvgPath(id, entry.record.slug),
          }
        : {}),
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

    await mkdir(candidateDir(id), { recursive: true });
    await mkdir(scratchDir(id), { recursive: true });

    /* The before half of the comparison, and the only moment it can be read.
     *
     * After an accept the diagram's row is the new drawing, and the picture of
     * what was there is a revision nobody will photograph. So the screenshot
     * and the counts are taken now, against the checkout as it is at this
     * instant, and stored on the record.
     *
     * A job in `new` mode has no before at all, and the panel says so rather
     * than showing an empty tile — there is nothing to compare a first drawing
     * against, and an empty box beside a real one reads as a failure. */
    // The file this job extends and photographs: the checkout, brought up to
    // the latest revision unless it holds edits nobody committed.
    if (record.brief.mode === "extend") {
      const checkout = await ensureCheckout(record.slug, { canvasOpen: this.canvasOpen(record.targetPath) });
      // Anything but an outage or uncommitted edits leaves a file that may be
      // an older revision than the diagram, and extending it would land that
      // older drawing over the newer one.
      if (checkout.failed) throw new Error(checkout.note);
      await this.store.emit(id, { type: "step", state: "running", note: checkout.note });
    }
    const before = await this.readBefore(record);
    await this.store.update(id, { comparison: buildComparison(before, null, { beforeHash: record.targetHashBefore }) });

    // Extend reads a copy, never the committed file. Lifting an existing
    // document is how every diagram ends up looking like the first one, which
    // is the reason manimkc's clean-room rule exists and the reason this one
    // does; the copy is what lets the rule hold while extending still works.
    //
    // **Except when the candidate is the work being resumed.** A resume of an
    // interrupted job re-derives `extend` from the target existing, and copying
    // the committed file over the candidate would then replace the partial
    // drawing the reconcile pass deliberately left on disk: a resume that
    // begins by destroying what it is resuming. Caught in review on the PR
    // that added resume.
    //
    // The parent drew in its own workspace, so its work is first copied into
    // this job's (`adoptParentWork`), and only a copy that is byte for byte
    // what the reconcile pass hashed counts as the work being resumed.
    const resumedWork = await this.adoptParentWork(record);
    let unchangedHash: string | null = null;
    if (record.brief.mode === "extend") {
      if (!resumedWork) {
        // The base Accept checks is the revision this copy was written from,
        // which the checkout's record says with no database needed. It can be
        // older than the latest at enqueue (a checkout kept for its
        // uncommitted edits), or the only revision there is (a job enqueued
        // with the database down), and either way it is what the agent is
        // extending, so a newer revision makes Accept refuse.
        //
        // Read before the copy, not after: a checkout writes the document and
        // then the record, so a record read first is never newer than the
        // document copied next. A refresh landing in between leaves a base
        // older than the copy, which Accept refuses; the other order could
        // pair an old drawing with a new base, which Accept would land.
        const copiedFrom = await checkoutRevision(record.slug);
        await copyFile(workPath(record.slug), absolute(record.candidatePath));
        if (copiedFrom !== undefined && copiedFrom !== record.targetRevisionBefore) {
          await this.store.update(id, { targetRevisionBefore: copiedFrom });
        }
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
    const files: CandidateFiles = { tldr: record.candidatePath, svg: record.candidateSvgPath, scratch: scratchDir(id) };
    const hasMermaid = record.brief.mermaid !== undefined;
    if (hasMermaid) {
      await writeFile(mermaidPath(id), record.brief.mermaid ?? "", "utf8");
    }

    let gate: GateResult | null = null;
    let findings: string[] = [];
    let outcome: Awaited<AgentRun["done"]> | null = null;
    /** Set when an attempt's first request was refused. See the loop. */
    let refused: Awaited<AgentRun["done"]> | null = null;
    /** True once this session id has a transcript, so the next call resumes it. */
    let startedSession = false;
    // Read once for the whole job and written down before the first spawn, so
    // every attempt runs under the same rule and the record says which one it
    // was even if the setting is changed while this job is running.
    const auth = agentAuth();
    // The manual, decided here once for every attempt (M1). A job that
    // continues its parent's session inherits the parent's: the CLI replays
    // the system prompt it recorded on that session's first request, so the
    // parent's manual is the one this agent actually reads.
    let manualHash = this.manualFor(record, inherited !== null);
    record = await this.store.update(id, { agentAuth: auth, manualHash });
    await this.store.emit(id, {
      type: "step",
      state: "running",
      note:
        manualHash === null
          ? "the agent runs without the tldraw manual: none could be built from canvas api"
          : `the agent's system prompt carries the tldraw manual ${manualHash.slice(0, 12)}`,
    });

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
      // The job's own manual, checked against its hash before every spawn and
      // put back if it was lost or changed. A session that starts fresh and
      // cannot have it runs without one and records that, because the record
      // must name what the agent was given; a resumed one replays its recorded
      // prompt whatever is passed, so nothing about it changes.
      const resuming = resumeFromParent || started;
      let manualFile = manualHash === null ? null : ((await this.manual?.ensureFile(manualHash)) ?? null);
      if (manualHash !== null && manualFile === null && !resuming) {
        manualHash = null;
        record = await this.store.update(id, { manualHash: null });
        await this.store.emit(id, {
          type: "step",
          state: "running",
          note: "the agent starts without the tldraw manual: its file could not be made to match its hash",
        });
      }
      if (manualHash === null) manualFile = null;
      // A note named as the source is a row since the cut-over, written into
      // scratch for the agent to read (source-note.ts); a file stays a file.
      const source =
        record.brief.source === undefined ? undefined : (await resolveSource(id, record.brief.source)).path;
      const prompt =
        findings.length > 0
          ? buildRetryPrompt(findings, files)
          : resumeFromParent
            ? record.changes !== null
              ? buildRevisePrompt(record.changes, files)
              : // A parent with no change request is a resume: the job this one
                // continues was interrupted rather than reviewed, so there is
                // nothing different to ask for and the whole brief is already
                // in the transcript being resumed.
                buildResumePrompt(files)
            : buildPrompt({
                jobId: id,
                brief: source === undefined ? record.brief : { ...record.brief, source },
                hasMermaid,
                // A fresh prompt goes to a fresh session, which is handed the
                // file below whenever there is a hash.
                manual: manualHash !== null,
              });
      startedSession = true;

      // What is at the candidate path before this attempt touches it, so that
      // "the agent wrote nothing" is a comparison rather than a guess. Null for
      // a `new` job's first attempt; the runner's own copy in `extend` mode; a
      // resumed job's preserved drawing; an earlier attempt's partial.
      const candidateBefore = await sha256(absolute(record.candidatePath));

      // The credential step, held so the attempt waits for it: without that, a
      // session that fails in under a second can put its terminal event in
      // the log ahead of the line saying which key it used, and a write that
      // failed would be an unhandled rejection. Caught in review on this PR.
      let credentialNoted: Promise<void> = Promise.resolve();
      const agent = await startAgent({
        jobId: id,
        slug: record.slug,
        ...(source === undefined ? {} : { source }),
        prompt,
        model: record.brief.model,
        sessionId: agentSessionId,
        resume: resuming,
        auth,
        manualPath: manualFile,
        onLine: (line) => {
          void this.onAgentLine(id, line);
        },
        onInit: (init) => {
          credentialNoted = this.onAgentInit(id, auth, init).catch(() => undefined);
        },
      });
      entry.agent = agent;
      outcome = await agent.done;
      entry.agent = null;
      await credentialNoted;
      if (outcome.apiKeySource !== null) {
        record = await this.store.update(id, { apiKeySource: outcome.apiKeySource });
      }

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
        // A fresh session records its own system prompt, so it takes the
        // newest manual rather than the parent's, and the record says so.
        manualHash = this.manual?.current()?.hash ?? null;
        record = await this.store.update(id, { agentSessionId, manualHash });
        findings = [];
        await this.store.emit(id, {
          type: "phase",
          note: "the stored session could not be resumed, so this attempt starts a fresh one",
          state: "running",
        });
        continue;
      }

      if (
        outcome.isError &&
        outcome.stopReason === null &&
        (outcome.turns ?? 0) <= 1 &&
        (await sha256(absolute(record.candidatePath))) === candidateBefore
      ) {
        // The agent ran, its session ended in an error inside its first turn,
        // and the candidate is byte-for-byte what it was before: the request
        // itself failed. A credential the API refuses, a model this account
        // cannot use, an exhausted quota. The gate has nothing of this
        // attempt's to judge, and a retry sends the same request with the same
        // credential and gets the same answer, so the job ends here with the
        // agent's own words.
        //
        // Before this check the gate ran anyway, reported the candidate
        // missing, and the runner spent two more attempts on the identical 400
        // before calling it a gate failure: a panel that said "nothing was
        // written" about a key the API had refused three times.
        //
        // An agent that erred *after* doing something is not this case: more
        // than one turn, or a candidate that changed, still goes to the gate,
        // because rule 4 says the gate decides what is on disk.
        //
        // It leaves the loop rather than finishing here, so the stray-write
        // backstop below still runs first: an unchanged candidate says nothing
        // about the rest of the tree, and a dirty file outranks a refused key
        // as the thing a person has to look at. Caught in review on this PR.
        refused = outcome;
        break;
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
     * to have written anything in the tree: its candidate is in its workspace. */
    const dirtyAfter = await dirtyFiles();
    const stray = dirtyAfter.filter((file) => !dirtyBefore.has(file));
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

    if (refused !== null) {
      // Whatever sits at the candidate path moves where a person can look at
      // it, as on the gate's exhaustion path below: an earlier attempt's
      // partial, the runner's own copy in `extend` mode, or a resumed job's
      // preserved drawing, so a failed job's workspace says plainly that it
      // holds no candidate for review.
      await this.moveToRejected(record);
      await this.finish(entry, "failed", {
        errorKind: "agent",
        error:
          refused.result ??
          `the agent's session ended in an error before it did anything (${refused.subtype ?? "no result"})`,
        exitCode: refused.exitCode,
        turns: refused.turns,
        cost: entry.meter.read(),
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
   * Which manual a job runs with: its parent's when it continues the parent's
   * session, else the newest the runner holds. See `JobRecord.manualHash`.
   */
  private manualFor(record: JobRecord, continuesParent: boolean): string | null {
    if (continuesParent && record.parentJobId !== null) {
      const parent = this.store.get(record.parentJobId);
      if (parent !== undefined) return parent.manualHash ?? null;
    }
    return this.manual?.current()?.hash ?? null;
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
   * The session's `system/init` event: record nothing, say which credential.
   *
   * The init line is already in the raw log, verbatim, but it is a single line
   * of several kilobytes and `apiKeySource` is one field somewhere in the
   * middle. A step of its own is what makes "which key did the agent use?"
   * readable in the panel without a JSON parser.
   */
  private async onAgentInit(id: string, auth: AgentAuth, init: AgentInit): Promise<void> {
    await this.store.emit(id, {
      type: "step",
      note: credentialNote(auth, init.apiKeySource),
      state: "running",
    });
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
    if ((await stat(workPath(record.slug)).catch(() => null)) === null) return null;
    const side = await readSide({
      file: workPath(record.slug),
      svgFile: workSvgPath(record.slug),
      shotPath: shotPath(record.id, "before"),
    });
    await this.store.emit(record.id, {
      type: "step",
      state: "running",
      note:
        side.shapes === null
          ? `the checkout of ${record.targetPath} would not inspect, so there is no before to compare against`
          : `read the diagram as it is in the database: ${side.shapes} shapes, ${side.lints.length} lint${side.lints.length === 1 ? "" : "s"}`,
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
   * Bring the parent's drawing into this job's workspace, and say whether it is
   * the work this job is resuming.
   *
   * Every job draws in its own workspace, so a revision or a resume starts
   * with an empty candidate unless its parent's is copied across. Two cases:
   *
   * - **A resume** (a parent, no change request) adopts the parent's candidate
   *   only when its bytes still match the hash the reconcile pass took when it
   *   wrote `interrupted`. In its own workspace nobody else writes that file,
   *   but a record from before candidates moved names the shared per-slug path
   *   under `learn/assets/.candidates/`, which a later job for the same slug
   *   could have written; adopting that would offer another job's artifact for
   *   review under this one's name. True means the gate treats it as resumed.
   * - **A revision of a `new` drawing** takes whatever the parent left, which
   *   is what "the same file" meant when the path was per slug: a revise after
   *   a timeout or a cancel continues the partial drawing. It is not resumed
   *   work, so the gate still wants this job to have drawn something. A
   *   revision in `extend` mode is handed the committed diagram instead, below.
   *
   * The copy keeps the parent's modification time, so the gate's freshness
   * check reads the drawing's age and not the moment of the copy.
   */
  private async adoptParentWork(record: JobRecord): Promise<boolean> {
    if (record.parentJobId === null) return false;
    const parent = this.store.get(record.parentJobId);
    if (parent === undefined) return false;
    const resume = record.changes === null;
    if (!resume && record.brief.mode !== "new") return false;
    const from = absolute(parent.candidatePath);
    if (resume) {
      const expected = parent.candidateHash ?? null;
      if (expected === null || (await sha256(from)) !== expected) return false;
    } else if ((await stat(from).catch(() => null)) === null) {
      return false;
    }
    await copyKeepingTime(from, absolute(record.candidatePath));
    const svg = absolute(parent.candidateSvgPath);
    if ((await stat(svg).catch(() => null)) !== null) {
      await copyKeepingTime(svg, absolute(record.candidateSvgPath));
    }
    return resume;
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
      // The form the catalog records: relative to STUDIO_HOME, never this
      // machine's absolute path. A record still on the old per-slug path sends
      // nothing, and the row keeps what it had.
      ...(isLegacyCandidate(record.candidatePath) ? {} : { candidatePath: candidateRef(id, record.slug) }),
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

/** `copyFile`, then the source's times onto the copy. See `adoptParentWork`. */
async function copyKeepingTime(from: string, to: string): Promise<void> {
  await mkdir(path.dirname(to), { recursive: true });
  await copyFile(from, to);
  const facts = await stat(from);
  await utimes(to, facts.atime, facts.mtime);
}

async function sha256(file: string): Promise<string | null> {
  try {
    return createHash("sha256").update(await readFile(file)).digest("hex");
  } catch {
    return null;
  }
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

/**
 * One sentence on which credential the agent is using, from the CLI's own
 * `apiKeySource` and the rule the runner spawned it under.
 *
 * The CLI's value is quoted rather than translated wherever this file cannot be
 * sure what it means, so a source added in a later CLI still reads truthfully.
 */
export function credentialNote(auth: AgentAuth, source: string | null): string {
  const setting = `STUDIO_AGENT_AUTH=${auth}`;
  switch (source) {
    case null:
      return `the agent did not say which credential it is using (${setting})`;
    case "ANTHROPIC_API_KEY":
      return `the agent is using ANTHROPIC_API_KEY from the runner's environment (${setting})`;
    case "none":
    case "oauth":
    case "/login managed key":
      return `the agent is using this machine's claude login (apiKeySource ${source}, ${setting})`;
    default:
      return `the agent's credential came from ${source} (${setting})`;
  }
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
        `the candidate is written and checked in the job's workspace, and nothing has landed. ` +
        (record.gate?.exportFailed === true
          ? "The document saved and the export did not, which accept will redo."
          : `${record.gate?.shapes ?? "?"} shapes, ${record.gate?.lints ?? 0} lints.`)
      );
    case "accepted":
      return `accepted: ${record.written.join(" and ")} landed in the database.`;
    case "discarded":
      return "discarded: the candidate is deleted and nothing ever landed";
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
