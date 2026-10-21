import type { JobState } from "@gnosia/schema";

import type { AgentAuth } from "../config";
import type { CostSource } from "../cost";
import type { GateStep } from "../store";
import type { ValidVideoBrief } from "./brief";
import type { DeadTools } from "./dead-tools";

/**
 * The video runner's record of one job: `jobs/<id>/job.json`, rule 7's
 * write-ahead log, exactly as the diagram runner keeps its own, with the
 * fields only a video has.
 */

/**
 * Where a model or an effort level came from (D53). `panel` is a value the
 * settings panel stored; `claude-settings` the owner's own Claude Code
 * default, read from their user settings because the seal hides that file
 * from the session; `cli` no flag at all. Two only a diagram job records:
 * `brief`, a model the brief itself named (only `POST /api/jobs` or a
 * person's brief edit can), which beats the panel; and `default`, the
 * diagram agent's `sonnet` when the owner has never saved the Diagrams row.
 */
export type AgentSettingSource = "panel" | "claude-settings" | "cli" | "brief" | "default";

export interface AgentSetting {
  /** What the panel says: `default`, or a value. */
  requested: string;
  /** What was passed to the CLI, or null when no flag was passed. */
  passed: string | null;
  source: AgentSettingSource;
}

/** How one line the brief wrote compares with what the source voices. */
export interface LineChange {
  scene: string;
  kind: "unchanged" | "reworded" | "split" | "added" | "dropped";
  /** The brief's line, when there was one. */
  brief: string | null;
  /** The voiced line or lines, when there are any. */
  voiced: string[];
}

export interface CopyRecord {
  sha256: string;
  bytes: number;
}

export interface VideoGateResult {
  ok: boolean;
  steps: GateStep[];
  /** What a retry is told, verbatim. Empty when the gate passed. */
  findings: string[];
  /** What the card shows and a retry is not told: lint warnings, a length off target, a large file. */
  warnings: string[];
  /** Step 3: the voiced lines against the brief's. */
  script: { classes: string[]; changes: LineChange[] } | null;
  /** Step 7: the transcript against the source, and each scene's held tail. */
  sync: { segments: number; heldTail: Record<string, number> } | null;
  /** Step 8. */
  length: { durationSeconds: number; predictedSeconds: number; targetSeconds: number; bytes: number } | null;
  /** Step 10: per scene, the render and the Read after it. */
  looked: Record<string, { renderedAt: string | null; readAt: string | null }> | null;
  /** Step 5: the gate's copies in `candidate/`, which Accept uploads and nothing else reads. */
  copies: Record<string, CopyRecord> | null;
  durationSeconds: number | null;
  checkedAt: string;
}

/** One step of the manimkc-video skill, as the job view lists it. */
export interface VideoStep {
  name: "storyboard" | "narration" | "setup" | "scene-code" | "lint" | "preview" | "look" | "build" | "check" | "poster" | "ready";
  state: "pending" | "running" | "done" | "failed";
  rounds: number;
  note: string | null;
}

export interface VideoJobRecord {
  id: string;
  kind: "video";
  state: JobState;
  phase: string | null;
  brief: ValidVideoBrief;
  /** `videos/<slug>.mp4`: the logical name the lease is held on. */
  targetPath: string;
  topic: string;
  slug: string;
  /** The brief's scenes as the classes manimkc named them, `<PREFIX><n>_<Name>`, in play order. */
  classes: string[];
  attempt: number;
  sessionId: string | null;
  agentSessionId: string | null;
  parentJobId: string | null;
  draftId?: string | null;
  /**
   * The job that discarded this one, in review, in its own catalog
   * transaction (D52): a Replace or a Revise. Written with the `discarded`
   * state, so a draft reads that discard as a replacement rather than a
   * verdict however late it hears of it. Absent for every other discard.
   */
  replacedBy?: string | null;
  /** What the person asked to be different (a revise), or null. */
  changes: string | null;
  idempotencyKey: string;
  /** The video's revision when the job was enqueued, Accept's base; null for a new video, absent when unknown. */
  targetRevisionBefore?: number | null;
  /** The sha256 of the scene file the job started from, for a change (gate step 1). */
  sourceHashBefore: string | null;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  reviewedAt: string | null;
  heartbeatAt: string | null;
  cancelRequestedAt: string | null;
  exitCode: number | null;
  turns: number | null;
  costUsd: number | null;
  costSource: CostSource | null;
  agentAuth?: AgentAuth | null;
  apiKeySource?: string | null;
  /** The manual the agent's system prompt carried, by its hash (D38). */
  manualHash?: string | null;
  agentModel?: AgentSetting | null;
  agentEffort?: AgentSetting | null;
  /** The model the session's init event named. */
  resolvedModel?: string | null;
  /** "9 of 12 lines already voiced", as numbers. */
  seeded?: { wanted: number; seeded: number } | null;
  steps: VideoStep[];
  lineChanges: LineChange[];
  gate: VideoGateResult | null;
  errorKind: string | null;
  error: string | null;
  /**
   * Set when the job was stopped because its tools could not start
   * (`errorKind: toolchain`, V26): the wrapper calls that showed it, and what
   * the last wrapper call printed, which `error` leaves out (`dead-tools.ts`).
   */
  deadTools?: (DeadTools & { output: string | null }) | null;
  /** What landed, after an accept. */
  written: string[];
  indexed: boolean;
  catalogErrors: string[];
  reconciled?: boolean;
}
