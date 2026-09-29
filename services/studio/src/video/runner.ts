import { createHash, randomUUID } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { agentEnv, spawnClaude, type AgentOutcome, type AgentRun } from "../agent";
import { jobClaim, jobEnqueue, jobFinish, jobShow, sessionEnd, sessionStart, videoCheckout, videoShow } from "../catalog";
import { agentAuth, dailyCapUsd, DAILY_WINDOW_MS, type AgentAuth } from "../config";
import { costFromLog, JobCostMeter, spendWindow, type CostReading, type SpendEntry } from "../cost";
import { cacheDir } from "../content-cache";
import { jobDir } from "../paths";
import { sweepByMarker } from "../proc";
import { credentialNote, JobRefused } from "../runner";
import { resolveSource } from "../source-note";
import type { RecordStore } from "../store";
import { readClaudeDefaults, readPreference, resolveAgentSettings } from "./agent-model";
import { isNarrated, type ValidVideoBrief } from "./brief";
import { appendRead, editsOn, readCalls, readReads, ReadTracker, isToolResult, LineQueue } from "./calls";
import { buildCheckout, resolvedPaths, scaffold } from "./checkout";
import { BASH_TIMEOUT_MS, VIDEO_CONCURRENCY, VIDEO_MAX_ATTEMPTS, VIDEO_RUNNER_NAME, videoHangMs, videoMaxTurns } from "./config";
import { safeCopy, safeHash, safeRead } from "./copy";
import type { VideoDoctor } from "./doctor";
import { runVideoGate, type GateTools } from "./gate";
import { sandboxedGateTools } from "./gate-tools";
import { apiListing, manualFile, manualText, writeManual } from "./manual";
import { sheetPath, videoCandidateRef, videoTarget, type VideoPaths } from "./paths";
import { buildVideoPrompt, buildVideoResumePrompt, buildVideoRetryPrompt, buildVideoRevisePrompt } from "./prompt";
import { writeGuard } from "./bash-guard";
import { buildProfile, resolvedStudioHome } from "./sandbox";
import { scanSource, voicedLines } from "./scan";
import { clipKeys, keepClips, seedClips } from "./seed";
import { buildVideoSettings } from "./settings";
import { deriveSteps } from "./steps";
import { discoverToolchain, toolchainProblems, type Toolchain } from "./toolchain";
import type { VideoGateResult, VideoJobRecord } from "./types";
import { wrapperConfig, writeWrapper } from "./wrapper";

/**
 * The video runner (D43 of docs/STUDIO-VIDEOS.md): a second runner in the
 * studio process, beside the diagram one. Its own queue, concurrency, timer,
 * settings, prompt and gate; the spawner, the login, the cost meter and the
 * daily cap are shared.
 *
 * It is the outer frame (D54): it spawns, streams progress, stops a job only
 * when it has truly hung, gates the finished video, and runs Accept and
 * Discard. Writing code, compiling, voicing and stitching are the agent's to
 * get right inside its own loop, as they are the owner's by hand.
 */

export type VideoStore = RecordStore<VideoJobRecord>;

interface Running {
  record: VideoJobRecord;
  agent: AgentRun | null;
  cancelled: boolean;
  meter: JobCostMeter;
  costWrittenAt: number;
  paths: VideoPaths | null;
  reads: ReadTracker;
  edits: number;
  gateRunning: boolean;
  /** How many wrapper calls the narration log has said something about. */
  callsNarrated: number;
  /** The stream's lines, handled in order; the gate waits for it. */
  lines: LineQueue;
  /**
   * Whether this runner may write the catalog row's terminal state: once the
   * catalog handed the job over, or answered nothing (the degraded mode, D16).
   * Never before the claim, and never after a refusal, which means the row is
   * someone else's (Greptile on #201).
   */
  mayFinish: boolean;
}

export interface VideoParent {
  jobId: string;
  agentSessionId: string | null;
  changes: string | null;
  /** True when the parent is in review and the catalog discards it in the child's own transaction. */
  discard: boolean;
}

export interface VideoRunnerDeps {
  doctor: VideoDoctor;
  /** Every other entry the daily cap counts: diagram jobs and planner turns. */
  otherSpend?: () => readonly SpendEntry[];
  /** The toolchain, discovered per job. A test passes its own. */
  toolchain?: () => Promise<Toolchain>;
  /** The gate's sandboxed operations. A test passes recorded answers. */
  gateTools?: (input: { tools: Toolchain; paths: VideoPaths; home: string; voice: string }) => GateTools;
}

/** The owner's home, resolved: the profiles deny reads under it. */
function ownerHome(): string {
  try {
    return realpathSync(process.env.HOME ?? "/");
  } catch {
    return process.env.HOME ?? "/";
  }
}

export class VideoRunner {
  private readonly store: VideoStore;
  private readonly deps: VideoRunnerDeps;
  private readonly running = new Map<string, Running>();
  private readonly settledJobs = new Map<string, Promise<void>>();
  private readonly enqueuing = new Map<string, Promise<{ record: VideoJobRecord; created: boolean; jobsAhead: number }>>();
  private draining = false;

  constructor(store: VideoStore, deps: VideoRunnerDeps) {
    this.store = store;
    this.deps = deps;
  }

  settled(id: string): Promise<void> {
    return this.settledJobs.get(id) ?? Promise.resolve();
  }

  get busy(): number {
    return this.running.size;
  }

  private async tools(): Promise<Toolchain> {
    return (this.deps.toolchain ?? discoverToolchain)();
  }

