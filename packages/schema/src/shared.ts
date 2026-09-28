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

/**
 * The reserved owner of shared content (phase 4 of docs/CONTENT-MIGRATION.md,
 * D23): rows every owner may read and nobody signs in as. A learner id like
 * any other, so `owner_id` needs no second kind of foreign key; its `learner`
 * row is created on first write (`ensureLearner`), as `local`'s is.
 */
export const COMMONS_OWNER = "commons";

/**
 * Whose content one owner may read: their own and the commons. The one
 * definition both the web app (`currentOwner()`) and the catalog's readers use,
 * so a page and a CLI read cannot disagree about what is visible.
 */
export function readableOwners(owner: string): readonly string[] {
  return owner === COMMONS_OWNER ? [COMMONS_OWNER] : [owner, COMMONS_OWNER];
}

/**
 * Who is asking, and whose rows they may see. Every content read takes one
 * (`dbSource`, the asset and concept queries), and every content write is
 * stamped with `owner`.
 */
export interface OwnerScope {
  readonly owner: string;
  readonly readable: readonly string[];
}

/** The scope an owner reads with today: their own rows and the commons. */
export function ownerScope(owner: string): OwnerScope {
  return { owner, readable: readableOwners(owner) };
}

/**
 * The header the web app names the signed-in owner in when it calls the
 * studio runner (`services/studio`). Only the app's server sets it, from
 * `currentOwner()`: the proxy route strips any a page sent before setting its
 * own. The runner serves the one owner it was started for (`STUDIO_OWNER`)
 * and refuses a request naming another.
 */
export const STUDIO_OWNER_HEADER = "x-self-learn-owner";

/**
 * Event types in the log. The `learn` CLI writes the first five; the web app
 * writes `watched`, when the learner marks a library asset watched or read
 * (payload `{ asset, kind }`, no concept).
 *
 * `watched` is study for the streak (`STUDY_EVENT_TYPES` in
 * `apps/web/src/lib/habit-core.ts`) and is not evidence: both replays,
 * `replayMastery` and `replayReviews`, read only `observation` and `review`,
 * so watching a video never moves p(L) or schedules a card. Adding a type here
 * also changes the `event_type_check` constraint, so it needs a migration.
 */
