import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { appendFile, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";

import {
  DRAFT_TRANSITIONS,
  LOCAL_LEARNER_ID,
  canTransition,
  type DraftErrorKind,
  type DraftState,
} from "@self-learn/schema/shared";

import { BriefError, loadVocabulary, validateBrief, type ValidBrief, type Vocabulary } from "./brief";
import { canvas, doctor, doctorChecks, type InspectReport } from "./canvas";
import { draftUpsert, topicAdd, topicAddDryRun, type CatalogResult } from "./catalog";
import {
  agentAuth,
  PLANNER_CONCURRENCY,
  PLANNER_TURNS,
  plannerModel,
  studioOwner,
  TEXT_LIMIT,
  VERB_TIMEOUT_MS,
} from "./config";
import { costFromLog, JobCostMeter, type CostSource, type SpendEntry } from "./cost";
import { documentHashOf, ensureCheckout, isDiagramName, listDiagrams } from "./diagrams";
import {
  draftDir,
  draftJsonPath,
  draftSessionLogPath,
  draftTmpDir,
  draftTranscriptPath,
  draftTranscriptRef,
  plannerSettingsPath,
  plannerSystemPath,
  studioHome,
} from "./paths";
import {
  buildSystemPrompt,
  drawingSummary,
  evaluateReply,
  fence,
  mermaidBlocks,
  plannerArgv,
  plannerSettings,
  startPlanner,
  studioMessage,
  vocabularyHash,
  EXTENDING_LINE_CAP,
  type BriefVerdict,
  type CorpusEntry,
  type DraftBrief,
  type PendingTopic,
  type PlannerOutcome,
  type PlannerRun,
} from "./planner";
import { JobRefused, type Runner } from "./runner";
import type { JobRecord, JobStore } from "./store";

/**
 * Drafts: the planner conversations, their records and their turns
 * (docs/STUDIO-CHAT-FIRST.md, phase 1).
 *
 * **Disk first, as for a job (rule 7).** `drafts/<id>/draft.json` is the
 * record, `transcript.ndjson` every event the conversation had, and
 * `session.ndjson` every raw stream line of every planner turn, which is the
 * cost record an interrupted turn is replayed from. Each is written before
 * the row is mirrored into Postgres with `catalog draft upsert`, and a mirror
 * that fails is noted and retried with the next write, never a refusal: with
 * Postgres down the studio still talks, as it still draws (U3).
 *
 * **Between turns a draft holds nothing.** No process, no port, no lease, no
 * slot. A turn is one `claude -p`, started when a person's message arrives and
 * gone when its reply has been judged.
 *
 * **The runner, not the planner, decides what a reply means.** It takes the
 * last fenced `brief` block, runs it through the same `validateBrief`
 * `POST /api/jobs` runs, and on a refusal resumes the planner once with the
 * field and the sentence. A second refusal is shown, not retried (A10).
 */

/* -------------------------------------------------------------------------- */
/* The record                                                                 */
/* -------------------------------------------------------------------------- */

/** One planner turn's spend, dated at its own end (D36). Structurally a `SpendEntry`. */
export interface TurnSpend extends SpendEntry {
  /** The transcript seq of the person's message the turn answered. */
  turn: number;
  startedAt: string;
  finishedAt: string | null;
  costUsd: number | null;
  costSource: CostSource | null;
}

export interface DraftRecord {
  id: string;
  kind: "diagram";
  state: DraftState;
  ownerId: string;
  /** The slug of the diagram an extend draft was opened on. */
  source: string | null;
  /** That diagram's document hash when the draft opened (C11). */
  sourceHash: string | null;
  /** The revision the EXTENDING block summarised, as the checkout records it; null when unknown. */
  sourceRevision: number | null;
  /** The latest brief's title. */
  title: string | null;
  plannerSessionId: string;
  /** True once the CLI has a transcript for the session, so the next turn resumes it. */
  sessionStarted: boolean;
  /** `drafts/<id>/transcript.ndjson`, relative to `$STUDIO_HOME`. */
  transcriptPath: string;
  brief: DraftBrief | null;
  briefAt: string | null;
  pendingTopic: PendingTopic | null;
  /** Person turns so far, retries included, against `PLANNER_TURNS`. */
  turns: number;
  costUsd: number | null;
  costSource: CostSource | null;
  errorKind: DraftErrorKind | null;
  error: string | null;
  /** The field a brief was refused on, beside an `error` of kind `brief-invalid`. */
  errorField?: string | null;
  idempotencyKey: string;
  vocabularyHash: string;
  /** The last transcript seq written. */
  seq: number;
  /** The turn a planner process is answering right now, if any. */
  inFlight: { turn: number; startedAt: string } | null;
  /** STUDIO notes the planner has not been told yet, sent at the head of the next turn. */
  undelivered: string[];
  spend: TurnSpend[];
  /** Every job this draft started, oldest first. The last is the draft's `jobId` (D35). */
  jobIds: string[];
  /** The last job verdict this draft acted on, so no verdict is acted on twice. */
  followed?: { jobId: string; state: string } | null;
  catalogErrors: string[];
  createdAt: string;
  updatedAt: string;
}

/** One line of `transcript.ndjson`. */
export interface TranscriptEvent {
  seq: number;
  type:
    | "created"
    | "message"
    | "reply"
    | "brief"
    | "brief-invalid"
    | "studio"
    | "draw"
    | "job"
    | "error"
    | "abandoned";
  at: string;
  [field: string]: unknown;
}

export type DraftRole = "person" | "planner" | "studio";

/** One entry of a draft's transcript, as the API reports it. */
export interface TranscriptEntry {
  seq: number;
  role: DraftRole;
  text: string;
  at: string;
  brief?: DraftBrief;
  pendingTopic?: PendingTopic;
  briefInvalid?: { field: string; message: string; retried: boolean };
  superseded?: boolean;
  internal?: boolean;
  interrupted?: boolean;
  costUsd?: number | null;
  costSource?: CostSource | null;
}

/** What `GET /api/drafts/{id}` answers. */
export interface DraftView {
  draftId: string;
  kind: "diagram";
  state: DraftState;
  source: string | null;
  title: string | null;
  transcript: TranscriptEntry[];
  brief: DraftBrief | null;
  pendingTopic: PendingTopic | null;
  jobId: string | null;
  turns: number;
  turnCap: number;
  costUsd: number | null;
  costSource: CostSource | null;
  inFlight: boolean;
  error: { kind: DraftErrorKind; message: string; field?: string } | null;
  created: string;
  updated: string;
  note: string;
}

/** A row of `GET /api/drafts`. */
export interface DraftSummaryView {
  draftId: string;
  kind: "diagram";
  state: DraftState;
  title: string | null;
  source: string | null;
  turns: number;
  costUsd: number | null;
  updated: string;
  jobId: string | null;
}

/** An SSE event: `id` only on the ones written to the transcript. */
export interface DraftStreamEvent {
  id?: number;
  event: string;
  data: unknown;
}

/** The opening line of every planner turn in `session.ndjson`, so a replay knows where a turn began. */
interface TurnMarker {
  type: "studio-turn";
  turn: number;
  at: string;
  retry?: boolean;
}

let writeCounter = 0;

async function atomicWrite(file: string, body: string): Promise<void> {
  writeCounter += 1;
  const temporary = `${file}.${process.pid}.${writeCounter}.tmp`;
  try {
    await writeFile(temporary, body, "utf8");
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

function sumCost(spend: readonly TurnSpend[]): { costUsd: number | null; costSource: CostSource | null } {
  const priced = spend.filter((entry) => entry.costUsd !== null);
  if (priced.length === 0) return { costUsd: null, costSource: null };
  const total = Math.round(priced.reduce((sum, entry) => sum + (entry.costUsd ?? 0), 0) * 1_000_000) / 1_000_000;
  return { costUsd: total, costSource: priced.some((entry) => entry.costSource === "stream") ? "stream" : "result" };
}

/** The refusal `POST /api/jobs` would give when the catalog cannot read the vocabulary. */
function vocabularyDown(error: unknown): JobRefused {
  return new JobRefused(
    503,
    `the topic list cannot be read and there is no cached copy, so a brief cannot be checked: ${(error as Error).message}`,
    { readAt: null, stale: true },
  );
}

/* -------------------------------------------------------------------------- */
/* The service                                                                */
/* -------------------------------------------------------------------------- */

export interface CreateInput {
  source?: string | null;
  idempotencyKey?: string | null;
}

export class Drafts {
  private readonly records = new Map<string, DraftRecord>();
  private readonly streams = new Map<string, EventEmitter>();
  /** One chain of writes per draft, so the record, the transcript and the mirror land in order. */
  private readonly chains = new Map<string, Promise<unknown>>();
  /** The planner process answering each draft, while one is. */
  private readonly running = new Map<string, PlannerRun>();
  /** The whole of each draft's current turn, for `settled`. */
  private readonly turnsInFlight = new Map<string, Promise<void>>();
  /** The reply so far, per draft, while a turn streams. Never written: a cache (rule 8). */
  private readonly live = new Map<string, { turn: number; text: string }>();
  /** Mirrors in flight, and whether another write arrived while one ran. */
  private readonly mirroring = new Map<string, { again: boolean; done: Promise<void> }>();
  /**
   * The Draw press in progress on each draft, with its key. Held from the
   * press to the job being recorded, so neither a planner turn nor a second
   * press can run beside it: a turn could otherwise move the draft while the
   * topic, the doctor and the enqueue are awaited, and a second press would
   * create the topic twice and queue a second job.
   */
  private readonly draws = new Map<string, { key: string; result: Promise<{ jobId: string; created: boolean }> }>();
  private draining = false;
  /** Creates in progress, by idempotency key, so two posts of one key make one draft. */
  private readonly creating = new Map<string, Promise<{ record: DraftRecord; created: boolean }>>();

  constructor(
    private readonly store: JobStore,
    private readonly runner: Runner,
  ) {
    store.onStateChange((record, from) => {
      // A draft that cannot be told is a draft whose record is behind, not a
      // job that failed: the job's own record is already written.
      void this.onJobState(record, from).catch((error: unknown) => {
        process.stderr.write(`draft ${record.draftId ?? "?"} could not follow job ${record.id}: ${(error as Error).message}\n`);
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Load and reconcile                                                 */
  /* ------------------------------------------------------------------ */

  /** Read every draft workspace back into memory. Called once, at start. */
  async load(): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(`${studioHome()}/drafts`);
    } catch {
      return;
    }
    for (const entry of entries) {
      try {
        const record = JSON.parse(await readFile(draftJsonPath(entry), "utf8")) as DraftRecord;
        if (record.id !== entry) continue;
        // `append` moves `seq` in memory and the next save writes it, so a
        // crash between the two leaves a record behind its own transcript.
        // The transcript is the authority on what was written.
        const seq = (await this.events(entry)).reduce((max, event) => Math.max(max, event.seq), record.seq);
        this.records.set(record.id, { ...record, seq });
      } catch {
        // A workspace with no readable record is one that was created and
        // never written, or one a person has been poking at: nothing to serve.
      }
    }
  }

  /**
   * C1: a turn whose runner died. The draft has a `message` with no `reply`,
   * so a `reply` marked interrupted is written with whatever text arrived,
   * the turn's cost is rebuilt from `session.ndjson` as a job's is, and the
   * draft is left `open`. Nothing is resent by itself (D15).
   */
  async reconcile(): Promise<string[]> {
    const interrupted: string[] = [];
    for (const record of this.records.values()) {
      if (record.inFlight === null) continue;
      const turn = record.inFlight;
      const { lines, startedAt, spawns } = await this.linesOfTurn(record.id, turn.turn);
      const events = await this.events(record.id);
      const replies = events.filter((event) => event.type === "reply" && event.turn === turn.turn);
      // The runner died after the last spawn's reply was written: nothing is
      // cut off, and a second reply would repeat it.
      const answered = spawns > 0 && replies.length >= spawns;
      // A brief that passed on this turn stays in force.
      const briefed = events.some(
        (event) => event.type === "brief" && replies.some((reply) => reply.seq === event.replySeq),
      );
      // A spawn whose spend was already written finished before the runner
      // died; only what came after it is unaccounted for. Asked of the spend
      // alone, never of whether a reply exists: `speak` saves the spend before
      // it appends the reply, but this pass appends its cut-off reply first,
      // so a crash between the two leaves an answered turn whose cost is still
      // to be counted, from the same stream lines, exactly once.
      const counted = record.spend.some((entry) => entry.startedAt === startedAt);
      const cost = costFromLog(lines.join("\n"), plannerModel());
      const spend: TurnSpend = {
        turn: turn.turn,
        startedAt: startedAt ?? turn.startedAt,
        finishedAt: new Date().toISOString(),
        costUsd: counted ? null : cost.usd,
        costSource: counted ? null : cost.source,
      };
      await this.write(record.id, async () => {
        if (!answered) {
          await this.append(record.id, {
            type: "reply",
            turn: turn.turn,
            text: replyText(lines),
            interrupted: true,
            costUsd: cost.usd,
            costSource: cost.source,
          });
        }
        const current = this.require(record.id);
        const nextSpend = counted || lines.length === 0 ? current.spend : [...current.spend, spend];
        await this.save(record.id, {
          inFlight: null,
          spend: nextSpend,
          ...sumCost(nextSpend),
          ...(answered
            ? {}
            : {
                errorKind: "interrupted" as const,
                error: "The reply was cut off: the studio stopped while the planner was answering.",
                errorField: null,
              }),
          ...(current.state === "briefed" && !briefed ? { state: "open" as const } : {}),
        });
      });
      interrupted.push(record.id);
    }
    return interrupted;
  }

  /**
   * The raw stream lines of a turn's last spawn (the retry, when there was
   * one), from its marker to the end, and when that spawn started.
   */
  private async linesOfTurn(
    id: string,
    turn: number,
  ): Promise<{ lines: string[]; startedAt: string | null; spawns: number }> {
    const body = await readFile(draftSessionLogPath(id), "utf8").catch(() => "");
    const lines = body.split("\n").filter((line) => line.trim() !== "");
    let start = -1;
    let startedAt: string | null = null;
    let spawns = 0;
    for (let i = 0; i < lines.length; i += 1) {
      const marker = safeJson(lines[i]!);
      if (marker?.type === "studio-turn" && marker.turn === turn) {
        start = i;
        spawns += 1;
        startedAt = typeof marker.at === "string" ? marker.at : null;
      }
    }
    return { lines: start === -1 ? [] : lines.slice(start + 1), startedAt, spawns };
  }

  /* ------------------------------------------------------------------ */
  /* Reads                                                              */
  /* ------------------------------------------------------------------ */

  get(id: string): DraftRecord | undefined {
    return this.records.get(id);
  }

  private require(id: string): DraftRecord {
    const record = this.records.get(id);
    if (record === undefined) throw new JobRefused(404, `no draft ${id}`, "This conversation is gone, or never existed.");
    return record;
  }

  list(filter: { state?: string; limit?: number } = {}): DraftSummaryView[] {
    return [...this.records.values()]
      .filter((record) => filter.state === undefined || record.state === filter.state)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, filter.limit ?? 50)
      .map((record) => ({
        draftId: record.id,
        kind: record.kind,
        state: record.state,
        title: record.title,
        source: record.source,
        turns: record.turns,
        costUsd: record.costUsd,
        updated: record.updatedAt,
        jobId: record.jobIds.at(-1) ?? null,
      }));
  }

  /** Every planner turn's spend, for the daily cap (D36). */
  spendEntries(): TurnSpend[] {
    return [...this.records.values()].flatMap((record) => record.spend);
  }

  /** How many planner turns are running right now. */
  get busy(): number {
    return this.running.size;
  }

  async events(id: string): Promise<TranscriptEvent[]> {
    const body = await readFile(draftTranscriptPath(id), "utf8").catch(() => "");
    return body
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => safeJson(line) as TranscriptEvent | null)
      .filter((event): event is TranscriptEvent => event !== null);
  }

  async view(id: string): Promise<DraftView> {
    const record = this.require(id);
    return {
      draftId: record.id,
      kind: record.kind,
      state: record.state,
      source: record.source,
      title: record.title,
      transcript: transcriptOf(await this.events(id)),
      brief: record.brief,
      pendingTopic: record.pendingTopic,
      jobId: record.jobIds.at(-1) ?? null,
      turns: record.turns,
      turnCap: PLANNER_TURNS,
      costUsd: record.costUsd,
      costSource: record.costSource,
      inFlight: record.inFlight !== null,
      error:
        record.errorKind === null
          ? null
          : {
              kind: record.errorKind,
              message: record.error ?? "",
              ...(record.errorField === undefined || record.errorField === null ? {} : { field: record.errorField }),
            },
      created: record.createdAt,
      updated: record.updatedAt,
      note: noteForDraft(record),
    };
  }

  /* ------------------------------------------------------------------ */
  /* Writes                                                             */
  /* ------------------------------------------------------------------ */

  /** Run `fn` after every earlier write to this draft, and before every later one. */
  private write<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(fn);
    this.chains.set(id, next.catch(() => undefined));
    return next;
  }

  /** Merge a patch into the record, write `draft.json`, then mirror it. Call inside `write`. */
  private async save(id: string, patch: Partial<DraftRecord>, options: { mirror?: boolean } = {}): Promise<DraftRecord> {
    const record = this.require(id);
    const next: DraftRecord = { ...record, ...patch, updatedAt: new Date().toISOString() };
    this.records.set(id, next);
    await mkdir(draftDir(id), { recursive: true });
    await atomicWrite(draftJsonPath(id), `${JSON.stringify(next, null, 1)}\n`);
    if (options.mirror !== false) this.mirror(id);
    this.publish(id, { event: "state", data: this.stateOf(next) });
    return next;
  }

  /** Append one transcript event, then tell whoever is listening. Call inside `write`. */
  private async append(id: string, event: Omit<TranscriptEvent, "seq" | "at">): Promise<TranscriptEvent> {
    const record = this.require(id);
    const full = { ...event, seq: record.seq + 1, at: new Date().toISOString() } as TranscriptEvent;
    this.records.set(id, { ...record, seq: full.seq });
    await appendFile(draftTranscriptPath(id), `${JSON.stringify(full)}\n`, "utf8");
    const streamed = streamEventOf(full);
    if (streamed !== null) this.publish(id, streamed);
    return full;
  }

  /**
   * Mirror the record into Postgres, coalesced: a write that lands while a
   * mirror runs asks for one more, and only the latest record is sent.
   */
  private mirror(id: string): void {
    const running = this.mirroring.get(id);
    if (running !== undefined) {
      running.again = true;
      return;
    }
    const state = { again: false, done: Promise.resolve() };
    state.done = (async () => {
      do {
        state.again = false;
        const result = await draftUpsert(draftJsonPath(id)).catch(
          (error: unknown): CatalogResult => ({ ok: false, json: null, error: (error as Error).message, offline: true }),
        );
        if (!result.ok) await this.noteCatalogError(id, result.error ?? "catalog draft upsert failed");
      } while (state.again);
    })().finally(() => this.mirroring.delete(id));
    this.mirroring.set(id, state);
  }

  /** Wait for any mirror of this draft to land. What a Draw needs before the job names it. */
  private async mirrored(id: string): Promise<void> {
    await this.mirroring.get(id)?.done;
  }

  private async noteCatalogError(id: string, message: string): Promise<void> {
    const record = this.records.get(id);
    if (record === undefined) return;
    await this.write(id, () => this.save(id, { catalogErrors: [...record.catalogErrors, message].slice(-20) }, { mirror: false }));
  }

  /** A STUDIO note: shown to the person as the runner speaking, and told to the planner on its next turn. */
  private async note(id: string, text: string, options: { deliver?: boolean } = {}): Promise<void> {
    await this.append(id, { type: "studio", text });
    if (options.deliver !== false) {
      const record = this.require(id);
      await this.save(id, { undelivered: [...record.undelivered, text] });
    }
  }

  private stateOf(record: DraftRecord): Record<string, unknown> {
    return {
      state: record.state,
      jobId: record.jobIds.at(-1) ?? null,
      inFlight: record.inFlight !== null,
      turns: record.turns,
      costUsd: record.costUsd,
      costSource: record.costSource,
    };
  }

  /* ------------------------------------------------------------------ */
  /* The stream                                                         */
  /* ------------------------------------------------------------------ */

  private stream(id: string): EventEmitter {
    let emitter = this.streams.get(id);
    if (emitter === undefined) {
      emitter = new EventEmitter();
      emitter.setMaxListeners(64);
      this.streams.set(id, emitter);
    }
    return emitter;
  }

  private publish(id: string, event: DraftStreamEvent): void {
    this.stream(id).emit("event", event);
  }

  /**
   * Replay every transcript event after `after` from disk, then follow. The
   * listener is attached before the file is read and the two are merged by
   * seq, so an event that lands during the read is sent once, not zero times
   * or twice. A turn in flight gets its reply so far straight after the
   * replay.
   */
  async subscribe(id: string, after: number, listener: (event: DraftStreamEvent) => void): Promise<() => void> {
    this.require(id);
    let lastSent = after;
    let replaying = true;
    const queued: DraftStreamEvent[] = [];
    const forward = (event: DraftStreamEvent): void => {
      if (replaying) {
        queued.push(event);
        return;
      }
      if (event.id !== undefined) {
        if (event.id <= lastSent) return;
        lastSent = event.id;
      }
      listener(event);
    };
    const emitter = this.stream(id);
    emitter.on("event", forward);
    for (const event of await this.events(id)) {
      if (event.seq <= after) continue;
      const streamed = streamEventOf(event);
      if (streamed === null) continue;
      lastSent = event.seq;
      listener(streamed);
    }
    replaying = false;
    for (const event of queued) forward(event);
    const live = this.live.get(id);
    if (live !== undefined) listener({ event: "delta", data: live });
    return () => emitter.off("event", forward);
  }

  /* ------------------------------------------------------------------ */
  /* Create                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * A new conversation: the record, the planner's whole system prompt and its
   * settings file, written once. With `source`, the diagram is checked out and
   * inspected first, which can take a Chromium launch, and its summary is the
   * EXTENDING block.
   */
  async create(input: CreateInput): Promise<{ record: DraftRecord; created: boolean }> {
    const key = input.idempotencyKey?.trim() || null;
    if (key === null) return this.createNew(input, null);
    if (key.length > 200) throw new JobRefused(400, `"idempotencyKey" is over 200 characters`, { field: "idempotencyKey" });
    const existing = [...this.records.values()].find((record) => record.idempotencyKey === key);
    if (existing !== undefined) return { record: existing, created: false };
    // Reserved before the first await: a second post of the same key while
    // the vocabulary, the corpus or an inspect is being read gets this draft.
    const pending = this.creating.get(key);
    if (pending !== undefined) return { record: (await pending).record, created: false };
    const made = this.createNew(input, key);
    this.creating.set(key, made);
    try {
      return await made;
    } finally {
      this.creating.delete(key);
    }
  }

  private async createNew(input: CreateInput, key: string | null): Promise<{ record: DraftRecord; created: boolean }> {
    const source = input.source?.trim() || null;
    if (source !== null && !isDiagramName(source)) {
      throw new JobRefused(400, `"${source}" is not a diagram name`, { field: "source" });
    }

    let vocabulary: Vocabulary;
    try {
      vocabulary = await loadVocabulary();
    } catch (error) {
      throw vocabularyDown(error);
    }
    const listing = await listDiagrams().catch(() => null);
    const corpus: CorpusEntry[] = (listing?.diagrams ?? []).map((diagram) => ({
      name: diagram.name,
      title: diagram.title,
      topic: diagram.topic,
      shapes: diagram.shapes,
    }));

    let extending: string | null = null;
    let sourceHash: string | null = null;
    let sourceRevision: number | null = null;
    if (source !== null) {
      // The same call an extend job makes before drawing (`execute` in
      // runner.ts): the checkout brought up to the latest revision unless it
      // holds uncommitted edits, so the planner and the job read one file.
      const checkout = await ensureCheckout(source, { canvasOpen: this.runner.canvasOpen(`learn/assets/${source}.tldr`) });
      if (checkout.failed) throw new JobRefused(502, checkout.note);
      if (!checkout.exists) throw new JobRefused(404, `no diagram ${source} in the catalog`, checkout.note);
      const inspected = await canvas(["inspect", checkout.path, "--json"], VERB_TIMEOUT_MS);
      if (inspected.code !== 0 && inspected.code !== 3) {
        throw new JobRefused(502, `${source} would not inspect, so the planner cannot be told what is in it`, {
          exitCode: inspected.code,
        });
      }
      const listed = corpus.find((entry) => entry.name === source);
      extending = drawingSummary(
        { slug: source, title: listed?.title ?? null, topic: listed?.topic ?? null, concepts: [] },
        (inspected.json ?? {}) as InspectReport,
      );
      sourceHash = await documentHashOf(checkout.path);
      sourceRevision = checkout.revision;
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const hash = vocabularyHash(vocabulary.entries);
    const record: DraftRecord = {
      id,
      kind: "diagram",
      state: "open",
      ownerId: studioOwner(),
      source,
      sourceHash,
      sourceRevision,
      title: null,
      plannerSessionId: randomUUID(),
      sessionStarted: false,
      transcriptPath: draftTranscriptRef(id),
      brief: null,
      briefAt: null,
      pendingTopic: null,
      turns: 0,
      costUsd: null,
      costSource: null,
      errorKind: null,
      error: null,
      errorField: null,
      idempotencyKey: key ?? `draft:${id}`,
      vocabularyHash: hash,
      seq: 0,
      inFlight: null,
      undelivered: [],
      spend: [],
      jobIds: [],
      catalogErrors: [],
      createdAt: now,
      updatedAt: now,
    };
    await mkdir(draftTmpDir(id), { recursive: true });
    // The record first, then the prompt, then the transcript: a crash between
    // leaves a draft with no system prompt, which the first turn writes.
    this.records.set(id, record);
    await this.write(id, async () => {
      await this.save(id, {});
      await writeFile(plannerSystemPath(id), buildSystemPrompt({ vocabulary: vocabulary.entries, corpus, extending }), "utf8");
      await writeFile(plannerSettingsPath(id), `${JSON.stringify(plannerSettings(), null, 1)}\n`, "utf8");
      await this.append(id, {
        type: "created",
        mode: source === null ? "new" : "extend",
        source,
        sourceHash,
        sourceRevision,
        vocabularyHash: hash,
        // The manual a Draw pressed now would start with, for the record.
        manualHash: this.runner.manual?.current()?.hash ?? null,
        corpus: corpus.length,
        corpusStale: listing?.stale ?? true,
      });
    });
    return { record: this.require(id), created: true };
  }

  /* ------------------------------------------------------------------ */
  /* A turn                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * A person's message. Refused with 409 while a turn is in flight or the
   * draft is drawing, 422 at the turn cap, 429 over the daily cap, and 503 when
   * every planner slot is busy. Otherwise the message is on disk before this
   * returns, and the turn runs on.
   */
  async send(id: string, rawText: unknown): Promise<{ seq: number }> {
    const record = this.require(id);
    const text = typeof rawText === "string" ? rawText.trim() : "";
    if (text === "") throw new JobRefused(400, `"text" is required: a message with nothing in it`, { field: "text" });
    if (text.length > TEXT_LIMIT) {
      throw new JobRefused(400, `the message is ${text.length} characters and the cap is ${TEXT_LIMIT}`, {
        field: "text",
        limit: TEXT_LIMIT,
      });
    }
    if (record.turns >= PLANNER_TURNS) {
      throw new JobRefused(422, `This conversation has reached its ${PLANNER_TURNS}-turn limit.`, {
        reason: "turn-cap",
        turns: record.turns,
        turnCap: PLANNER_TURNS,
      });
    }
    if (record.state === "abandoned") {
      throw new JobRefused(409, "this conversation was closed. Start a new one.", { reason: "abandoned" });
    }
    if (record.inFlight !== null || this.turnsInFlight.has(id)) {
      throw new JobRefused(409, "the planner is still answering the last message", { reason: "in-flight" });
    }
    if (this.draws.has(id)) {
      throw new JobRefused(409, "Draw was just pressed on this conversation; wait for the drawing to be queued", {
        reason: "draw-in-progress",
      });
    }
    if (record.state === "drawing") {
      throw new JobRefused(409, "a drawing from this conversation is in progress: wait for the drawing, or cancel it", {
        reason: "drawing",
        jobId: record.jobIds.at(-1) ?? null,
      });
    }
    // The job cap's own refusal, body and all: spend is spend (D36).
    this.runner.assertUnderCap();
    if (this.turnsInFlight.size >= PLANNER_CONCURRENCY) {
      throw new JobRefused(503, `every planner slot is busy (${PLANNER_CONCURRENCY}); try again in a few seconds`, {
        reason: "planner-busy",
        concurrency: PLANNER_CONCURRENCY,
      });
    }
    if (this.draining) throw new JobRefused(503, "the studio is shutting down", { reason: "shutdown" });

    let seq = 0;
    const turn = this.write(id, async () => {
      const message = await this.append(id, { type: "message", text });
      seq = message.seq;
      const current = this.require(id);
      await this.save(id, {
        turns: current.turns + 1,
        inFlight: { turn: message.seq, startedAt: message.at },
        errorKind: null,
        error: null,
        errorField: null,
        // Another diagram after a finished one opens the conversation again.
        ...(current.state === "done" ? { state: "open" as const } : {}),
      });
    });
    // Registered synchronously, so a second message in the same tick is 409.
    const whole = turn
      .then(() => this.converse(id, seq, text))
      .catch(async (error: unknown) => {
        await this.write(id, () =>
          this.recordError(id, "agent", `the studio failed while running this turn: ${(error as Error).message}`),
        );
      })
      .finally(async () => {
        this.live.delete(id);
        await this.write(id, () => this.save(id, { inFlight: null })).catch(() => undefined);
        this.turnsInFlight.delete(id);
        this.maybeCapTurns(id);
      });
    this.turnsInFlight.set(id, whole);
    await turn;
    return { seq };
  }

  /** Resolves once the draft's current turn, and every write it queued, has landed. */
  async settled(id: string): Promise<void> {
    await this.turnsInFlight.get(id);
    await this.chains.get(id);
    await this.mirroring.get(id)?.done;
  }

  /** The turn cap reached with no brief to draw: the conversation is closed (E4). */
  private maybeCapTurns(id: string): void {
    const record = this.records.get(id);
    if (record === undefined || record.turns < PLANNER_TURNS || record.state !== "open") return;
    void this.write(id, async () => {
      await this.append(id, { type: "abandoned", by: "turn-cap" });
      await this.save(id, { state: "abandoned" });
    }).catch(() => undefined);
  }

  private async recordError(id: string, kind: DraftErrorKind, message: string, field?: string): Promise<void> {
    await this.append(id, { type: "error", kind, message, ...(field === undefined ? {} : { field }) });
    await this.save(id, { errorKind: kind, error: message.slice(0, 1_000), errorField: field ?? null });
  }

  /** One person turn: the planner's reply, then the verdict on any brief in it, with at most one retry. */
  private async converse(id: string, turn: number, text: string): Promise<void> {
    const record = this.require(id);
    const prompt = [...record.undelivered.map(studioMessage), text].join("\n\n");
    if (record.undelivered.length > 0) await this.write(id, () => this.save(id, { undelivered: [] }));

    const first = await this.speak(id, turn, prompt, false);
    if (first === null) return;
    const verdict = await this.judge(first.text);
    if (verdict.kind !== "invalid") return this.write(id, () => this.settle(id, first.seq, verdict));

    const retry = this.require(id).turns < PLANNER_TURNS && this.records.get(id)?.state !== "abandoned";
    await this.write(id, async () => {
      await this.append(id, {
        type: "brief-invalid",
        replySeq: first.seq,
        field: verdict.field,
        message: verdict.message,
        retried: retry,
      });
      if (!retry) await this.refusedTwice(id, verdict);
    });
    if (!retry) return;

    const instruction =
      `Your brief was refused. ${verdict.field}: ${verdict.message}\n` +
      `Fix exactly that and send the whole brief again, with the same summary above it.`;
    await this.write(id, async () => {
      await this.append(id, { type: "studio", text: instruction, internal: true, replySeq: first.seq });
      // The automatic retry counts as a turn (the doc's cost table).
      await this.save(id, { turns: this.require(id).turns + 1 });
    });
    const second = await this.speak(id, turn, studioMessage(instruction), true);
    if (second === null) return;
    const again = await this.judge(second.text);
    if (again.kind !== "invalid") return this.write(id, () => this.settle(id, second.seq, again));
    await this.write(id, async () => {
      await this.append(id, {
        type: "brief-invalid",
        replySeq: second.seq,
        field: again.field,
        message: again.message,
        retried: false,
      });
      await this.refusedTwice(id, again);
    });
  }

  /** E6: the second refusal is shown, not retried. */
  private async refusedTwice(id: string, verdict: { field: string; message: string }): Promise<void> {
    await this.recordError(
      id,
      "brief-invalid",
      `The planner's brief did not pass the studio's checks twice. ${verdict.field}: ${verdict.message}`,
      verdict.field,
    );
    if (this.require(id).state === "briefed") await this.save(id, { state: "open" });
  }

  /** A reply with no refusal: a new brief in force, or none, which ends any older one. */
  private async settle(id: string, replySeq: number, verdict: BriefVerdict): Promise<void> {
    const record = this.require(id);
    if (record.state === "abandoned") return;
    if (verdict.kind === "none") {
      // A reply that asks rather than proposes leaves no brief in force. The
      // last one stays on the record, for "Fill the brief myself".
      if (record.state === "briefed") await this.save(id, { state: "open" });
      return;
    }
    if (verdict.kind !== "valid") return;
    if (record.state === "done") await this.save(id, { state: "open" });
    await this.append(id, { type: "brief", replySeq, brief: verdict.brief, pendingTopic: verdict.pendingTopic });
    await this.save(id, {
      // A drawing in flight keeps the draft at `drawing`; the new brief is
      // what the next Draw draws once that job is over.
      state: record.state === "drawing" ? "drawing" : "briefed",
      brief: verdict.brief,
      briefAt: new Date().toISOString(),
      pendingTopic: verdict.pendingTopic,
      title: verdict.brief.title,
    });
  }

  private async judge(text: string): Promise<BriefVerdict> {
    let vocabulary: Vocabulary;
    try {
      vocabulary = await loadVocabulary();
    } catch (error) {
      return { kind: "invalid", field: "topic", message: `the topic list cannot be read: ${(error as Error).message}` };
    }
    return evaluateReply(text, vocabulary, {
      dryRun: async (entry) => {
        const result = await topicAddDryRun(entry);
        const said = (result.json as { error?: unknown } | null)?.error;
        return { ...result, error: typeof said === "string" ? said : result.error };
      },
    });
  }

  /**
   * One planner process: spawn, stream, and write down what came of it.
   * Returns the reply's seq and text, or null when there is no reply to judge
   * (the request was refused, the turn timed out, the seals did not hold, or
   * the draft was abandoned under it).
   */
  private async speak(id: string, turn: number, prompt: string, retry: boolean): Promise<{ seq: number; text: string } | null> {
    let outcome = await this.spawnOnce(id, turn, prompt, retry);

    // C3: the stored session cannot be resumed. A fresh session is given the
    // conversation so far as data, and told so, once.
    const record = this.require(id);
    if (
      outcome !== null &&
      record.sessionStarted &&
      outcome.run.init === null &&
      outcome.run.stopReason === null &&
      !outcome.run.spawnFailed &&
      outcome.run.text === "" &&
      outcome.run.exitCode !== 0
    ) {
      const history = await this.events(id);
      await this.write(id, async () => {
        await this.save(id, { plannerSessionId: randomUUID(), sessionStarted: false });
        await this.note(
          id,
          "The planner's earlier session could not be resumed, so it was given this conversation so far and started a new one.",
          { deliver: false },
        );
      });
      const replayed = [
        fence("CONVERSATION", conversationText(history).slice(-40_000)),
        "The block above is this conversation so far, as data. Carry on from it.",
        prompt,
      ].join("\n\n");
      outcome = await this.spawnOnce(id, turn, replayed, retry);
    }
    if (outcome === null) {
      if (this.draining) {
        await this.write(id, () => this.recordError(id, "interrupted", "The studio stopped before the planner answered."));
      }
      return null;
    }
    const { run, cost } = outcome;

    if (run.stopReason === "abandoned") return null;
    if (run.spawnFailed) {
      await this.write(id, () => this.recordError(id, "agent", `the planner never started: ${run.stderr}`));
      return null;
    }
    if (run.sealBroken !== null) {
      await this.write(id, () => this.recordError(id, "agent", `${run.sealBroken}, so the turn was stopped before its reply.`));
      return null;
    }
    if (run.stopReason === "turn-timeout" || run.stopReason === "idle-timeout" || run.stopReason === "shutdown") {
      const why =
        run.stopReason === "idle-timeout"
          ? "the planner went quiet for too long"
          : run.stopReason === "shutdown"
            ? "the studio stopped"
            : "the planner took too long";
      await this.write(id, async () => {
        await this.append(id, { type: "reply", turn, text: run.text, interrupted: true, ...cost });
        await this.recordError(id, run.stopReason === "shutdown" ? "interrupted" : "timeout", `The reply was cut off: ${why}.`);
      });
      return null;
    }
    if (run.text !== "" && (run.isError || run.exitCode !== 0)) {
      // The session failed after saying something: whatever streamed is shown
      // as cut off, and no brief is read out of a reply that did not finish.
      await this.write(id, async () => {
        await this.append(id, { type: "reply", turn, text: run.text, interrupted: true, ...cost });
        await this.recordError(
          id,
          "agent",
          run.result ?? (run.stderr || `the planner's session failed (${run.subtype ?? `exit ${run.exitCode ?? run.signal}`})`),
        );
      });
      return null;
    }
    if (run.text === "") {
      // E1: the first request was refused, or the session ended with nothing
      // to say. The API's own sentence is the one a person can act on.
      await this.write(id, () =>
        this.recordError(
          id,
          "agent",
          run.result ?? (run.stderr || `the planner's session ended with no reply (${run.subtype ?? `exit ${run.exitCode}`})`),
        ),
      );
      return null;
    }
    return this.write(id, async () => {
      const reply = await this.append(id, { type: "reply", turn, text: run.text, ...cost, ...(retry ? { retry: true } : {}) });
      return { seq: reply.seq, text: run.text };
    });
  }

  /** Spawn and wait. Records the turn's spend whatever happened. */
  private async spawnOnce(
    id: string,
    turn: number,
    prompt: string,
    retry: boolean,
  ): Promise<{ run: PlannerOutcome; cost: { costUsd: number | null; costSource: CostSource | null } } | null> {
    const record = this.require(id);
    // Every spawn asks, the retry and the C3 respawn included: a shutdown
    // that began between two spawns of one turn must not start a paid one.
    if (record.state === "abandoned" || this.draining) return null;
    const startedAt = new Date().toISOString();
    const marker: TurnMarker = { type: "studio-turn", turn, at: startedAt, ...(retry ? { retry: true } : {}) };
    let logChain: Promise<void> = appendFile(draftSessionLogPath(id), `${JSON.stringify(marker)}\n`, "utf8");
    const meter = new JobCostMeter(plannerModel());
    let systemPrompt = await readFile(plannerSystemPath(id), "utf8").catch(() => null);
    if (systemPrompt === null) {
      // A crash between the record and the prompt at creation: write it now,
      // from what the studio knows today.
      const vocabulary = await loadVocabulary();
      systemPrompt = buildSystemPrompt({ vocabulary: vocabulary.entries, corpus: [] });
      await writeFile(plannerSystemPath(id), systemPrompt, "utf8");
      await writeFile(plannerSettingsPath(id), `${JSON.stringify(plannerSettings(), null, 1)}\n`, "utf8");
    }
    const argv = plannerArgv({
      systemPrompt,
      settingsFile: plannerSettingsPath(id),
      sessionId: record.plannerSessionId,
      resume: record.sessionStarted,
      model: plannerModel(),
    });
    const live = { turn, text: "" };
    this.live.set(id, live);
    const run = startPlanner({
      argv,
      prompt,
      cwd: draftDir(id),
      auth: agentAuth(),
      tmp: draftTmpDir(id),
      onLine: (line) => {
        meter.observe(line);
        logChain = logChain.then(() => appendFile(draftSessionLogPath(id), `${line}\n`, "utf8")).catch(() => undefined);
      },
      onDelta: (text) => {
        live.text = text;
        this.publish(id, { event: "delta", data: { turn, text } });
      },
      onInit: () => {
        if (!this.require(id).sessionStarted) {
          void this.write(id, () => this.save(id, { sessionStarted: true })).catch(() => undefined);
        }
      },
    });
    this.running.set(id, run);
    let outcome: PlannerOutcome;
    try {
      outcome = await run.done;
    } finally {
      this.running.delete(id);
    }
    await logChain;
    const reading = meter.read();
    const spend: TurnSpend = {
      turn,
      startedAt,
      finishedAt: new Date().toISOString(),
      costUsd: reading.usd,
      costSource: reading.source,
    };
    await this.write(id, async () => {
      const current = this.require(id);
      const nextSpend = [...current.spend, spend];
      await this.save(id, { spend: nextSpend, ...sumCost(nextSpend) });
    });
    return { run: outcome, cost: { costUsd: reading.usd, costSource: reading.source } };
  }

  /* ------------------------------------------------------------------ */
  /* Draw                                                               */
  /* ------------------------------------------------------------------ */

  /**
   * The person pressed Draw. With a proposed topic the press creates it first
   * (`catalog topic add`, the person as author and the draft in the reason),
   * then the stored brief goes through the job path byte for byte: the
   * vocabulary as it is now, the doctor, the lease, the mode check and the
   * cap, all in `runner.enqueue`. Every refusal lands as a STUDIO note (E7)
   * and the draft stays `briefed`.
   */
  async draw(id: string, idempotencyKey: unknown): Promise<{ jobId: string; created: boolean }> {
    const record = this.require(id);
    const key = typeof idempotencyKey === "string" && idempotencyKey.trim() !== "" ? idempotencyKey.trim() : null;
    if (key === null) throw new JobRefused(400, `"idempotencyKey" is required: it is what makes a second press safe`, { field: "idempotencyKey" });
    if (key.length > 200) throw new JobRefused(400, `"idempotencyKey" is over 200 characters`, { field: "idempotencyKey" });
    const jobKey = `draft:${id}:${key}`;
    // A repeated press answers with the job the first one made, whether that
    // press is over or still running.
    const repeated = this.store.byIdempotencyKey(jobKey);
    if (repeated !== undefined && repeated.draftId === id) return { jobId: repeated.id, created: false };
    const pressing = this.draws.get(id);
    if (pressing !== undefined) {
      if (pressing.key !== jobKey) {
        throw new JobRefused(409, "Draw was just pressed on this conversation; wait for the drawing to be queued", {
          reason: "draw-in-progress",
        });
      }
      const first = await pressing.result;
      return { jobId: first.jobId, created: false };
    }
    if (record.inFlight !== null || this.turnsInFlight.has(id)) {
      throw new JobRefused(409, "the planner is still answering; Draw once its reply is in", { reason: "in-flight" });
    }
    if (record.state !== "briefed" || record.brief === null) {
      throw new JobRefused(
        409,
        record.state === "drawing"
          ? "this conversation's drawing is already in progress"
          : `there is no brief to draw: the conversation is ${record.state}`,
        { reason: "not-briefed", state: record.state },
      );
    }
    // Registered before the first await, so a turn or a second press in the
    // same tick sees it.
    const result = this.pressDraw(id, jobKey);
    this.draws.set(id, { key: jobKey, result });
    try {
      return await result;
    } finally {
      this.draws.delete(id);
    }
  }

  private async pressDraw(id: string, jobKey: string): Promise<{ jobId: string; created: boolean }> {
    try {
      return await this.drawBriefed(id, jobKey);
    } catch (error) {
      if (error instanceof JobRefused) {
        await this.write(id, async () => {
          await this.append(id, { type: "draw", refused: { status: error.status, error: error.message, detail: error.detail } });
          await this.note(id, `Draw was refused: ${error.message}`);
        });
      }
      throw error;
    }
  }

  private async drawBriefed(id: string, jobKey: string): Promise<{ jobId: string; created: boolean }> {
    const record = this.require(id);
    const brief = record.brief!;
    const pending = record.pendingTopic;

    if (pending !== null && studioOwner() !== LOCAL_LEARNER_ID) {
      // C16: `catalog topic add` writes as the catalog CLI's owner, `local`,
      // and takes no `--owner` yet, so another owner's topic would be filed
      // under `local`. Refused before anything is written; a brief on a topic
      // that exists still draws.
      throw new JobRefused(
        409,
        `this studio serves an owner other than "${LOCAL_LEARNER_ID}", and a new topic can only be created ` +
          `as "${LOCAL_LEARNER_ID}" until \`catalog topic add\` takes an owner. Nothing was written. Ask the planner ` +
          `for a brief under a topic that exists, or add "${pending.entry.slug}" by hand.`,
        { reason: "topic-owner", topic: pending.entry.slug },
      );
    }

    // Everything the enqueue would refuse on is asked first, so a press that
    // can only fail leaves no topic behind: the doctor (A8), the brief against
    // the vocabulary (widened with a proposed topic, in memory), the lease,
    // the mode against what exists, and the cap. The enqueue asks again, and
    // the catalog can still refuse in a race with another process taking the
    // target; a topic created just before that refusal stays, and the next
    // press draws under it.
    const checked = await doctor();
    if (checked.code !== 0) {
      throw new JobRefused(503, "tldrawkc cannot run on this machine, so nothing was queued", {
        doctor: doctorChecks(checked).filter((check) => check.status !== "pass"),
        fix: ["git submodule update --init tools/tldrawkc", "(cd tools/tldrawkc && npm ci && npm run build)"],
      });
    }
    // C8: a flowchart the person pasted rides along, never through the planner.
    const mermaid = await this.latestMermaid(id);
    const posted = { ...brief, ...(mermaid === null ? {} : { mermaid }), idempotencyKey: jobKey };
    const check = async (widen: PendingTopic | null): Promise<ValidBrief> => {
      let vocabulary: Vocabulary;
      try {
        vocabulary = await loadVocabulary();
      } catch (error) {
        throw vocabularyDown(error);
      }
      if (widen !== null && !vocabulary.topics.has(widen.entry.slug)) {
        vocabulary = {
          ...vocabulary,
          topics: new Map([...vocabulary.topics, [widen.entry.slug, { title: widen.entry.title, concepts: [] }]]),
        };
      }
      try {
        return validateBrief(posted, vocabulary);
      } catch (error) {
        if (error instanceof BriefError) throw new JobRefused(400, error.message, { field: error.field });
        throw error;
      }
    };
    await check(pending);
    await this.runner.admit(brief);

    if (pending !== null) await this.createTopic(id, pending);
    const valid = await check(null);

    // The row the job's `draft_id` names has to be there first. A mirror that
    // failed while Postgres was down left no row, and nothing since may have
    // asked for another, so this one is fresh rather than awaited.
    await this.chains.get(id);
    await this.mirrored(id);
    const row = await draftUpsert(draftJsonPath(id)).catch(
      (error: unknown): CatalogResult => ({ ok: false, json: null, error: (error as Error).message, offline: true }),
    );
    if (!row.ok) await this.noteCatalogError(id, row.error ?? "catalog draft upsert failed");

    const { record: job, created } = await this.runner.enqueue(valid, undefined, { draftId: id });
    await this.markDrawing(id, job.id);
    return { jobId: job.id, created };
  }

  /** The Draw press's topic: created, or the reason it could not be. */
  private async createTopic(id: string, pending: PendingTopic): Promise<void> {
    const added = await topicAdd(pending.entry, `Create topic and draw, from studio draft ${id}`);
    if (added.ok) {
      await this.write(id, async () => {
        await this.save(id, { pendingTopic: null });
        await this.note(id, `Created the topic "${pending.entry.title}" (${pending.entry.slug}).`);
      });
      return;
    }
    const said = (added.json as { error?: unknown } | null)?.error;
    const message = typeof said === "string" ? said : (added.error ?? "catalog topic add failed");
    if (added.offline) {
      throw new JobRefused(503, `the catalog cannot be reached, so the topic cannot be created: ${message}`, {
        reason: "catalog-unreachable",
      });
    }
    if (/already exists|exists and is archived/.test(message)) {
      // C4: someone created it in the meantime. If the brief passes against
      // the vocabulary as it is now, the pending topic is simply done with.
      let cleared = false;
      try {
        validateBrief({ ...this.require(id).brief }, await loadVocabulary());
        cleared = true;
      } catch {
        cleared = false;
      }
      if (cleared) {
        await this.write(id, async () => {
          await this.save(id, { pendingTopic: null });
          await this.note(id, `The topic "${pending.entry.slug}" exists now, so the next Draw draws under it.`);
        });
      }
      throw new JobRefused(409, message, { reason: "topic-exists", pendingTopicCleared: cleared });
    }
    throw new JobRefused(400, message, { reason: "topic-add", field: "topic" });
  }

  /** The latest fenced mermaid block in the person's own messages, or null (C8). */
  private async latestMermaid(id: string): Promise<string | null> {
    const events = await this.events(id);
    for (const event of [...events].reverse()) {
      if (event.type !== "message" || typeof event.text !== "string") continue;
      const blocks = mermaidBlocks(event.text);
      if (blocks.length > 0) return blocks.at(-1)!;
    }
    return null;
  }

  /**
   * A `POST /api/jobs` naming this draft: refused unless the draft could draw
   * (it exists, it is `briefed`, and no turn or press is running on it), and
   * then held as a press would be until `release` is called, so nothing can
   * move the draft while that job is queued.
   */
  claimForJob(id: string): () => void {
    const record = this.require(id);
    if (record.state !== "briefed") {
      throw new JobRefused(409, `draft ${id} is ${record.state}, and only a briefed draft can start a job`, {
        reason: "not-briefed",
        state: record.state,
      });
    }
    if (record.inFlight !== null || this.turnsInFlight.has(id)) {
      throw new JobRefused(409, "the planner is still answering on this draft", { reason: "in-flight" });
    }
    if (this.draws.has(id)) {
      throw new JobRefused(409, "Draw was just pressed on this conversation", { reason: "draw-in-progress" });
    }
    let release: () => void = () => undefined;
    const held = new Promise<{ jobId: string; created: boolean }>((resolve) => {
      release = () => resolve({ jobId: "", created: false });
    });
    this.draws.set(id, { key: `job-route:${randomUUID()}`, result: held });
    return () => {
      release();
      this.draws.delete(id);
    };
  }

  /**
   * A job was queued for this draft: it is drawing now. Also the Resume and
   * Revise of a draft's job, which carry its draft.
   *
   * The job can already be over by the time this runs: `runner.enqueue`
   * starts it, and a spawn that fails or a cancel can finish it before the
   * draft records its id, when `onJobState` still ignores it as not the
   * draft's newest. So once the id is recorded, the job's state as it is now
   * is applied too.
   */
  async markDrawing(id: string, jobId: string): Promise<void> {
    await this.write(id, async () => {
      const record = this.require(id);
      if (!record.jobIds.includes(jobId)) {
        await this.append(id, { type: "draw", jobId });
        await this.save(id, {
          state: canTransition(DRAFT_TRANSITIONS, record.state, "drawing") ? "drawing" : record.state,
          jobIds: [...record.jobIds, jobId],
        });
      }
      const job = this.store.get(jobId);
      if (job !== undefined) await this.applyJob(id, job);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Following the job                                                  */
  /* ------------------------------------------------------------------ */

  /**
   * After a start: bring every draft up to its jobs, which the runner's own
   * reconcile has already moved (a job it found running is `interrupted`)
   * before any draft was listening. A job that names a draft the draft never
   * recorded (the runner died between the enqueue and `markDrawing`) is
   * recorded now, and the newest job's state is applied.
   */
  async syncFromJobs(): Promise<void> {
    for (const record of [...this.records.values()]) {
      const jobs = this.store
        .list()
        .filter((job) => job.draftId === record.id)
        .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
      if (jobs.length === 0) continue;
      await this.write(record.id, async () => {
        const current = this.require(record.id);
        const missing = jobs.filter((job) => !current.jobIds.includes(job.id)).map((job) => job.id);
        if (missing.length > 0) await this.save(record.id, { jobIds: [...current.jobIds, ...missing] });
        const newest = this.store.get(this.require(record.id).jobIds.at(-1) ?? "");
        if (newest === undefined) return;
        const now = this.require(record.id);
        if (ACTIVE_JOB.includes(newest.state) && now.state !== "drawing" && canTransition(DRAFT_TRANSITIONS, now.state, "drawing")) {
          await this.save(record.id, { state: "drawing" });
        }
        await this.applyJob(record.id, newest);
      });
    }
  }

  /**
   * `drawing` follows the job. A failed, cancelled or interrupted drawing puts
   * the draft back at `briefed` with what went wrong as a STUDIO note, because
   * the next useful thing is to talk about it (an interrupted one can still be
   * resumed from the job, which moves the draft back to `drawing`); an
   * accepted or discarded one is `done`, and an accept tells the planner the
   * diagram now exists and what was drawn.
   */
  private async onJobState(job: JobRecord, from: string): Promise<void> {
    void from;
    const id = job.draftId;
    if (id === null || id === undefined || !this.records.has(id)) return;
    await this.write(id, () => this.applyJob(id, job));
  }

  /** Act on a job's state, once per verdict, if it is the draft's newest job. Call inside `write`. */
  private async applyJob(id: string, job: JobRecord): Promise<void> {
    const current = this.require(id);
    if (current.jobIds.at(-1) !== job.id || !JOB_VERDICTS.includes(job.state)) return;
    if (current.followed?.jobId === job.id && current.followed.state === job.state) return;
    await this.append(id, { type: "job", jobId: job.id, state: job.state });
    const followed = { jobId: job.id, state: job.state };
    if (job.state === "failed" || job.state === "cancelled" || job.state === "interrupted") {
      const findings = job.gate?.findings ?? [];
      const what =
        job.state === "failed" ? "failed" : job.state === "cancelled" ? "was cancelled" : "was interrupted: the studio stopped while it ran";
      await this.note(
        id,
        `The drawing of ${job.slug} ${what}. ` +
          (job.state === "interrupted"
            ? "Resume it from the job, or press Draw again."
            : `${findings.length > 0 ? findings.join(" ") : (job.error ?? "no reason recorded")} ` +
              `The brief is unchanged; say what to change, or press Draw again.`),
      );
      const now = this.require(id);
      await this.save(id, { followed, ...(now.state === "drawing" ? { state: "briefed" as const } : {}) });
      return;
    }
    await this.note(id, job.state === "accepted" ? acceptedNote(job) : `The drawing of ${job.slug} was discarded; nothing landed.`);
    const now = this.require(id);
    await this.save(id, { followed, ...(now.state === "drawing" ? { state: "done" as const } : {}) });
  }

  /* ------------------------------------------------------------------ */
  /* Abandon and shutdown                                               */
  /* ------------------------------------------------------------------ */

  async abandon(id: string): Promise<DraftRecord> {
    const record = this.require(id);
    if (record.state === "abandoned") return record;
    if (!canTransition(DRAFT_TRANSITIONS, record.state, "abandoned")) {
      throw new JobRefused(
        409,
        record.state === "drawing"
          ? "a drawing from this conversation is in progress; cancel or review it first"
          : `a ${record.state} conversation cannot be abandoned`,
        { reason: record.state, state: record.state },
      );
    }
    // Stops an in-flight turn first.
    await this.running.get(id)?.stop("abandoned");
    await this.write(id, async () => {
      await this.append(id, { type: "abandoned", by: "person" });
      await this.save(id, { state: "abandoned" });
    });
    return this.require(id);
  }

  /** Stop every planner turn. Their replies are written as cut off. */
  async drain(): Promise<void> {
    this.draining = true;
    for (const run of this.running.values()) await run.stop("shutdown");
    await Promise.all([...this.turnsInFlight.values()].map((turn) => turn.catch(() => undefined)));
  }
}

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/** Job states a draft acts on: the verdicts, and a job the runner died under. */
const JOB_VERDICTS: readonly string[] = ["failed", "cancelled", "interrupted", "accepted", "discarded"];

/** Job states that hold the draft at `drawing`. */
const ACTIVE_JOB: readonly string[] = ["queued", "running", "awaiting_review"];

function safeJson(line: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The text a set of raw stream lines carries: the result, else the assistant's, else the deltas. */
export function replyText(lines: readonly string[]): string {
  let streamed = "";
  let assistant = "";
  let result: string | null = null;
  for (const line of lines) {
    const event = safeJson(line);
    if (event === null) continue;
    if (event.type === "stream_event") {
      const inner = event.event as Record<string, unknown> | undefined;
      const delta = inner?.delta as Record<string, unknown> | undefined;
      if (inner?.type === "content_block_delta" && delta?.type === "text_delta" && typeof delta.text === "string") {
        streamed += delta.text;
      }
    } else if (event.type === "assistant") {
      const content = (event.message as { content?: unknown } | undefined)?.content;
      if (Array.isArray(content)) {
        for (const block of content as { type?: unknown; text?: unknown }[]) {
          if (block.type === "text" && typeof block.text === "string") assistant += block.text;
        }
      }
    } else if (event.type === "result" && event.is_error !== true && typeof event.result === "string") {
      result = event.result;
    }
  }
  return (result ?? (assistant || streamed)).trim();
}

/** The SSE form of a transcript event, or null for one the stream does not carry. */
function streamEventOf(event: TranscriptEvent): DraftStreamEvent | null {
  switch (event.type) {
    case "message":
    case "reply":
    case "studio": {
      const entry = entryOf(event);
      return entry === null ? null : { id: event.seq, event: event.type, data: entry };
    }
    case "brief":
      return {
        id: event.seq,
        event: "brief",
        data: { seq: event.seq, replySeq: event.replySeq, brief: event.brief, pendingTopic: event.pendingTopic ?? null },
      };
    case "brief-invalid":
      return {
        id: event.seq,
        event: "brief-invalid",
        data: { seq: event.seq, replySeq: event.replySeq, field: event.field, message: event.message, retried: event.retried },
      };
    case "error":
      return {
        id: event.seq,
        event: "error",
        data: {
          seq: event.seq,
          kind: event.kind,
          message: event.message,
          ...(event.field === undefined ? {} : { field: event.field }),
        },
      };
    default:
      return null;
  }
}

function entryOf(event: TranscriptEvent): TranscriptEntry | null {
  const text = typeof event.text === "string" ? event.text : "";
  switch (event.type) {
    case "message":
      return { seq: event.seq, role: "person", text, at: event.at };
    case "reply":
      return {
        seq: event.seq,
        role: "planner",
        text,
        at: event.at,
        ...(event.interrupted === true ? { interrupted: true } : {}),
        costUsd: typeof event.costUsd === "number" ? event.costUsd : null,
        costSource: (event.costSource as CostSource | null | undefined) ?? null,
      };
    case "studio":
      return { seq: event.seq, role: "studio", text, at: event.at, ...(event.internal === true ? { internal: true } : {}) };
    default:
      return null;
  }
}

/** The transcript as the API reports it: person, planner and studio turns, each reply carrying its verdict. */
export function transcriptOf(events: readonly TranscriptEvent[]): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  const bySeq = new Map<number, TranscriptEntry>();
  for (const event of events) {
    const entry = entryOf(event);
    if (entry !== null) {
      entries.push(entry);
      bySeq.set(entry.seq, entry);
      continue;
    }
    const reply = typeof event.replySeq === "number" ? bySeq.get(event.replySeq) : undefined;
    if (reply === undefined) continue;
    if (event.type === "brief") {
      reply.brief = event.brief as DraftBrief;
      if (event.pendingTopic !== null && event.pendingTopic !== undefined) reply.pendingTopic = event.pendingTopic as PendingTopic;
    } else if (event.type === "brief-invalid") {
      const retried = event.retried === true;
      reply.briefInvalid = { field: String(event.field), message: String(event.message), retried };
      if (retried) reply.superseded = true;
    }
  }
  return entries;
}

/** The conversation as plain text, for a fresh session that could not resume the old one (C3). */
function conversationText(events: readonly TranscriptEvent[]): string {
  return transcriptOf(events)
    .filter((entry) => entry.superseded !== true && entry.internal !== true)
    .map((entry) => `${entry.role}: ${entry.text}`)
    .join("\n\n");
}

/**
 * The STUDIO note after an accept: the verdict, the slug, and what the gate
 * held the drawing to. The gate checked every element label against a drawn
 * shape and every relation against a binding, so the brief's lists are what
 * the drawing is known to contain. Capped like the EXTENDING block.
 */
export function acceptedNote(job: JobRecord): string {
  const lines = [
    `The diagram "${job.brief.title}" was accepted and saved as ${job.slug}, under ${job.topic}.`,
    `It exists now, so a change to it is an extend brief on the slug ${job.slug}. What the gate found in the drawing:`,
    "labels:",
    ...job.brief.elements.map((element) => `  ${element.label}`),
    "arrows:",
    ...job.brief.relations.map((relation) => `  ${relation.from} -> ${relation.to}${relation.label === undefined ? "" : ` (${relation.label})`}`),
  ];
  return lines.slice(0, EXTENDING_LINE_CAP).join("\n");
}

export function noteForDraft(record: DraftRecord): string {
  switch (record.state) {
    case "open":
      return record.inFlight !== null
        ? "the planner is answering"
        : record.turns === 0
          ? "a new conversation: say what the diagram should make clear"
          : "the planner is waiting for your reply";
    case "briefed":
      return record.pendingTopic !== null
        ? `a brief is ready on a new topic, ${record.pendingTopic.entry.slug}: Create topic and draw`
        : "a brief is ready: Draw starts the drawing";
    case "drawing":
      return `drawing: job ${record.jobIds.at(-1) ?? "?"}`;
    case "done":
      return "the drawing is reviewed. Ask for another diagram, or a change to this one";
    case "abandoned":
      return "this conversation is closed";
  }
}