  /* ------------------------------------------------------------------ */
  /* Reconcile                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * At start: a job left `running` has no process behind it and becomes
   * `interrupted` (V1), after a sweep for anything still running out of its
   * workspace. A job left `awaiting_review` is asked about: if the runner
   * died between Accept's commit and its own write of `accepted`, the row
   * says so and the record adopts it ("The runner's side, and the retry").
   */
  async reconcile(): Promise<{ interrupted: string[]; adopted: string[] }> {
    const interrupted: string[] = [];
    const adopted: string[] = [];
    for (const record of this.store.list()) {
      if (record.state === "running") {
        await sweepByMarker(`${jobDir(record.id)}/`);
        const cost = await readFile(path.join(jobDir(record.id), "session.ndjson"), "utf8")
          .then((body) => costFromLog(body, record.agentModel?.passed ?? null))
          .catch(() => null);
        await this.store.update(record.id, {
          state: "interrupted",
          finishedAt: new Date().toISOString(),
          errorKind: "interrupted",
          error: "the runner died while this job was running",
          reconciled: true,
          ...(cost?.usd === undefined || cost.usd === null ? {} : { costUsd: cost.usd, costSource: cost.source }),
        });
        interrupted.push(record.id);
        const finished = await jobFinish({ jobId: record.id, state: "interrupted", errorKind: "interrupted", error: "the runner died while this job was running" });
        if (!finished.ok) await this.store.noteCatalogError(record.id, finished.error ?? "");
        if (record.sessionId !== null) await sessionEnd(record.sessionId, "interrupted");
      } else if (record.state === "awaiting_review") {
        const shown = await jobShow(record.id);
        const state = (shown.json as { job?: { state?: unknown } } | null)?.job?.state;
        if (shown.ok && state === "accepted") {
          await this.store.update(record.id, { state: "accepted", reviewedAt: new Date().toISOString(), indexed: true, reconciled: true });
          adopted.push(record.id);
        }
      }
    }
    return { interrupted, adopted };
  }

  /* ------------------------------------------------------------------ */
  /* The cap                                                            */
  /* ------------------------------------------------------------------ */

  spend(now: number = Date.now()): ReturnType<typeof spendWindow> {
    return spendWindow([...this.store.list(), ...(this.deps.otherSpend?.() ?? [])], DAILY_WINDOW_MS, now);
  }

  /** `STUDIO_DAILY_USD`, counting a video like any job (V14). Unset, the default, refuses nothing. */
  assertUnderCap(now: number = Date.now()): void {
    const cap = dailyCapUsd();
    if (cap === null) return;
    const window = this.spend(now);
    if (window.totalUsd < cap) return;
    throw new JobRefused(
      429,
      `the studio has spent $${window.totalUsd.toFixed(2)} in the last 24 hours, at or over the $${cap.toFixed(2)} ` +
        `STUDIO_DAILY_USD cap. Nothing was queued; the oldest counted job leaves the window at ${window.oldestAgesOutAt ?? "(unknown)"}.`,
      { reason: "daily-cap", totalUsd: window.totalUsd, capUsd: cap },
    );
  }

  /* ------------------------------------------------------------------ */
  /* Enqueue                                                            */
  /* ------------------------------------------------------------------ */

  /** Whether a studio video has this slug, and its revision: Accept's base. Undefined when the catalog cannot say. */
  async startingPoint(slug: string): Promise<{ exists: boolean | undefined; revision: number | null | undefined }> {
    const shown = await videoShow(slug);
    const video = (shown.json as { video?: { revision?: unknown } | null } | null)?.video;
    if (!shown.ok || video === undefined) return { exists: undefined, revision: undefined };
    if (video === null) return { exists: false, revision: null };
    return { exists: true, revision: typeof video.revision === "number" ? video.revision : undefined };
  }

  /**
   * Every refusal made before anything is written: the video doctor (503,
   * V2 and V3), the voice, the lease, the mode against the catalog, and the
   * cap. `replacing` is a parent in review whose lease the child takes in
   * the catalog's one transaction (D52).
   */
  async admit(brief: ValidVideoBrief, replacing: string | null = null): Promise<{ revision: number | null | undefined }> {
    const report = await this.deps.doctor.report();
    if (!report.ok) {
      throw new JobRefused(503, "this machine cannot run a video job right now, so nothing was queued", {
        doctor: report.checks.filter((check) => !check.ok),
      });
    }
    if (isNarrated(brief) && !report.voices.includes(brief.voice)) {
      throw new JobRefused(409, `the voice ${brief.voice} is not installed for kokoro, and the narration step never downloads one (V9)`, {
        installed: report.voices,
      });
    }
    const target = videoTarget(brief.slug);
    const holder = this.store.activeOn(target);
    if (holder !== undefined && holder.id !== replacing) {
      throw new JobRefused(409, `${target} is already held by job ${holder.id} (${holder.state}); accept or discard that one first`, {
        holder: holder.id,
        state: holder.state,
      });
    }
    const start = await this.startingPoint(brief.slug);
    if (brief.mode === "new" && start.exists === true) {
      throw new JobRefused(409, `a studio video called ${brief.slug} already exists, and this brief says mode "new": make it a change, or pick another slug`);
    }
    if (brief.mode === "change" && start.exists === false && replacing === null) {
      throw new JobRefused(409, `there is no studio video called ${brief.slug} to change`);
    }
    this.assertUnderCap();
    return { revision: start.revision };
  }

