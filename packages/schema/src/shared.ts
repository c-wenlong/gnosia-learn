/**
 * The constants and plain types both halves of the repo have to agree on, with
 * no imports.
 *
 * This file deliberately pulls in nothing — not drizzle, not node. That is
 * what makes it importable from a `"use client"` component in `src/` through
 * the `@self-learn/schema/shared` subpath without dragging a Postgres driver
 * into the browser bundle (layering rule 8 in ARCHITECTURE.md), while
 * `state.ts` re-exports the same values for the service and the migrations.
 *
 * Before bundle 5 these lived twice: `KNOWLEDGE_LIMITS` in the web app's
 * `storage.ts` and a copy in `state.ts`, with a comment asking the two to stay
 * in step. They are now one definition, because the web app clamps a recap on
 * the way in and the database refuses one that was not clamped, and those two
 * numbers being different is a 23514 the learner sees as "save failed" for no
 * visible reason.
 */

/** Bounds on a recap, so one runaway session cannot fill a column or a quota. */
export const KNOWLEDGE_LIMITS = {
  summaryChars: 1200,
  listItems: 8,
  itemChars: 300,
} as const;

/** Scheduler bounds, mirroring scripts/learn/lib/schedule.mjs. */
export const SCHEDULE_LIMITS = {
  minEase: 1.3,
  defaultEase: 2.5,
  maxIntervalDays: 36500,
} as const;

/** BKT prior, mirroring scripts/learn/lib/bkt.mjs (`DEFAULT_PARAMS.pL0`). */
export const DEFAULT_P_L = 0.25;

/** The default single learner. One row until auth exists; not a UUID so it stays readable. */
export const LOCAL_LEARNER_ID = "local";

/** Event types the `learn` CLI writes. */
export const EVENT_TYPES = [
  "session-start",
  "observation",
  "review",
  "session-close",
  "void",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/**
 * Where a recap came from. Mirrors `KnowledgeSource` in
 * `apps/web/src/lib/types.ts`.
 */
export const RECAP_SOURCES = ["agent", "manual"] as const;
export type RecapSource = (typeof RECAP_SOURCES)[number];

/**
 * Preference keys the web app and the CLI both know by name.
 *
 * `preference` is a key/value table precisely so a new one costs no migration,
 * but the handful that are read from two places are named here so a typo in one
 * of them is a type error rather than a silently missing value.
 */
export const PREFERENCE_KEYS = {
  /** "light" | "dark". Mirrored into a cookie so the root layout can render it. */
  theme: "theme",
  /** Bumps on a progress reset so client UI state remounts. */
  epoch: "epoch",
  /** `{ courseSlug, moduleSlug?, at }`. */
  lastVisited: "lastVisited",
  /** `Record<moduleId, UserResource[]>`. Keyed by module, which joins nothing. */
  userResources: "userResources",
  /** BKT parameters, overriding `DEFAULT_PARAMS`. Was `model.json`'s `params`. */
  bktParams: "bktParams",
} as const;

export type PreferenceKey = (typeof PREFERENCE_KEYS)[keyof typeof PREFERENCE_KEYS];

/** Clamp one list of strings the way both the web app and the store must. */
export function clampKnowledgeList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().slice(0, KNOWLEDGE_LIMITS.itemChars))
    .filter((value) => value !== "")
    .slice(0, KNOWLEDGE_LIMITS.listItems);
}

/** Clamp a recap summary the way both the web app and the store must. */
export function clampSummary(value: unknown): string {
  return typeof value === "string"
    ? value.trim().slice(0, KNOWLEDGE_LIMITS.summaryChars)
    : "";
}

/* -------------------------------------------------------------------------- */
/* The learner state shape                                                    */
/* -------------------------------------------------------------------------- */

/**
 * What a learner snapshot looks like once it leaves the database.
 *
 * These are declared here rather than in `apps/web/src/lib/types.ts` because
 * both sides now need them: `services/catalog/src/state/` builds the snapshot
 * and the web app's provider consumes it. `apps/web/src/lib/types.ts`
 * re-exports them, so components keep importing from where they always did.
 *
 * The keys deliberately match the old localStorage document, minus `version`.
 * They are the argument to `/api/learner/import`, and a component reading
 * `state.completed[id]` should not have to care that the bytes now come from
 * Postgres.
 */

export type ThemeMode = "light" | "dark";

/** Where a recap came from. The same vocabulary as `RECAP_SOURCES`. */
export type KnowledgeSource = RecapSource;

/**
 * Durable record of what the learner established about one curriculum item.
 * `topicId` is the curriculum item id (`cs4263-m1-t1`), not a shared-vocabulary
 * topic slug; the name predates the catalog and is kept so the components and
 * the old localStorage payload still line up.
 */
export interface TopicKnowledge {
  topicId: string;
  summary: string;
  keyPoints: string[];
  misconceptions: string[];
  openQuestions: string[];
  source: KnowledgeSource;
  updatedAt: string;
  /** How many agent sessions have been folded into this record. */
  sessions: number;
}

/** Fields a summariser (or the learner) supplies; the rest is derived. */
export interface KnowledgeInput {
  summary: string;
  keyPoints: string[];
  misconceptions: string[];
  openQuestions: string[];
  source: KnowledgeSource;
}

