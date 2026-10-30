/**
 * The constants and plain types both halves of the repo have to agree on, with
 * no imports.
 *
 * This file deliberately pulls in nothing — not drizzle, not node. That is
 * what makes it importable from a `"use client"` component in `src/` through
 * the `@gnosia/schema/shared` subpath without dragging a Postgres driver
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

/**
 * The image types a course cover may be, by the file extension its blob key
 * and its export file carry. A closed list: `catalog course cover` refuses
 * anything else by its magic bytes, and the cover route serves only these.
 */
export const COURSE_COVER_TYPES = {
  webp: "image/webp",
  jpg: "image/jpeg",
  png: "image/png",
} as const;
export type CourseCoverExt = keyof typeof COURSE_COVER_TYPES;

/**
 * The largest cover `catalog course cover` stores, in bytes. A card shows it
 * at 960x540 at most, where a WebP is under 100 KB and even a PNG is well
 * under this; anything larger is a photo nobody resized.
 */
export const COURSE_COVER_MAX_BYTES = 2 * 1024 * 1024;

/** The default single learner. One row until auth exists; not a UUID so it stays readable. */
export const LOCAL_LEARNER_ID = "local";

/**
 * The deployment secrets' environment names, shared so the web app's auth
 * core, the BYOK seal and the sidecar all read the same variables.
 */
export const OWNER_PASSWORD_VAR = "OWNER_PASSWORD";
export const AUTH_SECRET_VAR = "AUTH_SECRET";

/**
 * The per-launch secret the desktop shell puts in the spawned server's
 * environment and then redeems at `GET /api/auth/local` for a real session
 * cookie. A random value minted per launch — it is never written to an
 * `.env` file, so a deployment that never runs the shell simply has it
 * unset, and the route refuses everyone.
 */
export const LOCAL_TOKEN_VAR = "GNOSIA_LOCAL_TOKEN";

/** Shortest secret accepted: 32 characters is what `openssl rand -base64 32` yields. */
export const MIN_SECRET_LENGTH = 32;

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
export const STUDIO_OWNER_HEADER = "x-gnosia-owner";

/**
 * Event types in the log. The `learn` CLI writes the first five; the web app
 * writes `watched`, when the learner marks a library asset watched or read
 * (payload `{ asset, kind }`, no concept).
 *
 * `watched` is study for the streak (`STUDY_EVENT_TYPES` in
 * `apps/web/src/lib/habit-core.ts`) and is not evidence: both replays,
 * `replayMastery` and `replayReviews`, read only `observation` and `review`,
 * so watching a video never moves p(L) or schedules a card.
 *
 * `visit` is written by the web app each time the owner opens a course or
 * module page (payload `{ course, module? }`, no concept, no session), by
 * `POST /api/learner/preference` beside the `lastVisited` it keeps. It is
 * neither study nor evidence: the sidebar's Recent and Home's "Pick up where
 * you left off" read it (`apps/web/src/lib/recent.ts`), so a visit older than
 * the five the `recentModules` preference keeps still shows (L7 of
 * docs/proposals/library-by-type-and-day.md).
 *
 * Adding a type here also changes the `event_type_check` constraint, so it
 * needs a migration (`0008` for `watched`, `0025` for `visit`).
 */
