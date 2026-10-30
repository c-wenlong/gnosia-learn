import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ProviderName } from "@gnosia/schema/shared";

import { agentEnv } from "./agent";
import { KeysUnavailable, openSavedKey, savedKeys, type KeyAccess } from "./byok-keys";
import { studioHome } from "../paths";
import { JobRefused } from "../diagram/runner";

/**
 * The BYOK harness: Qwen Code (`qwen`), run on the owner's own provider key.
 *
 * Qwen Code is a Gemini CLI fork whose headless surface is deliberately
 * `claude -p`-shaped: `-o stream-json` emits `system`/`assistant`/`user`/
 * `result` NDJSON with per-message `usage`, so `PlannerRun`'s parser and the
 * cost meter read it without a second implementation. Its OpenAI-compatible
 * auth (`OPENAI_API_KEY` + `OPENAI_BASE_URL` + `OPENAI_MODEL`) reaches any
 * provider that speaks that protocol, which is what the picker's BYOK dialog
 * configures.
 *
 * Two halves, kept apart on purpose (docs/BYOK.md, D12). The key is the one
 * the owner saved in Settings, sealed in the catalog: `byok-keys.ts` opens it
 * with `AUTH_SECRET` when a turn spawns, and the runner keeps no copy of it.
 * What the runner does keep is which providers Studio uses, which one runs
 * and each one's tier models, in `$STUDIO_HOME/byok-settings.json`: nothing
 * in that file is a secret.
 */

/** The model tiers a BYOK provider configures (D94): the names a conversation's Lite/Default/Max pick resolves against. */
export interface ByokTierModels {
  default?: string;
  lite?: string;
  max?: string;
}

export type ByokProviderName = keyof typeof BYOK_PROVIDERS;

/** What `byok-settings.json` holds: the providers Studio uses, their tier models, and which a `byok` spawn runs on. Never a key. */
export interface ByokSettings {
  active: ByokProviderName | null;
  providers: Partial<Record<ByokProviderName, { models: ByokTierModels }>>;
}

/** What `GET /api/settings/byok` reports: enough to render the dialog and the tier menu, never a key. */
export interface ByokStatus {
  configured: boolean;
  /** The provider a `byok` turn runs on. */
  active: string | null;
  /** The active provider's default-tier model, for the row that says what runs. */
  model: string | null;
  /** The providers Studio uses whose saved key opens; a tail of each key, never the key. */
  providers: { provider: string; last4: string; models: ByokTierModels }[];
  /** Why the saved keys cannot be read (no `AUTH_SECRET`, no catalog), or null. */
  error: string | null;
}

interface ByokProvider {
  /** The tutor's id for the same account, under which its key is saved (`TUTOR_TO_BYOK` in apps/web). */
  tutor: ProviderName;
  /** The env var the key goes into. */
  keyVar: string;
  /** The env var the endpoint goes into, and its fixed value. */
  baseUrlVar: string;
  baseUrl: string;
  /** The env var the model goes into. */
  modelVar: string;
  /** Where the provider's model list lives, for the dialog's combobox. */
  modelsUrl: string;
  /** How the key reaches that endpoint. */
  auth: "bearer" | "x-api-key";
}

/**
 * The providers the dialog offers, each mapped onto the env a `qwen` spawn
 * reads. Every one is a preset pair of URL and variables rather than a free
 * field, so a mistyped endpoint cannot send the key somewhere else.
 *
 * `anthropic` and `google` go through the same OpenAI-compatible knobs qwen
 * documents for native-protocol endpoints; if a released CLI names them
 * differently, this table is the one place that changes.
 */
