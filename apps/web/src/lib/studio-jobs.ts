import { JOB_ACTIVE_STATES, type JobState } from "@self-learn/schema/shared";

import type { Comparison } from "@/lib/studio-compare";

/**
 * What a job looks like to the UI, decided here and nowhere else.
 *
 * Pure, the same way `studio-view.ts` is pure: no React, no fetch, no
 * `server-only`. The panel and the strip are view code and untested by design,
 * so every judgement they make — which phase is current, how long one took,
 * what a failure means, whether a brief is complete enough to post — lives on
 * this side of the line where it can be a test.
 *
 * Two rules from the design run through all of it.
 *
 * **No percentage, ever (D23).** Phase, step count and elapsed time. The phases
 * have wildly different durations and nothing reports progress inside one, so a
 * bar with a number on it would be a fabrication, and the first time it stalled
 * at eighty percent it would take the rest of the screen's credibility with it.
 *
 * **The polled `GET` is the record and the stream is a cache (D8, rule 8).**
 * Everything here takes the job record as the truth and the event list as
 * decoration: events refine what the record already says — the durations, the
 * narration — and are never the only source of a state. A browser that never
 * connected to the stream sees the same phase as one watching it live.
 */

/* -------------------------------------------------------------------------- */
/* What the runner sends                                                      */
/* -------------------------------------------------------------------------- */

export interface GateStep {
  name: string;
  ok: boolean;
  detail: string;
  /** tldrawkc's own exit code, for the steps that ran it. */
  exitCode?: number | null;
}

/** One `verify` check: the rule, whether it passed, and its own detail line. */
export interface VerifyCheck {
  rule: string;
  ok: boolean;
  detail: string;
}

export interface GateResult {
  ok: boolean;
  steps: GateStep[];
  findings: string[];
  shapes: number | null;
  lints: number | null;
  svg: { path: string; bytes: number | null } | null;
  /** True when the document saved and the export did not: tldrawkc exit 4. */
  exportFailed: boolean;
  checkedAt: string;
  /** Optional: a job recorded before phase 4 carries none of the three. */
  bindings?: number | null;
  /** `verify --json`'s four checks, which the comparison panel lists in full. */
  verify?: VerifyCheck[];
  shot?: boolean;
}

export interface BriefElement {
  label: string;
  note?: string;
}

export interface BriefRelation {
  from: string;
  to: string;
  label?: string;
}

export interface Brief {
  intent: string;
  topic: string;
  slug: string;
  title: string;
  mode: "new" | "extend";
  elements: BriefElement[];
  relations: BriefRelation[];
  concepts?: string[];
  layout?: string;
  mermaid?: string;
  source?: string;
  model?: "sonnet" | "opus";
  notes?: string;
}

/** One row of `GET /api/jobs`, and the whole of `GET /api/jobs/{id}` bar the brief. */
export interface Job {
  jobId: string;
  kind: string;
  state: JobState;
  phase: string | null;
  title: string | null;
  topic: string;
  target: string;
  candidate: string;
  attempt: number;
  turns: number | null;
  costUsd: number | null;
  /**
   * `result` when `costUsd` is the agent's own `total_cost_usd`, `stream` when
   * the runner accumulated it from the intermediate usage events.
   *
   * A cancelled, timed-out or interrupted job now carries a figure where it
   * used to carry nothing, and that figure is an under-estimate. Shown as such
   * rather than rounded into the same chip as an exact one.
   */
  costSource: "result" | "stream" | null;
  /**
   * The credential rule the runner spawned the agent under, and the CLI's own
   * `apiKeySource` for it. Optional on the wire for a runner one version
   * behind, and null on a job that predates them.
   */
  agentAuth?: "login" | "env" | null;
  apiKeySource?: string | null;
  exitCode: number | null;
  gate: GateResult | null;
  /**
   * Before, after, and the lint difference: the finished screen's content.
   *
   * Computed by the runner and read here. Optional on the wire because a runner
   * one version behind does not send it, and a panel without it says what it
   * has rather than throwing.
   */
  comparison?: Comparison | null;
  written: string[];
  /** Files an accept also wrote into the tree while the files still owned diagrams. Optional: older runners omit it. */
  files?: string[];
  indexed: boolean;
  error: string | null;
  errorKind: string | null;
  requested: string;
  started: string | null;
  finished: string | null;
  updated: string;
  cancelRequestedAt: string | null;
  /** The conversation that started it (docs/STUDIO-CHAT-FIRST.md). Optional: an older runner does not send it. */
  draftId?: string | null;
  /**
   * Every catalog call that did not go through, newest last.
   *
   * The `indexed: false` banner shows the last one: "the catalog did not record
   * it" is the fact, and the connection error underneath is the thing a person
   * can act on. Optional on the wire for a runner one version behind.
   */
  catalogErrors?: string[];
  note: string;
  /** Only `GET /api/jobs/{id}` carries it. */
  brief?: Brief;
}