export const EVENT_TYPES = [
  "session-start",
  "observation",
  "review",
  "session-close",
  "void",
  "watched",
  "visit",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/**
 * Where a recap came from. Mirrors `KnowledgeSource` in
 * `apps/web/src/lib/types.ts`.
 */
export const RECAP_SOURCES = ["agent", "manual"] as const;
export type RecapSource = (typeof RECAP_SOURCES)[number];

/**
 * The tutor's model providers, in the order the cascade tries them
 * (`apps/web/src/lib/agent/providers.ts`), and the vocabulary of
 * `provider_key.provider` (docs/BYOK.md).
 */
export const PROVIDER_IDS = [
  "nvidia",
  "gemini",
  "openrouter",
  "openai",
  "anthropic",
  "deepseek",
  "glm",
  "qwen",
  "moonshot",
  "minimax",
  "mimo",
  "mistral",
  "groq",
  "xai",
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/**
 * A provider the owner added themselves (docs/TUTOR-MODELS.md, T14): any
 * OpenAI-compatible endpoint, named `custom-<slug>`. The id lives in the same
 * `provider` columns as a built-in's, so its key is a `provider_key` row and
 * its models are chain entries like any other.
 */
export const CUSTOM_PROVIDER_PREFIX = "custom-";
/** `custom-`, then 1 to 40 lowercase letters, digits and hyphens, not starting or ending with a hyphen. */
export const CUSTOM_PROVIDER_ID_PATTERN = /^custom-[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
/** The same rule, written for a Postgres CHECK. */
export const CUSTOM_PROVIDER_ID_SQL = "^custom-[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$";
export type CustomProviderId = `custom-${string}`;
/** A built-in provider or one the owner added: what a `provider` column holds. */
export type ProviderName = ProviderId | CustomProviderId;

/** How many providers an owner may add, and how long a name and a base URL may be. */
export const CUSTOM_PROVIDER_LIMITS = { maxProviders: 10, maxLabelChars: 60, maxBaseUrlChars: 300 } as const;

export function isCustomProviderId(value: unknown): value is CustomProviderId {
  return typeof value === "string" && CUSTOM_PROVIDER_ID_PATTERN.test(value);
}

/** A built-in id or a custom one's shape. Whether the owner has that custom provider is the caller's to check. */
export function isProviderName(value: unknown): value is ProviderName {
  return isProviderId(value) || isCustomProviderId(value);
}

/** The hosts a custom provider may reach over plain http: this machine, for a local model server. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * A custom provider's base URL, checked (T14): `https:`, or `http:` to this
 * machine only (a local Ollama or LM Studio), with no user name, password,
 * query or fragment, at most `maxBaseUrlChars`, and a trailing slash
 * dropped, since the tutor appends `/chat/completions` and `/models`. The
 * owner's key for the provider is sent to exactly this URL and no built-in
 * key ever is. The reason never repeats the value.
 */
export function checkBaseUrl(value: unknown): { ok: true; url: string } | { ok: false; reason: string } {
  if (typeof value !== "string") return { ok: false, reason: "The base URL must be text." };
  const raw = value.trim();
  if (raw.length === 0) return { ok: false, reason: "Enter the provider's base URL." };
  if (raw.length > CUSTOM_PROVIDER_LIMITS.maxBaseUrlChars) {
    return { ok: false, reason: `The base URL is longer than ${CUSTOM_PROVIDER_LIMITS.maxBaseUrlChars} characters.` };
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "That is not a URL. It looks like https://api.example.com/v1." };
  }
  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    return { ok: false, reason: "The base URL must start with https:// (plain http:// only for localhost)." };
  }
  if (url.username !== "" || url.password !== "") return { ok: false, reason: "Put the key in the API key field, not in the URL." };
  if (url.search !== "" || url.hash !== "") return { ok: false, reason: "The base URL takes no query or fragment." };
  return { ok: true, url: `${url.origin}${url.pathname}`.replace(/\/+$/, "") };
}

/** A custom provider's name, checked: 1 to `maxLabelChars` characters with no control characters. */
export function checkProviderLabel(value: unknown): { ok: true; label: string } | { ok: false; reason: string } {
  if (typeof value !== "string") return { ok: false, reason: "The name must be text." };
  const label = value.trim().replace(/\s+/g, " ");
  if (label.length === 0) return { ok: false, reason: "Give the provider a name." };
  if (label.length > CUSTOM_PROVIDER_LIMITS.maxLabelChars) {
    return { ok: false, reason: `The name is longer than ${CUSTOM_PROVIDER_LIMITS.maxLabelChars} characters.` };
  }
  if (/[\u0000-\u001f\u007f]/.test(label)) return { ok: false, reason: "The name has a character it cannot hold." };
  return { ok: true, label };
}

/** The id a new custom provider gets from its name: `custom-<slug>`, with `-2`, `-3`… when `taken` has it. */
export function customProviderId(label: string, taken: readonly string[]): CustomProviderId {
  const slug =
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32)
      .replace(/-+$/, "") || "provider";
  const used = new Set(taken);
  let id: CustomProviderId = `${CUSTOM_PROVIDER_PREFIX}${slug}`;
  for (let n = 2; used.has(id); n += 1) id = `${CUSTOM_PROVIDER_PREFIX}${slug}-${n}`;
  return id;
}

/**
 * The bounds on a stored provider key (docs/BYOK.md, decision 5). Saving
 * checks the shape only; the Test button is the real check. The floor keeps
 * the four characters Settings shows from being a large part of the key: every
 * real key is well past it (NVIDIA's and OpenRouter's are about 70, Gemini's
 * 39). The ceiling bounds the ciphertext, which a CHECK repeats.
 */
export const PROVIDER_KEY_LIMITS = { minChars: 16, maxChars: 512 } as const;