export const BYOK_PROVIDERS = {
  openai: {
    tutor: "openai",
    keyVar: "OPENAI_API_KEY",
    baseUrlVar: "OPENAI_BASE_URL",
    baseUrl: "https://api.openai.com/v1",
    modelVar: "OPENAI_MODEL",
    modelsUrl: "https://api.openai.com/v1/models",
    auth: "bearer",
  },
  openrouter: {
    tutor: "openrouter",
    keyVar: "OPENAI_API_KEY",
    baseUrlVar: "OPENAI_BASE_URL",
    baseUrl: "https://openrouter.ai/api/v1",
    modelVar: "OPENAI_MODEL",
    modelsUrl: "https://openrouter.ai/api/v1/models",
    auth: "bearer",
  },
  anthropic: {
    tutor: "anthropic",
    keyVar: "ANTHROPIC_API_KEY",
    baseUrlVar: "ANTHROPIC_BASE_URL",
    baseUrl: "https://api.anthropic.com",
    modelVar: "ANTHROPIC_MODEL",
    modelsUrl: "https://api.anthropic.com/v1/models",
    auth: "x-api-key",
  },
  // NVIDIA NIM is OpenAI-compatible too — the same three variables carry it.
  nvidia: {
    tutor: "nvidia",
    keyVar: "OPENAI_API_KEY",
    baseUrlVar: "OPENAI_BASE_URL",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    modelVar: "OPENAI_MODEL",
    modelsUrl: "https://integrate.api.nvidia.com/v1/models",
    auth: "bearer",
  },
  // Google's OpenAI-compatible endpoint, so the same three variables carry it.
  google: {
    tutor: "gemini",
    keyVar: "OPENAI_API_KEY",
    baseUrlVar: "OPENAI_BASE_URL",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    modelVar: "OPENAI_MODEL",
    modelsUrl: "https://generativelanguage.googleapis.com/v1beta/openai/models",
    auth: "bearer",
  },
} satisfies Record<string, ByokProvider>;

/** Every env name a BYOK spawn may carry, so a spawn builds a sealed set rather than adding to the runner's own. */
const BYOK_ENV_VARS = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MODEL",
  "QWEN_SYSTEM_MD",
] as const;

/** `$STUDIO_HOME/byok-settings.json`: the providers Studio uses and their tiers. */
export function byokSettingsPath(): string {
  return path.join(studioHome(), "byok-settings.json");
}

/** `$STUDIO_HOME/byok.json`: where an older runner kept the keys in the clear. Read once, by `migrateLegacyByok`, then deleted. */
export function legacyByokPath(): string {
  return path.join(studioHome(), "byok.json");
}