export type StudioEventType = "phase" | "step" | "gate" | "done" | "error";

export interface StudioEvent {
  type: StudioEventType;
  seq: number;
  at: string;
  job: string;
  note: string;
  state?: JobState;
  phase?: string;
  gate?: GateResult;
}

/* -------------------------------------------------------------------------- */
/* The seven phases                                                           */
/* -------------------------------------------------------------------------- */

/**
 * All seven, visible from the first second.
 *
 * The keys are the runner's own phase strings and the labels are the design's
 * words for them. Showing the whole list up front rather than revealing rows as
 * they happen is the point: a person waiting on three to twenty minutes of an
 * agent working needs to know how much of the shape is left, and that is the
 * honest substitute for the percentage D23 refuses.
 */
export const PHASES = [
  { key: "reading", label: "Read the document" },
  { key: "planning", label: "Plan the snippet" },
  { key: "drawing", label: "Draw" },
  { key: "linting", label: "Lint" },
  { key: "exporting", label: "Export the SVG" },
  { key: "verifying", label: "Verify" },
  { key: "ready", label: "Ready to accept" },
] as const;

export type PhaseKey = (typeof PHASES)[number]["key"];

export function phaseIndex(phase: string | null | undefined): number {
  if (phase === null || phase === undefined) return -1;
  return PHASES.findIndex((entry) => entry.key === phase);
}

export type PhaseStatus = "done" | "current" | "pending" | "failed";

export interface PhaseRow {
  key: string;
  label: string;
  status: PhaseStatus;
  /** Milliseconds spent in this phase, or null when it was never entered. */
  durationMs: number | null;
}

const TERMINAL: readonly JobState[] = ["accepted", "discarded", "failed", "cancelled", "interrupted"];

export function isActive(state: JobState): boolean {
  return (JOB_ACTIVE_STATES as readonly string[]).includes(state);
}

export function isTerminal(state: JobState): boolean {
  return TERMINAL.includes(state);
}

/**
 * The newest job that still holds its target: the one the strip is about.
 *
 * Concurrency is 1 (D9), so at most one is `running`, but a queued job and a
 * job waiting to be reviewed are both live things a person has to be able to
 * get back to. The list arrives newest first and this keeps that order.
 */
export function activeJob(jobs: readonly Job[]): Job | null {
  return jobs.find((job) => isActive(job.state)) ?? null;
}

/**
 * Time actually spent in each phase, summed over the segments it held.
 *
 * A job loops: the gate sends a finding back and the agent goes from `linting`
 * to `drawing` again, twice more at most. Reading a duration as "first entered
 * until first left" would then report a lint step that lasted eleven minutes
 * because a redraw happened in the middle of it. Every segment between two
 * phase events belongs to the phase that was current for it, and the durations
 * are those segments added up.
 *
 * Only `phase` events count. A `step` event says the gate finished a check and
 * carries no phase of its own, so treating it as a boundary would cut a segment
 * in half and attribute the tail to nothing.
 */
function phaseDurations(
  events: readonly StudioEvent[],
  job: Job,
  now: number,
): Map<string, number> {
  const marks = events
    .filter((event): event is StudioEvent & { phase: string } => event.type === "phase" && typeof event.phase === "string")
    .map((event) => ({ phase: event.phase, at: Date.parse(event.at) }))
    .filter((mark) => Number.isFinite(mark.at))
    .sort((a, b) => a.at - b.at);

  const totals = new Map<string, number>();
  // The last segment runs to now while the job is going and to the finish once
  // it has stopped — and `awaiting_review` has stopped. Reading only the
  // terminal states as stopped left a finished job's last phase counting
  // upwards for as long as the panel stayed open, which said the runner was
  // still verifying a diagram it had verified minutes ago. Seen on the first
  // real job.
  const stoppedAt = job.finished === null ? null : Date.parse(job.finished);
  const end = stoppedAt === null || !Number.isFinite(stoppedAt) ? now : stoppedAt;
  for (let at = 0; at < marks.length; at += 1) {
    const mark = marks[at];
    if (mark === undefined) continue;
    const next = marks[at + 1];
    const until = next === undefined ? end : next.at;
    const span = Math.max(0, until - mark.at);
    totals.set(mark.phase, (totals.get(mark.phase) ?? 0) + span);
  }
  return totals;
}