/** Each provider as a person reads it: every message, card and attempt shows this, never the id. */
export const PROVIDER_LABELS = {
  nvidia: "NVIDIA NIM",
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
  openai: "OpenAI",
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
  glm: "Zhipu GLM",
  qwen: "Alibaba Qwen",
  moonshot: "Moonshot Kimi",
  minimax: "MiniMax",
  mimo: "Xiaomi MiMo",
  mistral: "Mistral",
  groq: "Groq",
  xai: "xAI Grok",
} as const satisfies Record<ProviderId, string>;

/** A provider's label, or the value itself when it names no provider. */
export function providerLabel(value: string): string {
  return isProviderId(value) ? PROVIDER_LABELS[value] : value;
}

/** Whether `value` names a provider the tutor knows. */
export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && (PROVIDER_IDS as readonly string[]).includes(value);
}

/**
 * The bounds on the tutor's model chain (docs/TUTOR-MODELS.md): how many
 * entries an owner may keep, and how long a model id may be. Every tutor turn
 * walks the chain until one answers, so the entry cap also caps how many
 * provider requests one failing turn can spend. The id cap is well past any
 * real id (OpenRouter's longest are about 60 characters). A CHECK repeats both.
 */
export const TUTOR_MODEL_LIMITS = { maxEntries: 10, maxModelChars: 200 } as const;

/**
 * A model chain grouped by provider: each provider's entries together, in
 * their order, and the providers in the order each first appears. Settings
 * shows the chain this way (each provider's models under it) and the tutor
 * walks it this way, so the two cannot disagree even for a chain written
 * before the grouping, whose providers could interleave. Stable, and the
 * identity on a chain that is already grouped.
 */
export function groupByProvider<T extends { provider: string }>(chain: readonly T[]): T[] {
  const order: string[] = [];
  const blocks = new Map<string, T[]>();
  for (const entry of chain) {
    let block = blocks.get(entry.provider);
    if (block === undefined) {
      block = [];
      blocks.set(entry.provider, block);
      order.push(entry.provider);
    }
    block.push(entry);
  }
  return order.flatMap((provider) => blocks.get(provider) ?? []);
}

/** Printable ASCII with no space: what a model id is made of, and all a request header or JSON body needs. */
export const MODEL_ID_PATTERN = /^[\x21-\x7e]+$/;

/**
 * Whether a model id looks like an API key rather than a model
 * (docs/TUTOR-MODELS.md, T11): it starts with a provider key prefix (NVIDIA's
 * `nvapi-`, OpenRouter's `sk-or-`, OpenAI-style `sk-`, Google's `AIza`), or it
 * holds a run of 20 or more letters and digits with both in it, which random
 * key material does and model ids, whose words are split by `-`, `.`, `/` or
 * `:`, do not. A model chain row is stored in the clear and exported, so a
 * key pasted into the wrong field must never reach it.
 */
export function looksLikeKey(model: string): boolean {
  if (/^(nvapi-|sk-|AIza)/.test(model)) return true;
  for (const run of model.match(/[A-Za-z0-9]{20,}/g) ?? []) {
    if (/[0-9]/.test(run) && /[A-Za-z]/.test(run)) return true;
  }
  return false;
}

/**
 * A model id as sent by a person or a provider, checked (docs/TUTOR-MODELS.md,
 * T5, T11): surrounding whitespace dropped, then 1 to `maxModelChars`
 * characters of printable ASCII with no whitespace, and nothing that looks
 * like an API key. The reason never repeats the value.
 */