  async enqueue(
    brief: ValidVideoBrief,
    parent?: VideoParent,
    options: { draftId?: string | null } = {},
  ): Promise<{ record: VideoJobRecord; created: boolean; jobsAhead: number }> {
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
    brief: ValidVideoBrief,
    parent: VideoParent | undefined,
    options: { draftId?: string | null },
  ): Promise<{ record: VideoJobRecord; created: boolean; jobsAhead: number }> {
    const existing = this.store.byIdempotencyKey(brief.idempotencyKey);
    if (existing !== undefined) return { record: existing, created: false, jobsAhead: this.queued().length };

    const base = await this.admit(brief, parent?.discard === true ? parent.jobId : null);
    const id = randomUUID();
    const target = videoTarget(brief.slug);
    const record: VideoJobRecord = {
      id,
      kind: "video",
      state: "queued",
      phase: null,
      brief,
      targetPath: target,
      topic: brief.topic,
      slug: brief.slug,
      classes: [],
      attempt: 0,
      sessionId: null,
      agentSessionId: parent?.agentSessionId ?? null,
      parentJobId: parent?.jobId ?? null,
      draftId: options.draftId ?? null,
      changes: parent?.changes ?? null,
      idempotencyKey: brief.idempotencyKey,
      ...(base.revision === undefined ? {} : { targetRevisionBefore: base.revision }),
      sourceHashBefore: null,
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
      steps: [],
      lineChanges: [],
      gate: null,
      errorKind: null,
      error: null,
      written: [],
      indexed: false,
      catalogErrors: [],
    };
    await mkdir(jobDir(id), { recursive: true });
    await this.store.create(record);
    const briefFile = path.join(jobDir(id), "brief.json");
    await writeFile(
      briefFile,
      `${JSON.stringify(
        {
          id,
          kind: "video",
          topic: brief.topic,
          target,
          candidate: videoCandidateRef(id, brief.slug),
          idempotencyKey: brief.idempotencyKey,
          ...(options.draftId === undefined || options.draftId === null ? {} : { draft: options.draftId }),
          ...(parent === undefined ? {} : { parentJob: parent.jobId }),
          brief,
        },
        null,
        1,
      )}\n`,
      "utf8",
    );
    const enqueued = await jobEnqueue(briefFile, parent?.discard === true ? { discardParent: parent.jobId } : {});
    if (!enqueued.ok && (!enqueued.offline || parent?.discard === true)) {
      // A refusal is durable: the workspace goes. A discard-and-enqueue with
      // the catalog down is refused as well, since the parent's discard and
      // this job's lease are one transaction or nothing (D52).
      await rm(jobDir(id), { recursive: true, force: true });
      this.store.forget(id);
      if (parent?.discard === true && !enqueued.offline && leftReview(enqueued.error)) {
        // The parent's row lock was taken first by another change of it (a
        // Replace and a Revise pressed together) or by a verdict: a conflict
        // with that press, not a bad request.
        throw new JobRefused(
          409,
          `job ${parent.jobId} left review while this change was being queued: another change or a verdict reached it first, so nothing was queued`,
          { reason: "parent-left-review", parentJob: parent.jobId },
        );
      }
      throw new JobRefused(
        enqueued.offline ? 503 : enqueued.error?.includes("already held") === true ? 409 : 400,
        enqueued.error ?? "the catalog would not take this job",
      );
    }
    if (!enqueued.ok) await this.store.noteCatalogError(id, enqueued.error ?? "");
    if (parent?.discard === true) {
      const previous = this.store.get(parent.jobId);
      if (previous !== undefined) {
        // `replacedBy` rides on the state change itself, so whoever follows
        // the parent (its draft) reads a replacement, not a verdict.
        await this.store.update(parent.jobId, { state: "discarded", reviewedAt: new Date().toISOString(), replacedBy: id });
        await this.cleanup(previous, { candidate: true });
      }
    }
    void this.kick();
    return { record, created: true, jobsAhead: Math.max(0, this.queued().length - 1) };
  }

  private queued(): VideoJobRecord[] {
    return this.store.list({ state: "queued" }).sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
  }

  async kick(): Promise<void> {
    if (this.draining) return;
    while (this.running.size < VIDEO_CONCURRENCY) {
      const next = this.queued().find((record) => !this.running.has(record.id));
      if (next === undefined) return;
      const entry: Running = {
        record: next,
        agent: null,
        cancelled: false,
        meter: new JobCostMeter(null),
        costWrittenAt: 0,
        paths: null,
        reads: new ReadTracker(),
        edits: 0,
        gateRunning: false,
        callsNarrated: 0,
        lines: new LineQueue(),
        mayFinish: false,
      };
      this.running.set(next.id, entry);
      let settle: () => void = () => undefined;
      this.settledJobs.set(next.id, new Promise<void>((resolve) => (settle = resolve)));
      void this.execute(entry)
        .catch(async (error: unknown) => {
          await this.store.update(next.id, {
            state: "failed",
            finishedAt: new Date().toISOString(),
            errorKind: "internal",
            error: `the video runner threw: ${(error as Error).message}`,
          });
          if (entry.mayFinish) {
            const finished = await jobFinish({ jobId: next.id, state: "failed", errorKind: "internal", error: (error as Error).message });
            if (!finished.ok) await this.store.noteCatalogError(next.id, finished.error ?? "");
          }
          const sessionId = this.store.get(next.id)?.sessionId ?? null;
          if (sessionId !== null) await sessionEnd(sessionId, "failed", (error as Error).message).catch(() => undefined);
        })
        .finally(() => {
          this.running.delete(next.id);
          settle();
          void this.kick();
        });
    }
  }

  /* ------------------------------------------------------------------ */
  /* One job                                                            */
  /* ------------------------------------------------------------------ */