/**
 * The seven rows, with the one that is happening marked and nothing else moving.
 *
 * The current row is taken from the **record**, not from the last event seen: a
 * page that reloaded mid-job has the record and no events at all, and it must
 * still show the right row. The events only supply the durations, which is why
 * a reloaded panel shows the right phase with blank times beside the earlier
 * ones until the stream replays them.
 */
export function phaseRows(
  job: Job,
  events: readonly StudioEvent[] = [],
  now: number = Date.now(),
): PhaseRow[] {
  const durations = phaseDurations(events, job, now);
  const seen = new Set(
    events.filter((event) => event.type === "phase" && event.phase !== undefined).map((event) => event.phase),
  );
  // `awaiting_review` is `ready`, and the runner writes that phase itself. A
  // job that has left `running` any other way has no current phase on the
  // record, so the last phase an event named is the one it stopped in.
  const lastSeen = [...events].reverse().find((event) => event.type === "phase" && event.phase !== undefined)?.phase;
  const currentKey = job.state === "awaiting_review" ? "ready" : (job.phase ?? lastSeen ?? null);
  const current = phaseIndex(currentKey);
  const stopped = isTerminal(job.state);
  const failedHere = stopped && job.state !== "accepted" && job.state !== "discarded";

  return PHASES.map((phase, at) => {
    const durationMs = durations.get(phase.key) ?? null;
    const reached = seen.has(phase.key) || (current >= 0 && at <= current);
    let status: PhaseStatus;
    if (current < 0) {
      // Nothing has started: a queued job, which is every row pending.
      status = "pending";
    } else if (at < current) {
      status = "done";
    } else if (at > current) {
      status = "pending";
    } else if (job.state === "awaiting_review" || job.state === "accepted") {
      status = "done";
    } else if (failedHere) {
      status = "failed";
    } else {
      status = "current";
    }
    return {
      key: phase.key,
      label: phase.label,
      status,
      durationMs: reached ? durationMs : null,
    };
  });
}

/** `step 4 of 7`, and never a percentage. */
export function stepLabel(job: Job): string {
  const at = phaseIndex(job.state === "awaiting_review" ? "ready" : job.phase);
  return at < 0 ? `step 0 of ${PHASES.length}` : `step ${at + 1} of ${PHASES.length}`;
}

/** The phase in words, for the strip. */
export function phaseWords(job: Job): string {
  const key = job.state === "awaiting_review" ? "ready" : job.phase;
  const row = PHASES.find((phase) => phase.key === key);
  if (row !== undefined) return row.label.toLowerCase();
  return job.state === "queued" ? "waiting for the runner" : job.state.replace("_", " ");
}

/* -------------------------------------------------------------------------- */
/* Time                                                                       */
/* -------------------------------------------------------------------------- */

/** How long the job has been going, counting up, stopping when it stops. */
export function elapsedMs(job: Job, now: number = Date.now()): number {
  const from = Date.parse(job.started ?? job.requested);
  if (!Number.isFinite(from)) return 0;
  const to = job.finished === null ? now : Date.parse(job.finished);
  return Math.max(0, (Number.isFinite(to) ? to : now) - from);
}

/** `9s`, `1:04`, `12:30`. Coarse below a minute, mm:ss above it. */
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/* -------------------------------------------------------------------------- */
/* The narration                                                              */
/* -------------------------------------------------------------------------- */

/**
 * One line per finished check, newest last, capped at twenty.
 *
 * Only `step` events, which are D24's whole point: `drew 44 shapes` comes from
 * the runner's own `inspect --json` and `exported 213 kB` from the file it
 * wrote, never from the agent's account of itself. The phase events are already
 * the list above, so repeating them here would be the same fact twice.
 */