export function checkModelId(value: unknown): { ok: true; model: string } | { ok: false; reason: string } {
  if (typeof value !== "string") return { ok: false, reason: `"model" must be a string.` };
  const model = value.trim();
  if (model.length === 0) return { ok: false, reason: "The model id is empty." };
  if (model.length > TUTOR_MODEL_LIMITS.maxModelChars) {
    return { ok: false, reason: `A model id is at most ${TUTOR_MODEL_LIMITS.maxModelChars} characters.` };
  }
  if (!MODEL_ID_PATTERN.test(model)) {
    return { ok: false, reason: "A model id is printable ASCII with no spaces." };
  }
  if (looksLikeKey(model)) {
    return { ok: false, reason: "That looks like an API key, not a model id. Keys go under Provider keys." };
  }
  return { ok: true, model };
}

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
  /**
   * `{ courseSlug, moduleSlug?, at }[]`, newest first, at most five: the
   * modules Home lists under "Pick up where you left off". Never written by a
   * browser: `POST /api/learner/preference` keeps it whenever it writes
   * `lastVisited`, which stays a single object because the course list
   * resumes from it (docs/proposals/home-page.md).
   */
  recentModules: "recentModules",
  /** `Record<moduleId, UserResource[]>`. Keyed by module, which joins nothing. */
  userResources: "userResources",
  /**
   * `string[]`: the slugs of the courses the learner has set aside. Absent or
   * empty means every course is active, so a course added later starts
   * active. The Courses page folds these under "Inactive courses", and
   * Continue learning on it and on Today leaves them out.
   */
  inactiveCourses: "inactiveCourses",
  /** BKT parameters, overriding `DEFAULT_PARAMS`. Was `model.json`'s `params`. */
  bktParams: "bktParams",
  /**
   * `{ concepts: number; reviews: boolean }`: the learner's own daily target,
   * concepts to teach or probe plus whether clearing the due queue counts.
   * Unread and unwritable since the habit layer was removed (H1 of
   * docs/proposals/home-page.md); named so the stored rows keep a name.
   */
  dailyTarget: "dailyTarget",
  /**
   * A whole number of free misses per Monday-to-Sunday week before the streak
   * breaks, 0 to 7. Unread and unwritable since H1, like `dailyTarget`.
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
  /**
   * The model and effort the studio's video agent runs with (D53 of
   * docs/STUDIO-VIDEOS.md): `{ model, effort }`, each `"default"` or a value
   * the CLI takes. Written from the studio's settings panel; the runner reads
   * it at job start through `catalog preference get`. See
   * `studioAgentPreference` for the reading every consumer shares.
   */
  studioVideoAgent: "studioVideoAgent",
  /** The same for the studio's diagram agent. Absent means today's `sonnet`, the runner's default. */
  studioDiagramAgent: "studioDiagramAgent",
  /**
   * `{ key, kind, title, href, at }[]`, newest pin first: the rows the owner
   * pinned in the sidebar's Recent (L7 of
   * docs/proposals/library-by-type-and-day.md), each a copy of the row as it
   * was pinned, so a pin outlives the row leaving Recent. Written by
   * `POST /api/learner/recent`, never through the preference route.
   */
  pinned: "pinned",
} as const;

export type PreferenceKey = (typeof PREFERENCE_KEYS)[keyof typeof PREFERENCE_KEYS];

/** The two preference keys D53 of docs/STUDIO-VIDEOS.md names, and the only ones `catalog preference get` answers. */
export const STUDIO_AGENT_PREFERENCE_KEYS = [PREFERENCE_KEYS.studioVideoAgent, PREFERENCE_KEYS.studioDiagramAgent] as const;
export type StudioAgentPreferenceKey = (typeof STUDIO_AGENT_PREFERENCE_KEYS)[number];

/** The effort levels `claude --effort` takes (2.1.274). */
export const AGENT_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type AgentEffort = (typeof AGENT_EFFORTS)[number];

/** A studio agent's model and effort: `"default"` means the owner's Claude Code default, resolved by the runner. */
export interface StudioAgentPreference {
  model: string;
  effort: "default" | AgentEffort;
}

/**
 * A model name `claude --model` could take, and the one rule every reader and
 * writer of a studio agent preference shares: an alias or a full id, lower
 * case, letters, digits, dots and hyphens, and at most one context suffix in
 * brackets at the end (`claude-fable-5-1[1m]`). Never a flag. A looser rule at
 * set time than at read time once stored "Sonnet", which the runner then read
 * as "default" and ran on the owner's own, dearer default.
 */
const AGENT_MODEL = /^[a-z][a-z0-9.-]{0,79}(\[[0-9a-z]{1,8}\])?$/;

/** Whether a string is a model name a studio agent preference may hold (see `AGENT_MODEL`). */
export function isAgentModel(value: unknown): value is string {
  return typeof value === "string" && AGENT_MODEL.test(value);
}

/**
 * A stored `studioVideoAgent` or `studioDiagramAgent` value, read the one way
 * the web app, the runner and the CLI all read it: each field kept when it is
 * a value the CLI takes, and `"default"` otherwise, so a hand-edited row can
 * never put a stray flag on the agent's command line.
 */
export function studioAgentPreference(value: unknown): StudioAgentPreference {
  const record = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const model = typeof record.model === "string" && (record.model === "default" || isAgentModel(record.model)) ? record.model : "default";
  const effort =
    typeof record.effort === "string" && (AGENT_EFFORTS as readonly string[]).includes(record.effort)
      ? (record.effort as AgentEffort)
      : "default";
  return { model, effort };
}

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
  // The palette predates the rename: cookies and preference rows written
  // before it still say `self-learn*`, which are the gnosia modes renamed.
  if (typeof value === "string" && value.startsWith("self-learn")) {
    value = `gnosia${value.slice("self-learn".length)}`;
  }
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

