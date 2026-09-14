import { randomUUID } from "node:crypto";
import { copyFile, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { JobState } from "@self-learn/schema";

import { type ValidBrief } from "./brief";
import { AgentRun, startAgent, sweepOrphans } from "./agent";
import { CONCURRENCY, JOB_TIMEOUT_MS, MAX_ATTEMPTS, RUNNER_NAME } from "./config";
import { jobClaim, jobEnqueue, jobFinish, sessionEnd, sessionStart } from "./catalog";
import { narrate, runGate } from "./gate";
import {
  absolute,
  candidatePath,
  candidateSvgPath,
  jobDir,
  mermaidPath,
  rejectedDir,
  scratchDir,
  targetPath,
  targetSvgPath,
  CANDIDATES_DIR,
} from "./paths";
import { buildPrompt, buildRetryPrompt } from "./prompt";
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
  jobTimer: NodeJS.Timeout;
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
      await this.store.update(record.id, {
        state: "interrupted",
        phase: null,
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
      });
      if (!finished.ok) await this.store.noteCatalogError(record.id, finished.error ?? "");
      if (record.sessionId !== null) await sessionEnd(record.sessionId, "interrupted");
    }
    return { interrupted, swept };
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
  async enqueue(brief: ValidBrief): Promise<{ record: JobRecord; created: boolean; jobsAhead: number }> {
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
      agentSessionId: null,
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
    if (!enqueued.ok) {
      // The catalog refused, and its reasons are the durable ones: a topic that
      // is not in the vocabulary, a lease another process holds. The disk
      // record is removed rather than left as a job nothing will ever claim.
      await rm(jobDir(id), { recursive: true, force: true });
      throw new JobRefused(
        enqueued.error?.includes("already held") === true ? 409 : 503,
        enqueued.error ?? "the catalog would not take this job",
      );
    }

    void this.kick();
    return { record, created: true, jobsAhead: Math.max(0, this.queued().length - 1) };
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
        jobTimer: setTimeout(() => {
          void this.cancel(next.id, "job-timeout");
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
    const agentSessionId = randomUUID();

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
    if (!claimed.ok) await this.store.noteCatalogError(id, claimed.error ?? "");

    const dirtyBefore = new Set(await dirtyFiles());

    await mkdir(absolute(CANDIDATES_DIR), { recursive: true });
    await mkdir(scratchDir(id), { recursive: true });

    // Extend reads a copy, never the committed file. Lifting an existing
    // document is how every diagram ends up looking like the first one, which
    // is the reason manimkc's clean-room rule exists and the reason this one
    // does; the copy is what lets the rule hold while extending still works.
    if (record.brief.mode === "extend") {
      await copyFile(absolute(record.targetPath), absolute(record.candidatePath));
    }
    const hasMermaid = record.brief.mermaid !== undefined;
    if (hasMermaid) {
      await writeFile(mermaidPath(id), record.brief.mermaid ?? "", "utf8");
    }

    let gate: GateResult | null = null;
    let findings: string[] = [];
    let outcome: Awaited<AgentRun["done"]> | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      if (entry.cancelled) break;
      record = await this.store.update(id, {
        attempt,
        phase: "drawing",
        heartbeatAt: new Date().toISOString(),
      });
      await this.store.emit(id, {
        type: "phase",
        phase: "drawing",
        note: attempt === 1 ? "the agent is drawing" : `attempt ${attempt}: fixing what the check found`,
        state: "running",
      });

      const agent = await startAgent({
        jobId: id,
        slug: record.slug,
        ...(record.brief.source === undefined ? {} : { source: record.brief.source }),
        prompt:
          attempt === 1
            ? buildPrompt({ jobId: id, brief: record.brief, hasMermaid })
            : buildRetryPrompt(findings, record.slug),
        model: record.brief.model,
        sessionId: agentSessionId,
        resume: attempt > 1,
        onLine: (line) => {
          void this.onAgentLine(id, line);
        },
      });
      entry.agent = agent;
      outcome = await agent.done;
      entry.agent = null;

      if (entry.cancelled || outcome.stopReason === "cancelled") break;
      if (outcome.stopReason === "attempt-timeout" || outcome.stopReason === "idle-timeout") {
        await this.finish(entry, "failed", {
          errorKind: "timeout",
          error:
            outcome.stopReason === "idle-timeout"
              ? "the agent stopped saying anything for five minutes, which is what a browser that never answered looks like"
              : "the attempt ran past fifteen minutes",
          exitCode: outcome.exitCode,
          turns: outcome.turns,
          costUsd: outcome.costUsd,
        });
        return;
      }

      await this.store.update(id, { phase: "linting", heartbeatAt: new Date().toISOString() });
      gate = await runGate({
        slug: record.slug,
        topic: record.topic,
        candidatePath: record.candidatePath,
        candidateSvgPath: record.candidateSvgPath,
        startedAtMs: Date.parse(record.startedAt ?? record.requestedAt),
        onStep: (step) => {
          void this.store.emit(id, { type: "step", note: narrate(step), state: "running" });
        },
      });
      await this.store.update(id, { gate });
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
        costUsd: outcome?.costUsd ?? null,
        gate,
      });
      return;
    }

    if (gate !== null && gate.ok) {
      await this.finish(entry, "awaiting_review", {
        gate,
        exitCode: outcome?.exitCode ?? null,
        turns: outcome?.turns ?? null,
        costUsd: outcome?.costUsd ?? null,
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
      costUsd: outcome?.costUsd ?? null,
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
    await this.store.appendRaw(id, line);
    const phase = phaseFromLine(line);
    if (phase === null) return;
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

  private async finish(
    entry: Running,
    state: JobState,
    patch: {
      gate?: GateResult | null;
      errorKind?: string;
      error?: string;
      exitCode?: number | null;
      turns?: number | null;
      costUsd?: number | null;
    },
  ): Promise<void> {
    const id = entry.record.id;
    const record = await this.store.update(id, {
      state,
      phase: state === "awaiting_review" ? "ready" : null,
      finishedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
      gate: patch.gate ?? this.store.get(id)?.gate ?? null,
      exitCode: patch.exitCode ?? null,
      turns: patch.turns ?? null,
      costUsd: patch.costUsd ?? null,
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
      await entry.agent?.stop("cancelled");
    }
    return updated;
  }

  /** Called once the agent has actually exited. Sweeps, then writes `cancelled`. */
  private async acknowledgeCancel(
    entry: Running,
    outcome: Awaited<AgentRun["done"]> | null,
  ): Promise<void> {
    const swept = await sweepOrphans(entry.record.id);
    await this.finish(entry, "cancelled", {
      errorKind: "cancelled",
      error:
        swept.length === 0
          ? "stopped on request; the process group kill was enough"
          : `stopped on request; ${swept.length} process${swept.length === 1 ? "" : "es"} survived the group kill and were swept`,
      exitCode: outcome?.exitCode ?? null,
      turns: outcome?.turns ?? null,
      costUsd: outcome?.costUsd ?? null,
    });
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