export function narration(events: readonly StudioEvent[], cap = 20): { at: string; note: string }[] {
  return events
    .filter((event) => event.type === "step")
    .slice(-cap)
    .map((event) => ({ at: event.at, note: event.note }));
}

/* -------------------------------------------------------------------------- */
/* What a failure means                                                       */
/* -------------------------------------------------------------------------- */

/**
 * What the failure panel offers. `talk` is the way to change what gets drawn:
 * back to the conversation the job came from, where the gate's findings are
 * already a studio note (E8 of docs/STUDIO-CHAT-FIRST.md). It replaced the
 * brief form's Edit brief: a link to the job's own conversation, or for a
 * job the form started, a new conversation prefilled with what it was for.
 */
export type FailureAction = "retry" | "talk" | "doctor" | "resume";

export interface FailureReport {
  /** The last tldrawkc exit code the gate recorded, when there was one. */
  code: number | null;
  headline: string;
  detail: string | null;
  actions: FailureAction[];
}

/**
 * The failure panel's message, keyed on the runner's codes rather than on prose.
 *
 * The design's table is the contract and it keys on **the last tldrawkc exit
 * code recorded in the gate**, which is not the agent's exit code: the agent
 * runs the CLI many times and the runner only sees the session's own exit, so
 * the codes that reach a job come from the gate's own calls and live in
 * `job.gate`. Codes 3 and 4 never arrive here at all — a document with lints and
 * a document whose export failed are both finished jobs (D4) — so this is only
 * ever asked about 1, 2, or nothing.
 *
 * `errorKind` covers the row the table calls `none`. A timeout, an agent that
 * never spawned, an agent whose first request failed, a job that wrote outside
 * its allowed paths and a gate finding are five different sentences, and "the
 * gate's own finding" is only the right words for the last of them.
 */
export function failureReport(job: Job): FailureReport {
  const code = lastGateCode(job);
  const detail = job.error ?? null;

  // Before the gate codes, unlike every other kind. A refused first request
  // can end a job whose *earlier* attempt left a gate on the record, and a
  // code 1 or 2 from that attempt would otherwise describe a failure the job
  // recovered from, not the one that ended it. Caught in review on this PR.
  if (job.errorKind === "agent") return agentReport(detail);

  if (code === 1) {
    return {
      code,
      headline: firstSentence(gateDetail(job, 1) ?? detail ?? "tldrawkc refused the call"),
      detail,
      // The doctor action is offered because a code 1 is usage *or*
      // environment and the message is the only thing that says which.
      actions: ["talk", "doctor"],
    };
  }
  if (code === 2) {
    return {
      code,
      headline: "the snippet threw",
      // The bridge rewrites the stack so the line number points at the
      // snippet's own line rather than at the page bundle's.
      detail: gateDetail(job, 2) ?? detail,
      actions: ["retry", "talk"],
    };
  }

  switch (job.errorKind) {
    case "timeout":
      return {
        code: null,
        headline: "it ran out of time",
        detail,
        // The session id is kept on a timeout, so a revision continues the
        // transcript rather than paying for the drawing again.
        actions: ["retry", "talk"],
      };
    case "spawn":
      return {
        code: null,
        headline: "the agent never started",
        detail,
        actions: ["doctor", "retry"],
      };
    case "wrote-outside":
      return {
        code: null,
        headline: "it left files it was never allowed to write",
        detail,
        // Deliberately no retry: something is dirty in the tree and a person
        // has to look at it before another agent runs over the same paths.
        actions: [],
      };
    case "cancelled":
      return { code: null, headline: "stopped on request", detail, actions: ["retry"] };
    case "interrupted":
      return {
        code: null,
        headline: "the runner died while this was running",
        detail: detail ?? "No gate ran on whatever is on disk.",
        actions: ["resume"],
      };
    case "not-claimed":
      return { code: null, headline: "the catalog would not hand this job over", detail, actions: ["retry"] };
    default:
      return {
        code: null,
        headline: job.gate === null ? "nothing was written" : "the check refused what it drew",
        detail: job.gate?.findings.join(" ") ?? detail,
        actions: ["retry", "talk"],
      };
  }
}

/**
 * The process ran and its first request was refused: a credential the API would
 * not take, a model the account cannot use, a quota. The detail is the API's
 * own message, which is the only thing that says which, and it is never a
 * finding about the drawing.
 */