/** At most 50 modules, 50 links each: a personal reading list, not a mirror. */
export const USER_RESOURCE_LIMITS = { modules: 50, perModule: 50, chars: 2_000, moduleIdChars: 128 } as const;

/**
 * Whether a reading-list URL may be stored: http(s) only. The value comes back
 * out into an href, and a stored `javascript:` URL would be a self-inflicted
 * XSS on the next render.
 */
export function isUserResourceUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * A reading list with what the preference route would refuse dropped rather
 * than refused: a URL that is not http(s), a field past the length cap, a
 * module id too long, and anything past the module and per-module caps. For
 * a writer that must not fail on one bad entry (the legacy import), so every
 * way in is held to the preference route's rules.
 */
export function keepValidUserResources(value: Record<string, readonly UserResource[]>): Record<string, UserResource[]> {
  const out: Record<string, UserResource[]> = {};
  for (const [moduleId, list] of Object.entries(value)) {
    if (Object.keys(out).length >= USER_RESOURCE_LIMITS.modules) break;
    if (moduleId === "" || moduleId.length > USER_RESOURCE_LIMITS.moduleIdChars) continue;
    const kept = list
      .filter(
        (r) =>
          isUserResourceUrl(r.url) &&
          [r.id, r.title, r.url].every((text) => typeof text === "string" && text.length <= USER_RESOURCE_LIMITS.chars),
      )
      .slice(0, USER_RESOURCE_LIMITS.perModule)
      .map((r) => ({ id: r.id, title: r.title, url: r.url }));
    if (kept.length > 0) out[moduleId] = kept;
  }
  return out;
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
  /** Course slugs the learner set aside (`PREFERENCE_KEYS.inactiveCourses`). */
  inactiveCourses: string[];
  /**
   * What the learner asked to be called (`learner.display_name`), shown in
   * the sidebar's account row and set on Settings. Absent until they set one.
   */
  displayName?: string;
  /**
   * The learner's pixel sprite (`learner.avatar`), shown in the sidebar's
   * account row and chosen on Settings' Profile tab. Every learner row has
   * one, drawn at random when the row is made; absent only in the state
   * rendered before anything is known, or with the database unreachable.
   */
  avatar?: AvatarId;
}

/**
 * The pixel sprites a learner can wear, in the order the picker lists them:
 * the library's familiars (docs/design/BRAND.md, "Avatar sprites"). The
 * names are stored in `learner.avatar`, whose check constraint and random
 * default are written from this list, so adding one is a migration; the
 * pictures are `apps/web/src/components/avatar/sprites.ts`.
 */
export const AVATARS = [
  "owl",
  "cat",
  "bookworm",
  "fox",
  "hedgehog",
  "raven",
  "frog",
  "mouse",
  "moth",
  "tortoise",
  "rabbit",
  "bat",
] as const;

export type AvatarId = (typeof AVATARS)[number];

export function isAvatar(value: unknown): value is AvatarId {
  return typeof value === "string" && (AVATARS as readonly string[]).includes(value);
}

/** What a learner's sprite is called in words, for its picker label and a screen reader. */
export function avatarLabel(id: AvatarId): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/** The longest name `learner.display_name` takes, in characters. */
export const DISPLAY_NAME_MAX = 60;

/**
 * A name as it is stored: trimmed, inner runs of whitespace (a tab, a line
 * break) as one space, and null when nothing is left. Anything but a string
 * is null too. Length is the writer's to refuse (`DISPLAY_NAME_MAX`), never
 * cut here, so a reader cannot silently shorten what was saved.
 */
export function cleanDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned === "" ? null : cleaned;
}

/** The longest name `asset_name.title` takes, in characters. */
export const ASSET_NAME_MAX = 200;

/**
 * An asset's name as the learner typed it, stored the way `cleanDisplayName`
 * stores theirs: trimmed, whitespace runs as one space, null when nothing is
 * left. Null means "no name of mine", so the source's title shows again.
 */
export function cleanAssetName(value: unknown): string | null {
  return cleanDisplayName(value);
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
  inactiveCourses: [],
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

/**
 * What a generation job produces: a tldraw diagram, or a manimkc video made
 * through the studio's chat (docs/STUDIO-VIDEOS.md). A video job's
 * `target_path` is `videos/<slug>.mp4`, a logical name like a diagram's.
 */
export const JOB_KINDS = ["diagram", "video"] as const;
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
 * What a studio draft's briefs produce (D42 of docs/STUDIO-CHAT-FIRST.md):
 * a diagram, or a manimkc video (docs/STUDIO-VIDEOS.md, D51), chosen before
 * the draft's first paid turn and fixed after it.
 */
export const DRAFT_KINDS = ["diagram", "video"] as const;
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