export interface UserResource {
  id: string;
  title: string;
  url: string;
}

export interface LastVisited {
  courseSlug: string;
  moduleSlug?: string;
  at: string;
}

export interface LearnerState {
  theme: ThemeMode;
  completed: Record<string, true>;
  notes: Record<string, string>;
  userResources: Record<string, UserResource[]>;
  /** Per-curriculum-item recaps. */
  knowledge: Record<string, TopicKnowledge>;
  /** Bumps when progress is reset so local UI state can remount. */
  epoch: number;
  lastVisited?: LastVisited;
}

/**
 * What the app renders before anything is known: a fresh learner, and also the
 * honest answer when the database is unreachable. Nothing distinguishes the
 * two in the state itself; `LearnerProvider` carries the reachability flag
 * beside it, because a page that quietly shows zero progress and one that says
 * it could not reach the database are very different things to a learner.
 */
export const emptyLearnerState = (): LearnerState => ({
  theme: "light",
  completed: {},
  notes: {},
  userResources: {},
  knowledge: {},
  epoch: 0,
});

/**
 * The localStorage document as it was written up to bundle 5, accepted by
 * `/api/learner/import` exactly once per browser. Every field is optional and
 * unknown-typed: this is data written by an older build, so it is parsed
 * defensively rather than trusted.
 */
export const LEGACY_STORAGE_KEY = "self-learn:v1";

/* -------------------------------------------------------------------------- */
/* The studio: sessions and jobs                                              */
/* -------------------------------------------------------------------------- */

/**
 * The two kinds of session that share one id space.
 *
 * `tutor` is what `learn session start` opens; `studio` is what a generation
 * runner opens. One table with a discriminator rather than two, because
 * `event.session_id` needs exactly one foreign key target and a polymorphic
 * column is the shape this schema rejects everywhere else.
 */
export const SESSION_KINDS = ["tutor", "studio"] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

/**
 * `interrupted` is never written by the process itself — it is what a
 * reconcile pass concludes about a process that stopped writing heartbeats.
 * That is why it is distinct from `failed`: "it died" and "it exited non-zero"
 * are different facts and the row should not conflate them.
 */
export const SESSION_STATES = [
  "running",
  "closed",
  "failed",
  "cancelled",
  "interrupted",
] as const;
export type SessionState = (typeof SESSION_STATES)[number];

/** What a generation job produces. One kind today; `video` is phase 5. */
export const JOB_KINDS = ["diagram"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const JOB_STATES = [
  "queued",
  "running",
  "awaiting_review",
  "accepted",
  "discarded",
  "failed",
  "cancelled",
  "interrupted",
] as const;
export type JobState = (typeof JOB_STATES)[number];

/**
 * The states that hold the lease on a committed path.
 *
 * A job in any of these owns `target_path` and no second job may take it: an
 * unaccepted candidate still holds it, because the next brief would be written
 * against a file the first job has not landed yet. Enforced by the partial
 * unique index `job_active_target_key`, so the refusal is a `23505` naming the
 * holder rather than a race nobody sees.
 */
export const JOB_ACTIVE_STATES = ["queued", "running", "awaiting_review"] as const;
export type JobActiveState = (typeof JOB_ACTIVE_STATES)[number];

/**
 * Every transition either lifecycle allows, as `from -> to`. Anything absent
 * is refused, and the four (five for a job) terminal states are terminal:
 * their entries are empty.
 *
 * These are data rather than a switch statement because three places need the
 * same answer — the CLI's conditional updates, the runner's reconcile pass and
 * the UI's button states — and a second copy of a state machine is a second
 * state machine.
 */
export const SESSION_TRANSITIONS: Readonly<Record<SessionState, readonly SessionState[]>> = {
  running: ["closed", "failed", "cancelled", "interrupted"],
  closed: [],
  failed: [],
  cancelled: [],
  interrupted: [],
};

/**
 * `queued -> interrupted` is deliberately absent: a queued job survives a
 * restart, because nothing was in flight to lose. `awaiting_review ->
 * interrupted` is present, because the candidate outlives the process that
 * wrote it and a restart has to decide whether it is still trustworthy.
 */
export const JOB_TRANSITIONS: Readonly<Record<JobState, readonly JobState[]>> = {
  queued: ["running", "cancelled"],
  running: ["awaiting_review", "failed", "cancelled", "interrupted"],
  awaiting_review: ["accepted", "discarded", "interrupted"],
  accepted: [],
  discarded: [],
  failed: [],
  cancelled: [],
  interrupted: [],
};

/** Is `to` reachable from `from`? The one place either state machine is read. */
export function canTransition(
  transitions: Readonly<Record<string, readonly string[]>>,
  from: string,
  to: string,
): boolean {
  return (transitions[from] ?? []).includes(to);
}

/**
 * Where a job writes before a person accepts it. Not recursive-visible to the
 * indexer (`filesIn` does not descend), on the same filesystem as the target
 * so the accept rename is atomic, and gitignored.
 */
export const CANDIDATES_DIR = "learn/assets/.candidates";