function agentReport(detail: string | null): FailureReport {
  return {
    code: null,
    headline: "the agent could not make its first request",
    detail,
    actions: ["doctor", "retry"],
  };
}

/**
 * The line under the failure message, about the committed diagram.
 *
 * It used to be one sentence for every failure: the target is unchanged, and
 * the agent's permission file never allowed it. The second half explains why a
 * gate failure or a stray write cannot have touched the committed file, and it is
 * noise (worse, a wrong lead) on a job whose agent never drew anything,
 * where a person reading "permission file" goes looking at permissions. So the
 * reason is only given where it is the reason.
 */
export function failureFooter(job: Job): string {
  const unchanged = `${job.target} is unchanged.`;
  switch (job.errorKind) {
    case "agent": {
      const source =
        job.apiKeySource === undefined || job.apiKeySource === null
          ? ""
          : ` This attempt's credential: ${job.apiKeySource}.`;
      return (
        `${unchanged} Nothing was drawn: the agent's first request failed, so no check ran.${source} ` +
        `The studio runs the agent on this machine's claude login unless the runner has STUDIO_AGENT_AUTH=env.`
      );
    }
    case "timeout":
    case "spawn":
    case "cancelled":
    case "interrupted":
    case "not-claimed":
    case "internal":
      return unchanged;
    default:
      // `gate`, `wrote-outside`, and a record with no kind at all, which is
      // what a gate failure looked like before kinds were written.
      return `${unchanged} The agent's permission file never allowed it.`;
  }
}

/** The last exit code the gate recorded on a step that did not pass. */
export function lastGateCode(job: Job): number | null {
  const steps = job.gate?.steps ?? [];
  for (let at = steps.length - 1; at >= 0; at -= 1) {
    const step = steps[at];
    if (step === undefined || step.ok) continue;
    if (typeof step.exitCode === "number") return step.exitCode;
  }
  return null;
}

function gateDetail(job: Job, code: number): string | null {
  const step = (job.gate?.steps ?? []).find((entry) => !entry.ok && entry.exitCode === code);
  return step?.detail ?? null;
}

function firstSentence(text: string): string {
  const cut = text.indexOf(". ");
  return cut === -1 ? text : text.slice(0, cut + 1);
}

/**
 * What a finished job says at the top of the panel.
 *
 * Exit 3 and exit 4 both land here rather than in the failure panel (D4, U12):
 * a diagram with a warning on it is often the right thing to accept, and a
 * document that saved while its export did not has lost a picture and not the
 * work, which accept redoes anyway.
 */
export function finishedHeadline(job: Job): string {
  const gate = job.gate;
  if (gate === null) return "the candidate is written";
  if (gate.exportFailed) return "the document was saved, the export failed";
  const lints = gate.lints ?? 0;
  if (lints > 0) return `finished with ${lints} lint${lints === 1 ? "" : "s"}`;
  return `finished: ${gate.shapes ?? "?"} shapes, no lints`;
}

/* -------------------------------------------------------------------------- */
/* The title and the notification                                             */
/* -------------------------------------------------------------------------- */

export interface Announcement {
  /** What `document.title` becomes, which happens whether or not a notification can. */
  title: string;
  body: string;
}

/**
 * What to say when a job stops while nobody is looking.
 *
 * The title changes regardless, because the Notifications API is behind a
 * permission a person can refuse and often has. A tab title is the one channel
 * that cannot be denied.
 */
export function announcement(job: Job): Announcement | null {
  const name = job.title ?? job.jobId.slice(0, 8);
  switch (job.state) {
    case "awaiting_review":
      return { title: `✓ ${name} — ready to review`, body: finishedHeadline(job) };
    case "failed":
      return { title: `✕ ${name} — failed`, body: failureReport(job).headline };
    case "cancelled":
      return { title: `✕ ${name} — cancelled`, body: job.note };
    case "interrupted":
      return { title: `✕ ${name} — interrupted`, body: job.note };
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Where a job draws                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The line beside Draw on the confirm card: where the job will draw,
 * `$STUDIO_HOME/jobs/<job>/candidate/<slug>.tldr`. Each job draws in its own
 * workspace and nothing lands until Accept, so the job's id is not known yet
 * and the line says so rather than naming a path in the repository.
 */
export function candidatePathFor(slug: string): string {
  return `$STUDIO_HOME/jobs/<job>/candidate/${slug === "" ? "<slug>" : slug}.tldr`;
}