export const EVENT_TYPES = [
  "session-start",
  "observation",
  "review",
  "session-close",
  "void",
  "watched",
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
  /** One of `THEME_MODES`. Mirrored into a cookie so the root layout can render it. */
  theme: "theme",
  /** Bumps on a progress reset so client UI state remounts. */
  epoch: "epoch",
  /** `{ courseSlug, moduleSlug?, at }`. */
  lastVisited: "lastVisited",
  /** `Record<moduleId, UserResource[]>`. Keyed by module, which joins nothing. */
  userResources: "userResources",
  /** BKT parameters, overriding `DEFAULT_PARAMS`. Was `model.json`'s `params`. */
  bktParams: "bktParams",
  /**
   * `{ concepts: number; reviews: boolean }`: the learner's own daily target,
   * concepts to teach or probe plus whether clearing the due queue counts.
   * Read by `apps/web/src/lib/habit.ts`; default `{ concepts: 1, reviews: true }`.
   */
  dailyTarget: "dailyTarget",
  /**
   * A whole number of free misses per Monday-to-Sunday week before the streak
   * breaks, 0 to 7. Read by `apps/web/src/lib/habit.ts`; default 1.
   */
  dailyLeeway: "dailyLeeway",
  /**
   * How the tutor talks: one of `TUTOR_STYLES` in `apps/web/src/lib/preferences.ts`,
   * default `"guide-concise"`. Written from Settings; read by the concept
   * tutor and the session question writer (`apps/web/src/lib/settings.ts`).
   */
  tutorStyle: "tutorStyle",
  /**
   * `"system"` (follow the operating system's reduced-motion setting, the
   * default) or `"always"` (reduce motion whatever the system says). Written
   * from Settings; nothing reads it yet.
   */
  reducedMotion: "reducedMotion",
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

/**
 * The theme is two choices stored as one string. The **palette** is `classic`
 * (the original kit colours) or `gnosia` (the brand's); the **appearance** is
 * `light`, `dark`, or `system`, which follows the device's
 * `prefers-color-scheme`. One string, not two keys, so the cookie the root
 * layout reads, the `preference` row and the import each keep a single value.
 *
 * The first four names predate the palette axis and keep their meaning, so
 * nothing already stored changes: `light`, `dark` and `system` are the classic
 * palette, and `gnosia` is Gnosia light. The two Gnosia modes that came later
 * say both halves. Adding a mode here is the whole schema change;
 * `themeModeFor` must still name every pair.
 */
export const THEME_MODES = ["light", "gnosia", "dark", "system", "gnosia-dark", "gnosia-system"] as const;

export type ThemeMode = (typeof THEME_MODES)[number];

export const THEME_PALETTES = ["classic", "gnosia"] as const;
export type ThemePalette = (typeof THEME_PALETTES)[number];

export const THEME_APPEARANCES = ["light", "dark", "system"] as const;
export type ThemeAppearance = (typeof THEME_APPEARANCES)[number];

/** The mode a stored or posted value names, or null for anything else. */
export function asThemeMode(value: unknown): ThemeMode | null {
  return typeof value === "string" && (THEME_MODES as readonly string[]).includes(value) ? (value as ThemeMode) : null;
}

const MODE_FOR: Record<ThemePalette, Record<ThemeAppearance, ThemeMode>> = {
  classic: { light: "light", dark: "dark", system: "system" },
  gnosia: { light: "gnosia", dark: "gnosia-dark", system: "gnosia-system" },
};

/** The one mode that stores a palette and an appearance together. */
export function themeModeFor(palette: ThemePalette, appearance: ThemeAppearance): ThemeMode {
  return MODE_FOR[palette][appearance];
}

/** Which palette a mode draws with. */
export function paletteOf(mode: ThemeMode): ThemePalette {
  return mode === "gnosia" || mode.startsWith("gnosia-") ? "gnosia" : "classic";
}

/** Whether a mode is light, dark, or follows the device. */
export function appearanceOf(mode: ThemeMode): ThemeAppearance {
  if (mode === "dark" || mode === "gnosia-dark") return "dark";
  if (mode === "system" || mode === "gnosia-system") return "system";
  return "light";
}

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
 * Where a job's `cost_usd` came from.
 *
 * `result` is the agent's own `total_cost_usd`, which only exists when the
 * session exited cleanly. `stream` is the runner's accumulation from the
 * intermediate per-message `usage` events, which is what a cancelled, timed-out
 * or interrupted attempt leaves behind — and which under-reports, because the
 * `output_tokens` on those events is the value before the message finished
 * generating. `services/studio/src/cost.ts` carries the measurements.
 *
 * Both are recorded, because a cap that counted only the clean finishes would
 * be a cap anybody could walk past by pressing Cancel. They are told apart,
 * because a reader who cannot do that cannot tell a bill from a guess.
 */
export const COST_SOURCES = ["result", "stream"] as const;
export type CostSource = (typeof COST_SOURCES)[number];

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

/**
 * What a studio draft's briefs produce (D42 of docs/STUDIO-CHAT-FIRST.md).
 * Only `diagram` exists; a manimkc video is the next kind, through the same
 * chat, and the column is here so that day needs no backfill.
 */
export const DRAFT_KINDS = ["diagram"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

/**
 * A draft is one conversation with the studio's planner.
 *
 * `open` has no valid brief in force; `briefed` has one and Draw is live;
 * `drawing` follows its newest job while that job is in flight or waiting for
 * review; `done` is a drawing accepted or discarded; `abandoned` is closed for
 * good, by a person or by the turn cap.
 */
export const DRAFT_STATES = ["open", "briefed", "drawing", "done", "abandoned"] as const;
export type DraftState = (typeof DRAFT_STATES)[number];

/** The last failure a draft records: a refused first request, a brief refused twice, a turn cut off. */
export const DRAFT_ERROR_KINDS = ["agent", "brief-invalid", "timeout", "interrupted"] as const;
export type DraftErrorKind = (typeof DRAFT_ERROR_KINDS)[number];

/**
 * The draft's lifecycle (the state diagram in docs/STUDIO-CHAT-FIRST.md), as
 * data for the reason the job's is. A newer brief on a `briefed` draft, or
 * another question on an `open` one, is a write to the row and not a
 * transition, so neither state lists itself.
 */
export const DRAFT_TRANSITIONS: Readonly<Record<DraftState, readonly DraftState[]>> = {
  // `open -> drawing` and `done -> drawing` are a Resume or a Revise from the
  // job panel, which carry the job's draft: the conversation follows the new
  // job whatever it was doing when the button was pressed.
  open: ["briefed", "drawing", "abandoned"],
  briefed: ["open", "drawing", "abandoned"],
  drawing: ["briefed", "done"],
  done: ["open", "drawing"],
  abandoned: [],
};

/** Is `to` reachable from `from`? The one place either state machine is read. */
export function canTransition(
  transitions: Readonly<Record<string, readonly string[]>>,
  from: string,
  to: string,
): boolean {
  return (transitions[from] ?? []).includes(to);
}

/** A value JSON can hold. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/**
 * A value in canonical form: keys sorted at every depth, instants as ISO
 * strings, `undefined` keys dropped. The one definition of "the same content"
 * that a revision's `snapshot_hash`, a diagram's `document_hash` and the
 * studio's check of a checked-out `.tldr` all hash, so the three cannot drift.
 * Here because the studio reaches the catalog through its CLI only and takes
 * nothing else from it.
 */
export function canonical(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object") {
    const out: Record<string, JsonValue> = {};
    for (const key of Object.keys(value as object).sort()) {
      const inner = (value as Record<string, unknown>)[key];
      if (inner !== undefined) out[key] = canonical(inner);
    }
    return out;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  throw new Error(`cannot put a ${typeof value} in canonical JSON`);
}

/** The canonical serialisation. `JSON.stringify` of a canonical value is already stable. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}