/** The stored settings, or null when none were ever saved. An unreadable or malformed file is "none", not a crash. */
export async function loadByokSettings(): Promise<ByokSettings | null> {
  let raw: string;
  try {
    raw = await readFile(byokSettingsPath(), "utf8");
  } catch {
    return null;
  }
  try {
    return readSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Tier models as stored, each a non-empty trimmed string. */
function readModels(raw: unknown): ByokTierModels {
  const modelsIn = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const models: ByokTierModels = {};
  for (const tier of ["default", "lite", "max"] as const) {
    const model = modelsIn[tier];
    if (typeof model === "string" && model.trim() !== "") models[tier] = model.trim();
  }
  return models;
}

/** `{ active, providers: { name: { models } } }`, providers the table does not have dropped, and any `apiKey` ignored. */
function readSettings(raw: unknown): ByokSettings | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const providersIn = typeof input.providers === "object" && input.providers !== null ? (input.providers as Record<string, unknown>) : {};
  const providers: ByokSettings["providers"] = {};
  for (const [name, entry] of Object.entries(providersIn)) {
    if (!Object.hasOwn(BYOK_PROVIDERS, name) || typeof entry !== "object" || entry === null) continue;
    providers[name as ByokProviderName] = { models: readModels((entry as { models?: unknown }).models) };
  }
  const active = typeof input.active === "string" && Object.hasOwn(providers, input.active) ? (input.active as ByokProviderName) : null;
  return { active, providers };
}

/** The settings, written whole — temp file and rename, never a half file. */
async function persistSettings(settings: ByokSettings): Promise<void> {
  await mkdir(studioHome(), { recursive: true });
  const temporary = `${byokSettingsPath()}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(settings, null, 1)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, byokSettingsPath());
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** What `migrateLegacyByok` did, for the start-up log line. */
export interface LegacyByokMigration {
  /** True when a `byok.json` was found and deleted. */
  removed: boolean;
  /** Providers whose picks and tiers moved into `byok-settings.json`. */
  carried: ByokProviderName[];
  /** Providers whose key was only in `byok.json` (none saved in Settings), so the owner enters it again; null when the catalog could not be asked. */
  keyless: ByokProviderName[] | null;
}

/**
 * The first start after the upgrade (docs/BYOK.md, D12): delete the plaintext
 * `byok.json` an older runner kept, carrying its provider picks and tier
 * models (never its keys) into `byok-settings.json` when that does not exist
 * yet. Each provider's key is the one saved in Settings from now on; one the
 * old file held and Settings does not is named in the answer, so the start-up
 * line says which to enter again. The file is deleted whether or not the
 * catalog can be asked, and so is any temp file a write of it left behind.
 */
export async function migrateLegacyByok(): Promise<LegacyByokMigration> {
  const legacy = legacyByokPath();
  let raw: string | null = null;
  try {
    raw = await readFile(legacy, "utf8");
  } catch {
    raw = null;
  }
  const leftovers = (await readdir(studioHome()).catch(() => [] as string[])).filter((name) => /^byok\.json\..+\.tmp$/.test(name));
  for (const name of leftovers) await rm(path.join(studioHome(), name), { force: true });
  if (raw === null) return { removed: false, carried: [], keyless: [] };

  let old: ReturnType<typeof readLegacyFile> = null;
  try {
    old = readLegacyFile(JSON.parse(raw));
  } catch {
    old = null;
  }
  // Gone before anything else can fail: the point of the step is that no
  // plaintext key outlives it.
  await rm(legacy, { force: true });
  if (old === null) return { removed: true, carried: [], keyless: [] };

  const carried = Object.keys(old.settings.providers) as ByokProviderName[];
  if ((await loadByokSettings()) === null && carried.length > 0) await persistSettings(old.settings);
  let keyless: ByokProviderName[] | null;
  try {
    const saved = await savedKeys();
    keyless = old.keyed.filter((name) => saved.get(BYOK_PROVIDERS[name].tutor)?.readable !== true);
  } catch {
    keyless = null;
  }
  return { removed: true, carried, keyless };
}

/**
 * An older runner's `byok.json`, either shape it wrote: v2 `{ active,
 * providers: { name: { apiKey, models } } }`, or the v1 `{ provider, apiKey,
 * model }` of a first save. Read for its settings and for which providers
 * had a key, never for the keys themselves.
 */
function readLegacyFile(raw: unknown): { settings: ByokSettings; keyed: ByokProviderName[] } | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const hasKey = (value: unknown): boolean => typeof value === "string" && value.trim() !== "";
  if (typeof input.provider === "string" && Object.hasOwn(BYOK_PROVIDERS, input.provider.trim().toLowerCase())) {
    const provider = input.provider.trim().toLowerCase() as ByokProviderName;
    const model = typeof input.model === "string" ? input.model.trim() : "";
    return {
      settings: { active: provider, providers: { [provider]: { models: model === "" ? {} : { default: model } } } },
      keyed: hasKey(input.apiKey) ? [provider] : [],
    };
  }
  const settings = readSettings(raw);
  if (settings === null) return null;
  const providersIn = typeof input.providers === "object" && input.providers !== null ? (input.providers as Record<string, unknown>) : {};
  const keyed = (Object.keys(settings.providers) as ByokProviderName[]).filter((name) => hasKey((providersIn[name] as { apiKey?: unknown }).apiKey));
  if (settings.active === null) settings.active = (Object.keys(settings.providers)[0] as ByokProviderName | undefined) ?? null;
  return { settings, keyed };
}

/** A provider name checked against the table: own-property only, so `"constructor"` and `"__proto__"` are not providers. */
export function checkByokProvider(raw: unknown): ByokProviderName {
  const provider = (typeof raw === "string" ? raw.trim().toLowerCase() : "") as ByokProviderName;
  if (!Object.hasOwn(BYOK_PROVIDERS, provider)) {
    throw new JobRefused(400, `"provider" is one of ${Object.keys(BYOK_PROVIDERS).join(", ")}`, { field: "provider" });
  }
  return provider;
}

/** `KeysUnavailable` as the refusal a route sends: 503, the reason, and the sentence that says what to set. */
function keysRefusal(error: KeysUnavailable): JobRefused {
  return new JobRefused(503, error.message, { reason: "byok-keys-unavailable", cause: error.reason });
}

/** The saved keys' statuses, or the access problem in place of them. */
async function keyStatuses(): Promise<{ keys: Awaited<ReturnType<typeof savedKeys>>; access: KeyAccess }> {
  try {
    return { keys: await savedKeys(), access: { ok: true, problem: null } };
  } catch (error) {
    if (!(error instanceof KeysUnavailable)) throw error;
    return { keys: new Map(), access: { ok: false, reason: error.reason, problem: error.message } };
  }
}

/** A provider's saved key, opened, for a spawn or a model list. `JobRefused` when there is none or none can be read. */
async function savedKeyFor(provider: ByokProviderName): Promise<string> {
  let key: string | null;
  try {
    key = await openSavedKey(BYOK_PROVIDERS[provider].tutor);
  } catch (error) {
    if (error instanceof KeysUnavailable) throw keysRefusal(error);
    throw error;
  }
  if (key === null) throw noSavedKey(provider);
  return key;
}

function noSavedKey(provider: ByokProviderName): JobRefused {
  return new JobRefused(400, `no ${provider} key is saved: add it under Settings, Providers, and Studio uses it from there`, {
    field: "provider",
    reason: "byok-no-key",
  });
}

/**
 * The write queue: every save reads the file, changes it and replaces it, so
 * two overlapping writes would lose one of them (and share a temp path).
 * Serialize them all through this — each body runs its own load.
 */
let writing: Promise<unknown> = Promise.resolve();

function queued<T>(work: () => Promise<T>): Promise<T> {
  const next = writing.then(work);
  writing = next.catch(() => undefined);
  return next;
}

function bodyOf(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

/**
 * `PUT /api/settings/byok`'s body: connect a provider whose key is saved in
 * Settings — `{ provider }`, an optional `model` for its Default tier — and
 * make it the one `byok` spawns run on, unless `activate` is false (the web
 * app's call after a key save, which must not move Studio's pick).
 *
 * A body carrying `apiKey` is refused: the runner keeps no key, and a write
 * that sent one (an older web build's mirror) must not land anywhere.
 */
export function saveByok(raw: unknown): Promise<ByokStatus> {
  return queued(async () => {
    const input = bodyOf(raw);
    const provider = checkByokProvider(input.provider);
    if (input.apiKey !== undefined && input.apiKey !== null && input.apiKey !== "") {
      throw new JobRefused(400, "the studio runner keeps no key: save it under Settings, Providers, and Studio reads it from there", {
        field: "apiKey",
        reason: "byok-key-refused",
      });
    }
    const model = typeof input.model === "string" && input.model.trim() !== "" ? input.model.trim() : undefined;
    const { keys, access } = await keyStatuses();
    if (!access.ok) throw new JobRefused(503, access.problem, { reason: "byok-keys-unavailable", cause: access.reason });
    if (keys.get(BYOK_PROVIDERS[provider].tutor)?.readable !== true) throw noSavedKey(provider);
    const settings = (await loadByokSettings()) ?? { active: null, providers: {} };
    const held = settings.providers[provider];
    settings.providers[provider] = { models: { ...(held?.models ?? {}), ...(model !== undefined ? { default: model } : {}) } };
    if (input.activate !== false) settings.active = provider;
    await persistSettings(settings);
    return statusOf(settings, keys, access);
  });
}

/**
 * `PUT /api/settings/byok/models`'s body: a connected provider's tier picks
 * `{ lite?, default?, max? }`, merged over what it has — a tier omitted keeps
 * its model, an empty string clears it.
 */
export function saveByokModels(raw: unknown): Promise<ByokStatus> {
  return queued(async () => {
    const input = bodyOf(raw);
    const provider = checkByokProvider(input.provider);
    const modelsIn = typeof input.models === "object" && input.models !== null && !Array.isArray(input.models) ? (input.models as Record<string, unknown>) : {};
    const settings = await loadByokSettings();
    const held = settings?.providers[provider];
    if (settings === null || held === undefined) throw new JobRefused(400, `provider "${provider}" is not connected`, { field: "provider" });
    for (const tier of ["default", "lite", "max"] as const) {
      const model = modelsIn[tier];
      if (model === undefined) continue;
      if (model === null || (typeof model === "string" && model.trim() === "")) delete held.models[tier];
      else if (typeof model === "string") held.models[tier] = model.trim();
    }
    await persistSettings(settings);
    const { keys, access } = await keyStatuses();
    return statusOf(settings, keys, access);
  });
}

/** `DELETE /api/settings/byok`'s body: Studio stops using a provider — its tiers and the active pick go; its key stays saved in Settings. */
export function removeByokProvider(raw: unknown): Promise<ByokStatus> {
  return queued(async () => {
    const provider = checkByokProvider(bodyOf(raw).provider);
    const settings = await loadByokSettings();
    if (settings === null || settings.providers[provider] === undefined) {
      throw new JobRefused(400, `provider "${provider}" is not connected`, { field: "provider" });
    }
    delete settings.providers[provider];
    if (settings.active === provider) {
      settings.active = (Object.keys(settings.providers)[0] as ByokProviderName | undefined) ?? null;
    }
    await persistSettings(settings);
    const { keys, access } = await keyStatuses();
    return statusOf(settings, keys, access);
  });
}

/** `PUT /api/settings/byok/active`'s body: which connected provider a `byok` spawn runs on. */
export function setByokActive(raw: unknown): Promise<ByokStatus> {
  return queued(async () => {
    const provider = checkByokProvider(bodyOf(raw).provider);
    const settings = await loadByokSettings();
    if (settings === null || settings.providers[provider] === undefined) {
      throw new JobRefused(400, `provider "${provider}" is not connected`, { field: "provider" });
    }
    settings.active = provider;
    await persistSettings(settings);
    const { keys, access } = await keyStatuses();
    return statusOf(settings, keys, access);
  });
}

/**
 * Which provider and model a `byok` turn runs: the active provider and the
 * model its tier says — the conversation's `model` is a tier name
 * (`lite`/`max`, absent or `default` for the Default tier), so the record
 * never holds a provider's id. A tier with no configured model falls back to
 * Default's; none at all means BYOK is not set up.
 */
export function resolveByokPick(settings: ByokSettings | null, tier: string | null): { provider: ByokProviderName; model: string } | null {
  if (settings === null || settings.active === null) return null;
  const entry = settings.providers[settings.active];
  if (entry === undefined) return null;
  const named = tier === "lite" || tier === "max" ? entry.models[tier] : undefined;
  const model = named ?? entry.models.default;
  if (model === undefined || model === "") return null;
  return { provider: settings.active, model };
}

/** What a `byok` spawn needs: the pick, and the provider's saved key opened for it. */
export interface ByokSpawn {
  provider: ByokProviderName;
  apiKey: string;
  model: string;
}

/**
 * The spawn a `byok` turn runs, or the sentence that says why there is none:
 * no pick, no saved key, or keys that cannot be read. The key is opened here,
 * for this spawn, and goes no further than its environment.
 */
export async function resolveByok(tier: string | null): Promise<ByokSpawn | { problem: string }> {
  const pick = resolveByokPick(await loadByokSettings(), tier);
  if (pick === null) return { problem: "BYOK is not set up: the picker's BYOK row takes a provider and a Default model first" };
  try {
    return { ...pick, apiKey: await savedKeyFor(pick.provider) };
  } catch (error) {
    if (error instanceof JobRefused) return { problem: `BYOK cannot run: ${error.message}` };
    throw error;
  }
}

function statusOf(settings: ByokSettings | null, keys: Map<ProviderName, { last4: string; readable: boolean }>, access: KeyAccess): ByokStatus {
  // A provider is listed only while its saved key opens: one removed in
  // Settings, or unreadable after an `AUTH_SECRET` rotation, cannot run.
  const providers =
    settings === null
      ? []
      : (Object.entries(settings.providers) as [ByokProviderName, { models: ByokTierModels }][]).flatMap(([provider, entry]) => {
          const key = keys.get(BYOK_PROVIDERS[provider].tutor);
          return key?.readable === true ? [{ provider, last4: key.last4, models: { ...entry.models } }] : [];
        });
  const active = settings?.active ?? null;
  const running = active !== null ? providers.find((entry) => entry.provider === active) : undefined;
  const model = running?.models.default ?? null;
  return { configured: model !== null, active, model, providers, error: access.problem };
}

/** `GET /api/settings/byok`: whether BYOK can run and on what, for the dialog and for health. */
export async function byokStatus(): Promise<ByokStatus> {
  const [settings, { keys, access }] = await Promise.all([loadByokSettings(), keyStatuses()]);
  return statusOf(settings, keys, access);
}

/**
 * The key `POST /api/settings/byok/models` lists a provider's models on when
 * the dialog's field was left blank: the one saved in Settings.
 */
export function storedKeyForModels(provider: ByokProviderName): Promise<string> {
  return savedKeyFor(provider);
}

/** One model the provider's `/models` returned: the id `qwen --model` takes and a display name when the provider sends one. */
export interface ByokModel {
  value: string;
  label: string | null;
}

/**
 * `POST /api/settings/byok/models`'s call: the provider's own `/models` on
 * the dialog's key — typed, or the stored one when the field was left blank —
 * normalized to `{ value, label }` rows for the combobox. Every preset's
 * endpoint answers the OpenAI list shape (`{ data: [{ id, ... }] }`,
 * anthropic's `display_name` being its label), so one parse serves all four.
 * A refusal is the provider's status, not a runner error.
 */
export async function listByokModels(provider: keyof typeof BYOK_PROVIDERS, apiKey: string): Promise<ByokModel[]> {
  const preset = BYOK_PROVIDERS[provider];
  const headers: Record<string, string> =
    preset.auth === "x-api-key" ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" } : { authorization: `Bearer ${apiKey}` };
  let answer: Response;
  try {
    answer = await fetch(preset.modelsUrl, { headers, signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    throw new JobRefused(502, `${provider}'s model list could not be reached: ${error instanceof Error ? error.message : "no reason given"}`, {
      reason: "provider-unreachable",
    });
  }
  if (!answer.ok) {
    throw new JobRefused(502, `${provider}'s model list refused: HTTP ${answer.status}`, { reason: "provider" });
  }
  const body = (await answer.json().catch(() => null)) as { data?: unknown } | null;
  if (body === null || typeof body !== "object" || !Array.isArray(body.data)) {
    // A "success" the parser cannot read (bad JSON, a different shape, a body
    // that timed out) is a refusal, not an empty list — the dialog says so
    // rather than offering nothing with no reason.
    throw new JobRefused(502, `${provider}'s model list came back unreadable`, { reason: "provider" });
  }
  const data = body.data;
  const seen = new Set<string>();
  const models: ByokModel[] = [];
  for (const row of data) {
    if (typeof row !== "object" || row === null) continue;
    const id = (row as { id?: unknown }).id;
    if (typeof id !== "string" || id === "" || seen.has(id)) continue;
    seen.add(id);
    const named = row as { display_name?: unknown; name?: unknown };
    const label = typeof named.display_name === "string" && named.display_name !== "" ? named.display_name : typeof named.name === "string" && named.name !== "" ? named.name : null;
    models.push({ value: id, label });
  }
  return models.sort((a, b) => a.value.localeCompare(b.value, "en"));
}