  /** The files a job starts from: its parent's saved source, else the catalog's stored source; null for a new video. */
  private async startFrom(record: VideoJobRecord): Promise<Map<string, Buffer> | null> {
    const files = new Map<string, Buffer>();
    if (record.parentJobId !== null) {
      const parent = this.store.get(record.parentJobId);
      if (parent !== undefined) {
        const parentPaths = await resolvedPaths(parent.id, parent.slug);
        // A parent's saved source, or, for an interrupted one, the file it was editing.
        for (const dir of [parentPaths.source, parentPaths.topicDir]) {
          const names = await readdir(dir).catch(() => [] as string[]);
          for (const name of names) {
            if (!/^[a-z0-9_]+\.py$|^topic\.yml$/.test(name)) continue;
            const body = await safeRead(path.join(dir, name), 4 * 2 ** 20).catch(() => null);
            if (body !== null) files.set(name, body);
          }
          if (files.size > 0) return files;
        }
      }
    }
    if (record.brief.mode !== "change") return null;
    // A change with no parent in this studio: the source the catalog stored.
    const scratch = await mkdtemp(path.join(tmpdir(), "studio-video-source-"));
    try {
      const checkout = await videoCheckout(record.slug, scratch);
      if (!checkout.ok) throw new Error(`the stored source of ${record.slug} could not be checked out: ${checkout.error ?? ""}`);
      for (const name of await readdir(scratch)) {
        if (!/^[a-z0-9_]+\.py$|^topic\.yml$/.test(name)) continue;
        files.set(name, await readFile(path.join(scratch, name)));
      }
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
    if (files.size === 0) throw new Error(`the catalog holds no source for ${record.slug}`);
    return files;
  }

  private async execute(entry: Running): Promise<void> {
    const id = entry.record.id;
    const sessionId = `studio-${id}`;
    const inherited = entry.record.agentSessionId;
    let agentSessionId = inherited ?? randomUUID();
    let resumeFromParent = inherited !== null;

    let record = await this.store.update(id, {
      state: "running",
      phase: "setup",
      startedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
      sessionId,
      agentSessionId,
      attempt: 0,
    });
    await this.store.emit(id, { type: "phase", phase: "setup", note: "building the job's checkout", state: "running" });

    const opened = await sessionStart({ id: sessionId, title: record.brief.title, goal: record.brief.idea, agentSessionId });
    if (!opened.ok) await this.store.noteCatalogError(id, opened.error ?? "");
    const claimed = await jobClaim(id, VIDEO_RUNNER_NAME, sessionId);
    if (!claimed.ok) {
      await this.store.noteCatalogError(id, claimed.error ?? "");
      if (!claimed.offline) {
        // The row is someone else's: another runner claimed it, or a person
        // cancelled it. The local record and the session are closed, and the
        // row is left alone, as the diagram runner's `abandon` does.
        const error = `${claimed.error ?? "the catalog would not hand this job over"}. Another runner holds this job, or it was cancelled before it was picked up, so no agent was started and nothing was spent.`;
        const updated = await this.store.update(id, { state: "failed", finishedAt: new Date().toISOString(), errorKind: "not-claimed", error });
        await this.store.emit(id, { type: "error", state: "failed", note: videoNote(updated) });
        await sessionEnd(sessionId, "failed", error);
        return;
      }
    }
    entry.mayFinish = true;

    /* The workspace, only on a machine the doctor passes: never unsandboxed (V2, V3). */
    const report = await this.deps.doctor.report();
    if (!report.ok) {
      throw new Error(`the video doctor fails, so nothing was rendered: ${report.checks.filter((check) => !check.ok).map((check) => check.detail).join("; ")}`);
    }
    const tools = await this.tools();
    const problems = toolchainProblems(tools);
    if (problems.length > 0) throw new Error(problems.join("; "));
    const paths = await resolvedPaths(id, record.slug);
    entry.paths = paths;
    const home = ownerHome();
    const brief = record.brief;
    const voice = isNarrated(brief) ? brief.voice : "none";
    await buildCheckout(tools, paths, voice);
    for (const [kind, file] of [["render", paths.renderProfile], ["narrate", paths.narrateProfile], ["gate", paths.gateProfile]] as const) {
      await writeFile(file, buildProfile(kind, { tools, paths, home, studioHome: resolvedStudioHome() }), "utf8");
    }
    // matplotlib's font cache, built once by the doctor, so no job pays the
    // ten seconds a fresh MPLCONFIGDIR costs (measured).
    await cp(path.join(cacheDir(), "video-mpl"), paths.mpl, { recursive: true, verbatimSymlinks: true, force: false, errorOnExist: false }).catch(() => undefined);
    const startFiles = await this.startFrom(record);
    const scaffolded = await scaffold(tools, paths, brief, startFiles === null ? null : { files: startFiles });
    // A resume continues work that may already be finished, so its source is
    // not required to change; a revise or a change is.
    const isResume = record.parentJobId !== null && record.changes === null && this.store.get(record.parentJobId)?.state === "interrupted";
    const sourceHashBefore = startFiles === null || isResume ? null : await safeHash(paths.sceneFile);
    record = await this.store.update(id, { classes: scaffolded.classes, sourceHashBefore });
    await this.store.emit(id, { type: "step", state: "running", note: `the topic is ready: ${scaffolded.classes.join(", ")}` });

    const listing = await apiListing(tools);
    const config = wrapperConfig({ tools, paths, home, voice, scenes: scaffolded.classes, apiNames: listing?.names ?? [], narrated: isNarrated(brief) });
    await writeWrapper(tools.node, paths, config);
    const guard = await writeGuard(tools.node, paths);

    /* The clips it can have for free (D47). */
    const keyInput = { tools, paths, home, voice };
    let seededNote: string | undefined;
    if (isNarrated(brief)) {
      const says = brief.scenes.flatMap((scene) => scene.beats.map((beat) => beat.say));
      const keys = await clipKeys(keyInput, says).catch(() => [] as string[]);
      const parentClips = record.parentJobId === null ? null : (await resolvedPaths(record.parentJobId, record.slug)).clips;
      const seeded = await seedClips(paths, keys, { shared: tools.sharedAudioCache, parentClips });
      record = await this.store.update(id, { seeded: { wanted: seeded.wanted, seeded: seeded.seeded } });
      seededNote = `${seeded.seeded} of ${seeded.wanted} of the brief's lines are already voiced in this job's cache.`;
      await this.store.emit(id, { type: "step", state: "running", note: `narration: ${seeded.seeded} of ${seeded.wanted} lines already voiced` });
    }

    /* The source note, as material. */
    // Only a note the catalog answered for: a slug it does not know leaves
    // the agent working from the brief alone.
    const resolvedNote = brief.source === undefined ? null : await resolveSource(id, brief.source).catch(() => null);
    const sourceNote = resolvedNote === null || resolvedNote.concept === null ? undefined : path.resolve(resolvedNote.path);

    /* The manual and the settings. */
    let manualHash = this.inheritedManual(record, inherited !== null);
    if (manualHash === null || (await manualFile(manualHash)) === null) {
      const written = await writeManual(manualText(paths.wrapper, listing?.text ?? "(the listing could not be read; run the api command)"));
      manualHash = written.hash;
    }
    const manualHome = tools.sharedAudioCache === null ? null : path.dirname(path.dirname(tools.sharedAudioCache));
    await writeFile(
      paths.settings,
      `${JSON.stringify(
        buildVideoSettings({ jobId: id, paths, manimkcRoot: tools.manimkcRoot, manimkcHome: manualHome, guard, ...(sourceNote === undefined ? {} : { source: sourceNote }) }),
        null,
        1,
      )}\n`,
      "utf8",
    );

    /* Model and effort (D53): resolved now, or the parent's when continuing its session. */
    const parent = record.parentJobId === null ? undefined : this.store.get(record.parentJobId);
    let agentModel = parent?.agentModel ?? null;
    let agentEffort = parent?.agentEffort ?? null;
    if (inherited === null || agentModel === null || agentEffort === null) {
      const resolved = await resolveAgentSettings(await readPreference("studioVideoAgent"), await readClaudeDefaults());
      agentModel = resolved.model;
      agentEffort = resolved.effort;
    }
    const auth = agentAuth();
    record = await this.store.update(id, { agentAuth: auth, manualHash, agentModel, agentEffort });
    // No flag passed runs the CLI's own default under the seal, measured as
    // claude-opus-5 (D53); priced so until the stream names its model.
    entry.meter = new JobCostMeter(agentModel.passed ?? "claude-opus-5");
    await this.refreshSteps(entry, { setupDone: true });

    let gate: VideoGateResult | null = null;
    let findings: string[] = [];
    let outcome: AgentOutcome | null = null;
    let refused: AgentOutcome | null = null;
    let startedSession = false;

    for (let attempt = 1; attempt <= VIDEO_MAX_ATTEMPTS; attempt += 1) {
      if (entry.cancelled) break;
      record = await this.store.update(id, { attempt, phase: "scene-code", heartbeatAt: new Date().toISOString() });
      await this.store.emit(id, {
        type: "phase",
        phase: "scene-code",
        note: attempt === 1 ? "the agent is writing the scenes" : `attempt ${attempt}: fixing what the check found`,
        state: "running",
      });
      const resuming = resumeFromParent || startedSession;
      const prompt =
        findings.length > 0
          ? buildVideoRetryPrompt(findings, paths)
          : resumeFromParent
            ? record.changes !== null
              ? buildVideoRevisePrompt(record.changes, paths)
              : buildVideoResumePrompt(paths)
            : buildVideoPrompt({
                brief,
                paths,
                classes: scaffolded.classes,
                ...(sourceNote === undefined ? {} : { source: sourceNote }),
                ...(seededNote === undefined ? {} : { seededNote }),
                change: startFiles !== null,
              });
      startedSession = true;
      const sceneBefore = await safeHash(paths.sceneFile);
      let initNoted: Promise<void> = Promise.resolve();
      const agent = this.spawn({
        id,
        paths,
        prompt,
        sessionId: agentSessionId,
        resume: resuming,
        auth,
        manual: (await manualFile(manualHash!)) ?? null,
        model: agentModel.passed,
        effort: agentEffort.passed,
        source: sourceNote,
        onLine: (line) => entry.lines.push(() => this.onAgentLine(entry, line)),
        onInit: (init) => {
          initNoted = (async () => {
            await this.store.update(id, { resolvedModel: init.model, apiKeySource: init.apiKeySource });
            await this.store.emit(id, { type: "step", state: "running", note: credentialNote(auth, init.apiKeySource) });
            await this.store.emit(id, { type: "step", state: "running", note: `the agent runs ${init.model ?? "a model it did not name"}` });
          })().catch(() => undefined);
        },
      });
      entry.agent = agent;
      outcome = await agent.done;
      entry.agent = null;
      // Every line's work, the last sheet Read's line in reads.ndjson
      // included, before anything below reads what those lines wrote.
      await entry.lines.settled();
      await initNoted;
      await this.refreshSteps(entry);
      if (entry.cancelled || outcome.stopReason === "cancelled") break;

      if (outcome.spawnFailed) {
        await this.finish(entry, "failed", { errorKind: "spawn", error: `the agent never started: ${outcome.stderr}`, outcome, cost: entry.meter.read() });
        return;
      }
      if (resumeFromParent && outcome.turns === null && outcome.exitCode !== 0) {
        // The parent's session is gone (V13): a fresh one, from the source
        // already copied in, with the whole brief.
        agentSessionId = randomUUID();
        resumeFromParent = false;
        startedSession = false;
        const written = await writeManual(manualText(paths.wrapper, listing?.text ?? ""));
        manualHash = written.hash;
        record = await this.store.update(id, { agentSessionId, manualHash });
        await this.store.emit(id, {
          type: "phase",
          note: "the earlier session could not be resumed, so the agent starts a fresh one from the source, without the earlier conversation",
          state: "running",
        });
        findings = [];
        continue;
      }
      if (outcome.isError && outcome.stopReason === null && (outcome.turns ?? 0) <= 1 && (await safeHash(paths.sceneFile)) === sceneBefore) {
        // The first request itself failed: a refused credential, a model this
        // account cannot use. A retry sends the same request again.
        refused = outcome;
        break;
      }
      if (outcome.stopReason === "idle-timeout") {
        await this.finish(entry, "failed", {
          errorKind: "timeout",
          error: `the agent said nothing and ran no command for ${Math.round(videoHangMs() / 60_000)} minutes, so the job was stopped as hung`,
          outcome,
          cost: entry.meter.read(),
        });
        return;
      }

      /* The gate. */
      entry.gateRunning = true;
      await this.store.update(id, { phase: "check" });
      await this.refreshSteps(entry);
      gate = await runVideoGate({
        brief,
        paths,
        classes: scaffolded.classes,
        startedAtMs: this.freshnessFrom(record),
        sourceHashBefore,
        calls: await readCalls(paths.calls),
        reads: await readReads(paths.reads),
        tools: (this.deps.gateTools ?? sandboxedGateTools)({ tools, paths, home, voice }),
        onStep: (step) => void this.store.emit(id, { type: "step", state: "running", note: `check: ${step.name}: ${step.ok ? "passed" : "failed"}, ${step.detail}` }),
      });
      entry.gateRunning = false;
      record = await this.store.update(id, { gate, lineChanges: gate.script?.changes ?? record.lineChanges });
      await this.refreshSteps(entry);
      findings = gate.findings;
      if (gate.ok) break;
    }

    if (entry.cancelled) {
      await sweepByMarker(`${paths.job}/`);
      await this.finish(entry, "cancelled", { errorKind: "cancelled", error: "stopped on request", outcome, cost: entry.meter.read() });
      return;
    }
    if (refused !== null) {
      await this.finish(entry, "failed", {
        errorKind: "agent",
        error: refused.result ?? `the agent's session ended in an error before it did anything (${refused.subtype ?? "no result"})`,
        outcome: refused,
        cost: entry.meter.read(),
      });
      return;
    }
    if (gate !== null && gate.ok) {
      await this.finish(entry, "awaiting_review", { outcome, cost: entry.meter.read() });
      return;
    }
    await this.finish(entry, "failed", {
      errorKind: "gate",
      error: gate === null ? `the agent produced nothing the gate could look at (${outcome?.subtype ?? "no result"})` : gate.findings.join(" "),
      outcome,
      cost: entry.meter.read(),
    });
  }

  /** A resume's source is its parent's work, so its age is measured from the parent's start. */
  private freshnessFrom(record: VideoJobRecord): number {
    const own = Date.parse(record.startedAt ?? record.requestedAt);
    if (record.parentJobId === null || record.changes !== null) return own;
    const parent = this.store.get(record.parentJobId);
    const start = parent === undefined ? NaN : Date.parse(parent.startedAt ?? parent.requestedAt);
    return Number.isFinite(start) ? Math.min(own, start) : own;
  }

  private inheritedManual(record: VideoJobRecord, continuesParent: boolean): string | null {
    if (!continuesParent || record.parentJobId === null) return null;
    return this.store.get(record.parentJobId)?.manualHash ?? null;
  }

  /**
   * One attempt of the agent: the diagram agent's seals, this job's
   * permission file, the topic folder as its working directory and two
   * `--add-dir`s, and the model and effort resolved for the job.
   */
  private spawn(input: {
    id: string;
    paths: VideoPaths;
    prompt: string;
    sessionId: string;
    resume: boolean;
    auth: AgentAuth;
    manual: string | null;
    model: string | null;
    effort: string | null;
    source: string | undefined;
    onLine: (line: string) => void;
    onInit: (init: { apiKeySource: string | null; model: string | null }) => void;
  }): AgentRun {
    const { paths } = input;
    const maxTurns = videoMaxTurns();
    const argv = [
      "-p",
      input.prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--settings",
      paths.settings,
      "--setting-sources",
      "",
      "--permission-prompts",
      "none",
      "--strict-mcp-config",
      "--mcp-config",
      '{"mcpServers":{}}',
      "--add-dir",
      paths.lib,
      "--add-dir",
      paths.out,
      ...(input.source === undefined ? [] : ["--add-dir", path.dirname(input.source)]),
      ...(input.model === null ? [] : ["--model", input.model]),
      ...(input.effort === null ? [] : ["--effort", input.effort]),
      ...(maxTurns === null ? [] : ["--max-turns", String(maxTurns)]),
      ...(input.manual === null ? [] : ["--append-system-prompt-file", input.manual]),
      ...(input.resume ? ["--resume", input.sessionId] : ["--session-id", input.sessionId]),
    ];
    const env = agentEnv(process.env, input.auth, paths.tmp);
    // An uncached preview of a whole video took up to 131 seconds (measured),
    // past the Bash tool's two-minute default; the tool's own ceiling instead.
    env.BASH_DEFAULT_TIMEOUT_MS = String(BASH_TIMEOUT_MS);
    env.BASH_MAX_TIMEOUT_MS = String(BASH_TIMEOUT_MS);
    const hangMs = videoHangMs();
    return spawnClaude(argv, {
      cwd: paths.topicDir,
      env,
      watch: {
        onLine: input.onLine,
        onInit: input.onInit,
        attemptMs: null,
        idleMs: hangMs,
        // Only the agent's own doing counts: a wrapper call that ended inside
        // the hang window. Files under render/ do not, because a scene
        // writes them, and a scene touching a file forever kept a hung
        // session alive forever (the review of #201).
        stillWorking: () => stillWorking(paths, hangMs),
      },
    });
  }

  private async onAgentLine(entry: Running, line: string): Promise<void> {
    const id = entry.record.id;
    entry.meter.observe(line);
    await this.store.appendRaw(id, line);
    const paths = entry.paths;
    if (paths !== null) {
      for (const file of entry.reads.observe(line)) {
        if (!file.endsWith(".sheet.png")) continue;
        await appendRead(paths.reads, { path: file, at: new Date().toISOString() });
        await this.store.emit(id, { type: "step", state: "running", note: `read the sheet ${path.basename(file, ".sheet.png")}` });
      }
      if (editsOn(line).includes(paths.sceneFile)) entry.edits += 1;
      if (isToolResult(line) || editsOn(line).length > 0) await this.refreshSteps(entry);
    }
    const now = Date.now();
    if (now - entry.costWrittenAt >= 2_000) {
      const cost = entry.meter.read();
      if (cost.usd !== null) {
        entry.costWrittenAt = now;
        await this.store.update(id, { costUsd: cost.usd, costSource: cost.source, heartbeatAt: new Date().toISOString() });
      }
    }
  }

  /** The job view's steps, from the wrapper's log, the stream and the gate. */
  private async refreshSteps(entry: Running, extra: { setupDone?: boolean } = {}): Promise<void> {
    const paths = entry.paths;
    const record = this.store.get(entry.record.id);
    if (paths === null || record === undefined) return;
    const calls = await readCalls(paths.calls);
    const steps = deriveSteps({
      narrated: isNarrated(record.brief),
      seeded: record.seeded ?? null,
      setupDone: extra.setupDone ?? record.classes.length > 0,
      edits: entry.edits,
      calls,
      reads: await readReads(paths.reads),
      sheets: Object.fromEntries(record.classes.map((scene) => [scene, sheetPath(paths, scene)])),
      gate: record.gate,
      gateRunning: entry.gateRunning,
      ready: record.state === "awaiting_review",
      agentRunning: entry.agent !== null,
    });
    const running = steps.find((step) => step.state === "running");
    await this.store.update(record.id, { steps, ...(running === undefined ? {} : { phase: running.name }) });
    // One line in the narration log per wrapper call, once (D24).
    for (const call of calls.slice(entry.callsNarrated)) {
      await this.store.emit(record.id, { type: "step", state: "running", note: narrateCall(call) });
    }
    entry.callsNarrated = Math.max(entry.callsNarrated, calls.length);
  }

  private async finish(
    entry: Running,
    state: "awaiting_review" | "failed" | "cancelled",
    patch: { errorKind?: string; error?: string; outcome: AgentOutcome | null; cost: CostReading },
  ): Promise<void> {
    const id = entry.record.id;
    const record = await this.store.update(id, {
      state,
      phase: state === "awaiting_review" ? "ready" : (this.store.get(id)?.phase ?? null),
      finishedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
      exitCode: patch.outcome?.exitCode ?? null,
      turns: patch.outcome?.turns ?? null,
      costUsd: patch.cost.usd,
      costSource: patch.cost.source,
      errorKind: patch.errorKind ?? null,
      error: patch.error ?? null,
    });
    await this.refreshSteps(entry);
    // The source is kept at every verdict: it is what a revise or a change starts from.
    if (entry.paths !== null) await saveSource(entry.paths);
    await this.store.emit(id, {
      type: state === "awaiting_review" ? "done" : "error",
      state,
      note: videoNote(this.store.get(id) ?? record),
    });
    const gateFile = path.join(jobDir(id), "gate.json");
    if (record.gate !== null) await writeFile(gateFile, `${JSON.stringify(record.gate, null, 1)}\n`, "utf8");
    const finished = await jobFinish({
      jobId: id,
      state,
      ...(record.phase === null ? {} : { phase: record.phase }),
      candidatePath: videoCandidateRef(id, record.slug),
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
      await sessionEnd(record.sessionId, state === "awaiting_review" ? "closed" : state === "cancelled" ? "cancelled" : "failed", record.error ?? undefined);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Cancel, revise, resume                                             */
  /* ------------------------------------------------------------------ */

  async cancel(id: string): Promise<VideoJobRecord> {
    const record = this.store.get(id);
    if (record === undefined) throw new JobRefused(404, `no job ${id}`);
    if (record.state === "queued") {
      const updated = await this.store.update(id, {
        state: "cancelled",
        cancelRequestedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        errorKind: "cancelled",
        error: "cancelled before it started",
      });
      const finished = await jobFinish({ jobId: id, state: "cancelled", errorKind: "cancelled", error: "cancelled before it started" });
      if (!finished.ok) await this.store.noteCatalogError(id, finished.error ?? "");
      return updated;
    }
    if (record.state !== "running") throw new JobRefused(409, `job ${id} is ${record.state}, so there is nothing to cancel`);
    const updated = await this.store.update(id, { cancelRequestedAt: new Date().toISOString() });
    await this.store.emit(id, { type: "phase", note: "stopping: the agent and every render it started are being stopped", state: "running" });
    const entry = this.running.get(id);
    if (entry !== undefined) {
      entry.cancelled = true;
      await entry.agent?.stop("cancelled");
    }
    return updated;
  }

  /**
   * A picture-only change (D52): a new job continuing the parent's session
   * with the change as text, starting from the parent's source. From review,
   * the parent is discarded in the child's own catalog transaction; from a
   * terminal state, it simply is the parent.
   */
  async revise(record: VideoJobRecord, changes: string, draftId: string | null = null): Promise<VideoJobRecord> {
    const fromReview = record.state === "awaiting_review";
    if (!fromReview && !["accepted", "failed", "cancelled", "discarded", "interrupted"].includes(record.state)) {
      throw new JobRefused(409, `job ${record.id} is ${record.state}; a change is asked of a video in review or finished`);
    }
    const exists = (await this.startingPoint(record.slug)).exists;
    const { record: next } = await this.enqueue(
      {
        ...record.brief,
        mode: exists === true ? "change" : record.brief.mode,
        idempotencyKey: `${record.idempotencyKey}:revise:${Date.now()}`,
      },
      { jobId: record.id, agentSessionId: record.agentSessionId, changes, discard: fromReview },
      { draftId },
    );
    return next;
  }

  /** Continue a job the runner died under, from what it had saved. */
  async resume(record: VideoJobRecord, draftId: string | null = null): Promise<VideoJobRecord> {
    if (record.state !== "interrupted") {
      throw new JobRefused(409, `job ${record.id} is ${record.state}, and resume is for a job the runner died under`);
    }
    const exists = (await this.startingPoint(record.slug)).exists;
    const { record: next } = await this.enqueue(
      {
        ...record.brief,
        mode: exists === true ? "change" : record.brief.mode,
        idempotencyKey: `${record.idempotencyKey}:resume:${record.finishedAt ?? record.id}`,
      },
      { jobId: record.id, agentSessionId: record.agentSessionId, changes: null, discard: false },
      { draftId },
    );
    return next;
  }

  /**
   * After a verdict (D52): keep the source, the sheets, the records and the
   * clips of the lines the final source voices, and delete the rest of
   * `render/`. On a discard, `candidate/` goes too.
   */
  async cleanup(record: VideoJobRecord, options: { candidate: boolean }): Promise<void> {
    const paths = await resolvedPaths(record.id, record.slug);
    await saveSource(paths);
    const sheets = path.join(paths.job, "sheets");
    await mkdir(sheets, { recursive: true });
    for (const scene of record.classes) {
      await safeCopy(sheetPath(paths, scene), path.join(sheets, `${scene}.sheet.png`)).catch(() => undefined);
    }
    if (isNarrated(record.brief) && (await lstat(paths.renderProfile).catch(() => null)) !== null) {
      const tools = await this.tools().catch(() => null);
      const source = await safeRead(paths.sceneFile, 2 * 2 ** 20).then((body) => body.toString("utf8")).catch(() => null);
      if (tools !== null && source !== null) {
        const input = { tools, paths, home: ownerHome(), voice: record.brief.voice };
        const scan = await scanSource(input, source).catch(() => null);
        const keys = scan === null || !scan.ok ? [] : await clipKeys(input, voicedLines(scan)).catch(() => [] as string[]);
        await keepClips(paths, keys);
      }
    }
    await rm(paths.render, { recursive: true, force: true });
    if (options.candidate) await rm(paths.candidate, { recursive: true, force: true });
  }

  async drain(): Promise<void> {
    this.draining = true;
    for (const entry of this.running.values()) {
      entry.cancelled = true;
      await entry.agent?.stop("cancelled");
    }
  }
}

/** The final source into `source/`, the gate's careful way. */
async function saveSource(paths: VideoPaths): Promise<void> {
  await rm(paths.source, { recursive: true, force: true });
  await mkdir(paths.source, { recursive: true });
  await safeCopy(paths.sceneFile, path.join(paths.source, path.basename(paths.sceneFile))).catch(() => undefined);
  await safeCopy(paths.topicYml, path.join(paths.source, "topic.yml")).catch(() => undefined);
}

/**
 * Whether the agent did something inside the hang window that the stream
 * does not show: a wrapper call that ended within it. `calls.ndjson` sits in
 * the job directory, which no profile can write, so only the wrapper, and so
 * only the agent's Bash tool, adds a line to it.
 */
export function agentActive(calls: readonly { endedAt?: string }[], now: number, hangMs: number): boolean {
  return calls.some((call) => {
    const ended = Date.parse(call.endedAt ?? "");
    return Number.isFinite(ended) && ended > now - hangMs;
  });
}

/**
 * How long a started wrapper call counts as working: the Bash tool's own
 * ceiling on one call, and a minute for the wrapper to notice. A marker older
 * than that belongs to a call the tool already ended (a killed wrapper cannot
 * remove its own), so it counts for nothing.
 */
export const IN_FLIGHT_MAX_MS = BASH_TIMEOUT_MS + 60_000;

/**
 * The start times of the wrapper calls that have started and not ended.
 *
 * The wrapper writes a marker whole and renames it into place, but a marker
 * that is there and does not parse still counts, dated by its own
 * modification time: stopping a healthy render over a read that raced a
 * write is the worse mistake, and the expiry still ends it (Greptile on
 * #201). Only an old malformed marker is ignored, by that same expiry.
 */
export async function inFlight(directory: string): Promise<number[]> {
  const names = await readdir(directory).catch(() => [] as string[]);
  const starts: number[] = [];
  for (const name of names) {
    if (!/^[0-9]+\.json$/.test(name)) continue;
    const file = path.join(directory, name);
    const facts = await lstat(file).catch(() => null);
    if (facts === null || !facts.isFile()) continue;
    const body = await readFile(file, "utf8").catch(() => "");
    let started = Number.NaN;
    try {
      started = Date.parse((JSON.parse(body) as { startedAt?: string }).startedAt ?? "");
    } catch {
      /* unreadable: dated by the file below */
    }
    starts.push(Number.isFinite(started) ? started : facts.mtimeMs);
  }
  return starts;
}

/**
 * The hang timer's question for one job, asked when the stream has been
 * silent for `hangMs`: a wrapper call ended inside the window, or one is still
 * running (a render, which the stream shows nothing of until it ends). The
 * second holds whatever `STUDIO_VIDEO_HANG_MS` is set to, bounded by the Bash
 * tool's ceiling rather than by the window (Greptile on #201).
 */
export async function stillWorking(paths: Pick<VideoPaths, "calls" | "inflight">, hangMs: number, now: number = Date.now()): Promise<boolean> {
  if (agentActive(await readCalls(paths.calls), now, hangMs)) return true;
  return (await inFlight(paths.inflight)).some((started) => started > now - IN_FLIGHT_MAX_MS);
}

/** One wrapper call, as the narration log says it (D24). */
export function narrateCall(call: { verb: string; scenes?: string[]; exitCode: number | null; startedAt: string; endedAt: string; rendered?: string[] }): string {
  const seconds = Math.max(0, Math.round((Date.parse(call.endedAt) - Date.parse(call.startedAt)) / 1000));
  const ok = call.exitCode === 0;
  switch (call.verb) {
    case "preview":
      return ok
        ? `rendered ${call.rendered?.length ?? 0} scene${call.rendered?.length === 1 ? "" : "s"} at 480p in ${seconds} s`
        : `a preview failed after ${seconds} s; the agent has the error`;
    case "build":
      return ok ? `built the video at 1080p in ${seconds} s` : `a build failed after ${seconds} s; the agent has the error`;
    case "narrate":
      return ok ? `voiced the lines in ${seconds} s` : `the narration step failed after ${seconds} s`;
    case "lint":
      return ok ? "the scene file lints clean" : "lint found errors";
    case "api":
      return "read the helper listing";
    default:
      return "a command was refused";
  }
}

/**
 * Whether the catalog refused a `--discard-parent` enqueue because the parent
 * was no longer in review when its row lock was taken (`discardForChange` in
 * `services/catalog/src/commands/job.ts`).
 */
function leftReview(error: string | null | undefined): boolean {
  return error !== null && error !== undefined && (/, not awaiting_review, so there is nothing to discard/.test(error) || /moved while it was being discarded/.test(error));
}

/** The plain-English line every response carries about a video job. */
export function videoNote(record: VideoJobRecord): string {
  switch (record.state) {
    case "queued":
      return "queued: the video runner has not picked it up yet";
    case "running":
      return record.cancelRequestedAt !== null ? "stopping: the agent and its renders are being stopped" : `${record.phase ?? "working"}, attempt ${record.attempt}`;
    case "awaiting_review": {
      const seconds = record.gate?.durationSeconds;
      return `the video is built and checked in the job's workspace, and nothing has landed.${seconds === null || seconds === undefined ? "" : ` ${Math.round(seconds)} seconds.`}`;
    }
    case "accepted":
      return `accepted: ${record.written.join(", ") || "the video"} landed in the database`;
    case "discarded":
      return "discarded: the renders are deleted, the source is kept, and nothing landed";
    case "failed":
      return `failed: ${record.error ?? "no reason recorded"}`;
    case "cancelled":
      return `cancelled: ${record.error ?? "stopped on request"}`;
    case "interrupted":
      return "interrupted: the runner died while this was running, and no gate ran";
    default:
      return record.state;
  }
}

/** The sha256 of a string, for tests and callers that hash a source they hold. */
export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
