import { EventEmitter } from "node:events";
import { appendFile, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { JobState } from "@self-learn/schema";

import type { ValidBrief } from "./brief";
import type { CanvasLint, VerifyCheck } from "./canvas";
import type { Comparison } from "./compare";
import { SSE_BUFFER, type AgentAuth } from "./config";
import type { CostSource } from "./cost";
import {
  jobDir,
  jobJsonPath,
  scratchDir,
  sessionLogPath,
  studioHome,
  tmpDir,
} from "./paths";

/**
 * The write-ahead log, and the only thing the API reads.
 *
 * Rule 7: `jobs/<id>/job.json` and `jobs/<id>/session.ndjson` are the record,
 * and Postgres is the query surface. Every terminal state is written here
 * first, so a database that was down while a job finished loses nothing — the
 * reconcile pass can put the row right from these files, and D3 is the whole
 * argument.
 *
 * Rule 8 is the other half: progress is a cache and never the record. Each
 * event is appended to the ndjson before it is pushed to a subscriber, so a
 * browser that never opened the stream shows the same thing from
 * `GET /api/jobs/{id}` that a browser watching it live saw.
 */

export interface GateStep {
  name: string;
  ok: boolean;
  detail: string;
  /** tldrawkc's own exit code for the steps that ran it. */
  exitCode?: number | null;
}

export interface GateResult {
  ok: boolean;
  steps: GateStep[];
  /** What a retry is told, verbatim. Empty when the gate passed. */
  findings: string[];
  shapes: number | null;
  lints: number | null;
  svg: { path: string; bytes: number | null } | null;
  /** True when the document saved and the export did not: tldrawkc exit 4. */
  exportFailed: boolean;
  checkedAt: string;
  /**
   * The three things phase 4's comparison needs and phase 1 threw away.
   *
   * The gate already ran `inspect` and `verify` and already knows the answers;
   * it recorded a count and a sentence. A panel that wanted the lint list or
   * the four checks had to launch Chromium again to ask a question that had
   * been answered minutes earlier, so the answers are kept.
   *
   * All three are optional on the type because a job recorded before this
   * existed is still readable, and a panel reading one shows what it has.
   */
  bindings?: number | null;
  /** Every lint `inspect` reported, verbatim. The comparison's after side. */
  lintList?: CanvasLint[];
  /** `verify --json`'s four checks, each with its detail line. */
  verify?: VerifyCheck[];
  /** True when the after screenshot was written to the job workspace. */
  shot?: boolean;
}

export interface JobRecord {
  id: string;
  kind: "diagram";
  state: JobState;
  phase: string | null;
  brief: ValidBrief;
  /** Repo-relative, all four. */
  targetPath: string;
  targetSvgPath: string;
  candidatePath: string;
  candidateSvgPath: string;
  topic: string;
  slug: string;
  attempt: number;
  /** The `session` row this runs under, and the headless session for Resume. */
  sessionId: string | null;
  agentSessionId: string | null;
  /** The job this one revises, when it is a revision. */
  parentJobId: string | null;
  /** What the person asked to be different, verbatim. The revise prompt. */
  changes: string | null;
  idempotencyKey: string;
  /**
   * The document the job started from: the diagram's `document_hash` when the
   * catalog answered at enqueue, else the sha256 of the checkout on disk.
   * What the comparison's before side is labelled with.
   */
  targetHashBefore: string | null;
  /**
   * The revision the job started from, or null when there was no diagram: the
   * base `diagram put` checks at Accept, so a commit that landed while the job
   * ran refuses the Accept (S4, edge case 18). Recorded at enqueue as the
   * latest revision, then replaced at run start, for an extend job, by the
   * revision its copy of the checkout was written from. Absent when neither
   * could be read (the database down and no checkout record, or a job from
   * before diagrams moved into the database); Accept then compares
   * `targetHashBefore` with the stored document instead.
   */
  targetRevisionBefore?: number | null;
  /**
   * Files the accept's put wrote into the working tree because the files still
   * owned diagrams (D17 of the migration plan). Empty after the flip, and
   * absent on a job accepted before diagrams moved into the database.
   */
  files?: string[];
  /**
   * The candidate's sha256 when the reconcile pass marked this job
   * `interrupted`, or null when there was nothing there.
   *
   * The candidate path is per slug and an interrupted job releases the target's
   * lease, so another job can write that same path before anyone presses
   * Resume. This is how a resume tells its own half-drawn document from
   * somebody else's leftovers, and it is only ever set by the reconcile pass.
   */
  candidateHash?: string | null;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  reviewedAt: string | null;
  heartbeatAt: string | null;
  cancelRequestedAt: string | null;
  exitCode: number | null;
  turns: number | null;
  costUsd: number | null;
  /**
   * Where `costUsd` came from: the agent's own `total_cost_usd`, or this
   * service's accumulation from the intermediate usage events.
   *
   * The two are different kinds of fact and a reader that cannot tell them
   * apart cannot tell a bill from a guess. `stream` is an under-estimate for
   * the reason `cost.ts` sets out, so every surface that shows a figure shows
   * this beside it. Null when no cost is recorded at all.
   */
  costSource: CostSource | null;
  /**
   * Which credential rule the runner spawned the agent under: `login` (the
   * Anthropic auth variables stripped) or `env` (passed through). Read once per
   * job from `STUDIO_AGENT_AUTH`, so this is what the job actually ran with
   * even if the setting changed since.
   *
   * Optional so a job recorded before the setting existed still parses; on one
   * of those, absent means inherited, which is what every job did then.
   */
  agentAuth?: AgentAuth | null;
  /**
   * The CLI's own answer to the same question, from its `system/init` event:
   * `ANTHROPIC_API_KEY`, `none`, `/login managed key` and so on. The last
   * attempt's, and null until an agent has started.
   */
  apiKeySource?: string | null;
  gate: GateResult | null;
  /**
   * Before and after, and the difference: the finished-job screen's whole
   * content, computed once by the runner and read by the panel.
   *
   * Written twice. The before side is filled at job start, against the
   * committed file as it was then, because that is the only moment it can be
   * read — after an accept there is no before left on disk. The after side and
   * the lint difference are filled when the gate has run.
   *
   * Optional on the type so a job recorded before phase 4 still parses.
   */
  comparison?: Comparison | null;
  errorKind: string | null;
  error: string | null;
  /** What landed, after an accept. */
  written: string[];
  indexed: boolean;
  /** Every catalog call that did not go through, newest last. */
  catalogErrors: string[];
  /** True when the reconcile pass, not the runner, wrote the current state. */
  reconciled?: boolean;
}

export type StudioEventType = "phase" | "step" | "gate" | "done" | "error";

export interface StudioEvent {
  type: StudioEventType;
  seq: number;
  at: string;
  job: string;
  /** The plain-English line a person reads while waiting. */
  note: string;
  state?: JobState;
  phase?: string;
  gate?: GateResult;
}

interface Stream {
  emitter: EventEmitter;
  buffer: StudioEvent[];
  seq: number;
}

let writeCounter = 0;

const atomicWrite = async (file: string, body: string): Promise<void> => {
  // A sibling temp file and a rename, the same discipline tldrawkc's own
  // `writeAtomic` keeps: a reader of job.json sees the old record or the new
  // one, never half of either, and a crash mid-write cannot leave a job
  // unreadable.
  //
  // **The temp name is unique per write.** With a fixed `.tmp` two overlapping
  // writes to one record share a path: both write it, the first rename takes
  // it, and the second fails `ENOENT` on a file that is no longer there. That
  // was survivable while a record was written a handful of times per job and
  // stopped being when the running cost total started riding the agent's
  // stdout. Seen as five unhandled `ENOENT`s in a green test run, which is
  // exactly the shape of a bug that waits.
  writeCounter += 1;
  const temporary = `${file}.${process.pid}.${writeCounter}.tmp`;
  try {
    await writeFile(temporary, body, "utf8");
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
};

/**
 * A record written by an older build, brought up to the current shape.
 *
 * `job.json` is a plain `JSON.parse` cast, so a field added after a job was
 * written is simply absent on that record — and `undefined` is not `null`. The
 * API then omits `costSource` rather than reporting it as null, which breaks
 * the shape the web app is typed against, and only for the historical jobs
 * nothing will ever rewrite: the reconcile pass touches `running` rows and
 * every one of these is terminal. One line here rather than a defensive read
 * at each of the surfaces. Caught by Greptile on the phase 7 PR.
 */
function normalise(record: JobRecord): JobRecord {
  return { ...record, costSource: record.costSource ?? null };
}

export class JobStore {
  private readonly records = new Map<string, JobRecord>();
  private readonly streams = new Map<string, Stream>();
  /**
   * One write at a time per record, chained.
   *
   * A unique temp name stops two overlapping writes fighting over a path, but
   * not over an order: `update` merges against the in-memory map synchronously
   * and then awaits, so without this the write that *started* last is not
   * necessarily the write that *lands* last, and `job.json` can end up holding
   * a snapshot older than the record it is supposed to mirror. Rule 7 makes
   * that file the record, so it has to be the newest one.
   */
  private readonly writes = new Map<string, Promise<void>>();

  /** Read every job workspace back into memory. Called once, at start. */
  async load(): Promise<void> {
    const root = path.join(studioHome(), "jobs");
    let entries: string[];
    try {
      entries = await readdir(root);
    } catch {
      return;
    }
    for (const entry of entries) {
      try {
        const raw = await readFile(jobJsonPath(entry), "utf8");
        const record = normalise(JSON.parse(raw) as JobRecord);
        this.records.set(record.id, record);
      } catch {
        // A directory with no readable job.json is a workspace that was created
        // and never written, or one a person has been poking at. Skipping it is
        // right: there is no job to run and nothing to report about.
      }
    }
  }

  async create(record: JobRecord): Promise<JobRecord> {
    await mkdir(scratchDir(record.id), { recursive: true });
    await mkdir(tmpDir(record.id), { recursive: true });
    this.records.set(record.id, record);
    await this.persist(record);
    return record;
  }

  get(id: string): JobRecord | undefined {
    return this.records.get(id);
  }

  /**
   * Drop a job that was never really created.
   *
   * The one caller is an enqueue the catalog refused: its workspace is deleted,
   * and a record left in this map would go on holding its target's lease
   * against every later brief while no file on disk backs it up. Not a delete
   * for anything that ran — a job that did work is kept, in whatever terminal
   * state it reached.
   */
  forget(id: string): void {
    this.records.delete(id);
    this.streams.delete(id);
  }

  /** Newest first, which is the order every list in the UI wants. */
  list(filter: { state?: string; limit?: number } = {}): JobRecord[] {
    const all = [...this.records.values()]
      .filter((record) => filter.state === undefined || record.state === filter.state)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    return filter.limit === undefined ? all : all.slice(0, filter.limit);
  }

  /** Every job holding the lease on a committed path: queued, running, awaiting. */
  activeOn(targetPath: string): JobRecord | undefined {
    return [...this.records.values()].find(
      (record) =>
        record.targetPath === targetPath &&
        (record.state === "queued" || record.state === "running" || record.state === "awaiting_review"),
    );
  }

  byIdempotencyKey(key: string): JobRecord | undefined {
    return [...this.records.values()].find((record) => record.idempotencyKey === key);
  }

  async update(id: string, patch: Partial<JobRecord>): Promise<JobRecord> {
    const record = this.records.get(id);
    if (record === undefined) throw new Error(`no job ${id}`);
    const next = { ...record, ...patch };
    this.records.set(id, next);
    await this.persist(next);
    return next;
  }

  private async persist(record: JobRecord): Promise<void> {
    const body = `${JSON.stringify(record, null, 1)}\n`;
    const previous = this.writes.get(record.id) ?? Promise.resolve();
    const next = previous
      // The chain must not break on a failed write: one job whose workspace has
      // been deleted out from under it should not wedge every later write to
      // it. The error still reaches this call's own caller.
      .catch(() => undefined)
      .then(async () => {
        await mkdir(jobDir(record.id), { recursive: true });
        await atomicWrite(jobJsonPath(record.id), body);
      });
    this.writes.set(record.id, next.catch(() => undefined));
    await next;
  }

  /** Note a failed catalog call on the record rather than throwing it away. */
  async noteCatalogError(id: string, message: string): Promise<void> {
    const record = this.records.get(id);
    if (record === undefined) return;
    await this.update(id, { catalogErrors: [...record.catalogErrors, message].slice(-20) });
  }

  /* ------------------------------------------------------------------ */
  /* The log and the stream                                             */
  /* ------------------------------------------------------------------ */

  /**
   * One raw line of the agent's `stream-json` stdout, appended verbatim.
   *
   * Verbatim matters: this is the transcript, and a runner that reformatted it
   * would be the only record of a session nobody can replay.
   */
  async appendRaw(id: string, line: string): Promise<void> {
    await appendFile(sessionLogPath(id), `${line}\n`, "utf8");
  }

  /**
   * A studio event: to the ndjson first, then to whoever is listening.
   *
   * That order is rule 8 and it is why a dropped SSE connection costs nothing.
   */
  async emit(
    id: string,
    event: Omit<StudioEvent, "seq" | "at" | "job">,
  ): Promise<StudioEvent> {
    const stream = this.stream(id);
    stream.seq += 1;
    const full: StudioEvent = { ...event, seq: stream.seq, at: new Date().toISOString(), job: id };
    await this.appendRaw(id, JSON.stringify(full));
    stream.buffer.push(full);
    if (stream.buffer.length > SSE_BUFFER) stream.buffer.splice(0, stream.buffer.length - SSE_BUFFER);
    stream.emitter.emit("event", full);
    return full;
  }

  private stream(id: string): Stream {
    let stream = this.streams.get(id);
    if (stream === undefined) {
      stream = { emitter: new EventEmitter(), buffer: [], seq: 0 };
      // A job's panel, its log window and a curl can all watch at once, and the
      // default of ten listeners would print a leak warning at the eleventh.
      stream.emitter.setMaxListeners(64);
      this.streams.set(id, stream);
    }
    return stream;
  }

  /**
   * Subscribe, replaying anything after `afterSeq`.
   *
   * The buffer is capped, so a reconnect that missed more than `SSE_BUFFER`
   * events gets what is left and a marker saying how many went. Dropping the
   * oldest rather than blocking is what stops a slow tab back-pressuring the
   * runner (A9).
   */
  subscribe(
    id: string,
    afterSeq: number,
    listener: (event: StudioEvent) => void,
  ): { replay: StudioEvent[]; omitted: number; unsubscribe: () => void } {
    const stream = this.stream(id);
    const replay = stream.buffer.filter((event) => event.seq > afterSeq);
    const oldest = stream.buffer[0]?.seq ?? afterSeq + 1;
    const omitted = Math.max(0, oldest - afterSeq - 1);
    stream.emitter.on("event", listener);
    return {
      replay,
      omitted,
      unsubscribe: () => stream.emitter.off("event", listener),
    };
  }

  /** A window of the raw log, for `GET /api/jobs/{id}/log`. */
  async logWindow(
    id: string,
    from: number,
    limit: number,
  ): Promise<{ lines: string[]; from: number; next: number; total: number }> {
    let body: string;
    try {
      body = await readFile(sessionLogPath(id), "utf8");
    } catch {
      return { lines: [], from, next: from, total: 0 };
    }
    const all = body.split("\n").filter((line) => line !== "");
    const start = Math.max(0, Math.min(from, all.length));
    const lines = all.slice(start, start + limit);
    return { lines, from: start, next: start + lines.length, total: all.length };
  }
}