/**
 * A `qwen` spawn's environment: the runner's, less every variable this table
 * or the Anthropic seal could leak, plus the configured provider's own set.
 * The caller adds `QWEN_SYSTEM_MD` and `TMPDIR`.
 */
export function byokEnv(base: NodeJS.ProcessEnv, spawn: { provider: ByokProviderName; apiKey: string; model: string }, tmp: string, systemPromptFile: string): NodeJS.ProcessEnv {
  // `login`, always: the Anthropic seal holds under BYOK too, since a stray
  // `ANTHROPIC_API_KEY` in the runner's shell would outbid the configured
  // provider the same way it outbids the login. `TMPDIR` lands in `tmp` on
  // the way through.
  const env = agentEnv(base, "login", tmp);
  // A key already in the runner's shell must not outbid the configured one.
  for (const name of BYOK_ENV_VARS) delete env[name];
  const preset = BYOK_PROVIDERS[spawn.provider];
  env[preset.keyVar] = spawn.apiKey;
  if (preset.baseUrl !== "") env[preset.baseUrlVar] = preset.baseUrl;
  env[preset.modelVar] = spawn.model;
  env.TMPDIR = tmp;
  // The draft's `tmp` stands in for HOME, so `~/.qwen` resolves under it: the
  // owner's user settings and any stored `qwen auth` can never reach a spawn,
  // and the session the first turn writes is where the next turn's `--resume`
  // looks for it. The dir lasts exactly as long as the draft.
  env.HOME = tmp;
  // The prompt file, not its text: nothing the planner was told is an argv
  // element, the same rule `--system-prompt-file` gives the claude spawn.
  env.QWEN_SYSTEM_MD = systemPromptFile;
  return env;
}
