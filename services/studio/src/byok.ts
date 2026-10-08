import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { agentEnv } from "./agent";
import { studioHome } from "./paths";
import { JobRefused } from "./runner";

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
 * The config is a file under `$STUDIO_HOME`, not a catalog preference: a key
 * belongs on the machine that spends it, mode 0600, and `byokStatus` hands the
 * API the last four characters only, so the key never leaves the box it was
 * typed for.
 */

/** The model tiers a BYOK provider configures (D94): the names a conversation's Lite/Default/Max pick resolves against. */
export interface ByokTierModels {
  default?: string;
  lite?: string;
  max?: string;
}

/** One connected provider: its key (never leaves the file except into a spawn's env) and its tier models. */
export interface ByokProviderEntry {
  apiKey: string;
  models: ByokTierModels;
}

export type ByokProviderName = keyof typeof BYOK_PROVIDERS;

/** What `byok.json` holds: every provider the owner has connected, and which a `byok` spawn uses. */
export interface ByokConfig {
  active: ByokProviderName | null;
  providers: Partial<Record<ByokProviderName, ByokProviderEntry>>;
}

/** What `GET /api/settings/byok` reports: enough to render the dialog and the tier menu, never a key. */
export interface ByokStatus {
  configured: boolean;
  /** The provider a `byok` turn runs on. */
  active: string | null;
  /** The active provider's default-tier model, for the row that says what runs. */
  model: string | null;
  providers: { provider: string; last4: string; models: ByokTierModels }[];
}

interface ByokProvider {
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
    keyVar: "OPENAI_API_KEY",
    baseUrlVar: "OPENAI_BASE_URL",
    baseUrl: "https://api.openai.com/v1",
    modelVar: "OPENAI_MODEL",
    modelsUrl: "https://api.openai.com/v1/models",
    auth: "bearer",
  },
  openrouter: {
    keyVar: "OPENAI_API_KEY",
    baseUrlVar: "OPENAI_BASE_URL",
    baseUrl: "https://openrouter.ai/api/v1",
    modelVar: "OPENAI_MODEL",
    modelsUrl: "https://openrouter.ai/api/v1/models",
    auth: "bearer",
  },
  anthropic: {
    keyVar: "ANTHROPIC_API_KEY",
    baseUrlVar: "ANTHROPIC_BASE_URL",
    baseUrl: "https://api.anthropic.com",
    modelVar: "ANTHROPIC_MODEL",
    modelsUrl: "https://api.anthropic.com/v1/models",
    auth: "x-api-key",
  },
  // NVIDIA NIM is OpenAI-compatible too — the same three variables carry it.
  nvidia: {
    keyVar: "OPENAI_API_KEY",
    baseUrlVar: "OPENAI_BASE_URL",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    modelVar: "OPENAI_MODEL",
    modelsUrl: "https://integrate.api.nvidia.com/v1/models",
    auth: "bearer",
  },
  // Google's OpenAI-compatible endpoint, so the same three variables carry it.
  google: {
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

/** `$STUDIO_HOME/byok.json`: where the configured provider lives. */
export function byokPath(): string {
  return path.join(studioHome(), "byok.json");
}

/** The stored config, or null when none was ever saved. An unreadable or malformed file is "none", not a crash. */
export async function loadByok(): Promise<ByokConfig | null> {
  let raw: string;
  try {
    raw = await readFile(byokPath(), "utf8");
  } catch {
    return null;
  }
  try {
    const config = readByokFile(JSON.parse(raw));
    // Providers a hand edit left keyless are no providers at all.
    if (config !== null && Object.keys(config.providers).length === 0) return null;
    return config;
  } catch {
    return null;
  }
}

/**
 * The file's `ByokConfig`, either shape: v2 `{ active, providers }` read as
 * written, or the v1 `{ provider, apiKey, model }` a first save wrote — read
 * as its one provider, its model the `default` tier, active, and rewritten
 * in v2 on the next save.
 */
function readByokFile(raw: unknown): ByokConfig | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  if (typeof input.provider === "string" && Object.hasOwn(BYOK_PROVIDERS, input.provider.trim().toLowerCase())) {
    const provider = input.provider.trim().toLowerCase() as ByokProviderName;
    const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
    if (apiKey === "") return null;
    const model = typeof input.model === "string" ? input.model.trim() : "";
    return { active: provider, providers: { [provider]: { apiKey, models: model === "" ? {} : { default: model } } } };
  }
  const providersIn = typeof input.providers === "object" && input.providers !== null ? (input.providers as Record<string, unknown>) : {};
  const providers: ByokConfig["providers"] = {};
  for (const [name, entry] of Object.entries(providersIn)) {
    if (!Object.hasOwn(BYOK_PROVIDERS, name) || typeof entry !== "object" || entry === null) continue;
    const apiKey = typeof (entry as { apiKey?: unknown }).apiKey === "string" ? (entry as { apiKey: string }).apiKey.trim() : "";
    if (apiKey === "") continue;
    const modelsIn = typeof (entry as { models?: unknown }).models === "object" && (entry as { models?: unknown }).models !== null ? (entry as { models: Record<string, unknown> }).models : {};
    const models: ByokTierModels = {};
    for (const tier of ["default", "lite", "max"] as const) {
      const model = modelsIn[tier];
      if (typeof model === "string" && model.trim() !== "") models[tier] = model.trim();
    }
    providers[name as ByokProviderName] = { apiKey, models };
  }
  const active = typeof input.active === "string" && Object.hasOwn(providers, input.active) ? (input.active as ByokProviderName) : (Object.keys(providers)[0] as ByokProviderName | undefined) ?? null;
  return { active, providers };
}

/** The whole config, written mode 0600 — temp file and rename, never a half file. */
async function persistByok(config: ByokConfig): Promise<void> {
  await mkdir(studioHome(), { recursive: true });
  const temporary = `${byokPath()}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(config, null, 1)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, byokPath());
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** A provider name checked against the table: own-property only, so `"constructor"` and `"__proto__"` are not providers. */
export function checkByokProvider(raw: unknown): ByokProviderName {
  const provider = (typeof raw === "string" ? raw.trim().toLowerCase() : "") as ByokProviderName;
  if (!Object.hasOwn(BYOK_PROVIDERS, provider)) {
    throw new JobRefused(400, `"provider" is one of ${Object.keys(BYOK_PROVIDERS).join(", ")}`, { field: "provider" });
  }
  return provider;
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

/**
 * `PUT /api/settings/byok`'s body: connect a provider — `{ provider, apiKey }`,
 * an optional `model` for its Default tier — and make it the one `byok`
 * spawns run on. An empty `apiKey` keeps the stored one when the provider is
 * already connected; a new provider's key is its own.
 */
export function saveByok(raw: unknown): Promise<ByokStatus> {
  return queued(async () => {
    const input = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const provider = checkByokProvider(input.provider);
    const model = typeof input.model === "string" && input.model.trim() !== "" ? input.model.trim() : undefined;
    const config = (await loadByok()) ?? { active: null, providers: {} };
    let apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
    const held = config.providers[provider];
    if (apiKey === "") {
      if (held === undefined) throw new JobRefused(400, `"apiKey" is the provider's key`, { field: "apiKey" });
      apiKey = held.apiKey;
    }
    config.providers[provider] = { apiKey, models: { ...(held?.models ?? {}), ...(model !== undefined ? { default: model } : {}) } };
    // Connecting makes the provider the one that runs — unless the write is
    // the shared-key mirror of a tutor save, which must not move Studio's
    // pick (a rotated key is not a switch, and a new provider has no
    // Default model to run yet).
    if (input.activate !== false) config.active = provider;
    await persistByok(config);
    return statusOf(config);
  });
}

/**
 * `PUT /api/settings/byok/models`'s body: a connected provider's tier picks
 * `{ lite?, default?, max? }`, merged over what it has — a tier omitted keeps
 * its model, an empty string clears it.
 */
export function saveByokModels(raw: unknown): Promise<ByokStatus> {
  return queued(async () => {
    const input = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const provider = checkByokProvider(input.provider);
    const modelsIn = typeof input.models === "object" && input.models !== null && !Array.isArray(input.models) ? (input.models as Record<string, unknown>) : {};
    const config = await loadByok();
    const held = config?.providers[provider];
    if (held === undefined) throw new JobRefused(400, `provider "${provider}" is not connected`, { field: "provider" });
    for (const tier of ["default", "lite", "max"] as const) {
      const model = modelsIn[tier];
      if (model === undefined) continue;
      if (model === null || (typeof model === "string" && model.trim() === "")) delete held.models[tier];
      else if (typeof model === "string") held.models[tier] = model.trim();
    }
    await persistByok(config!);
    return statusOf(config);
  });
}

/** `DELETE /api/settings/byok`'s body: unhook a provider — its key, tiers and the active pick go with it. */
export function removeByokProvider(raw: unknown): Promise<ByokStatus> {
  return queued(async () => {
    const input = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const provider = checkByokProvider(input.provider);
    const config = await loadByok();
    if (config === null || config.providers[provider] === undefined) {
      throw new JobRefused(400, `provider "${provider}" is not connected`, { field: "provider" });
    }
    delete config.providers[provider];
    if (config.active === provider) {
      config.active = (Object.keys(config.providers)[0] as ByokProviderName | undefined) ?? null;
    }
    await persistByok(config);
    return statusOf(config);
  });
}

/** `PUT /api/settings/byok/active`'s body: which connected provider a `byok` spawn runs on. */
export function setByokActive(raw: unknown): Promise<ByokStatus> {
  return queued(async () => {
    const input = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const provider = checkByokProvider(input.provider);
    const config = await loadByok();
    if (config === null || config.providers[provider] === undefined) {
      throw new JobRefused(400, `provider "${provider}" is not connected`, { field: "provider" });
    }
    config.active = provider;
    await persistByok(config);
    return statusOf(config);
  });
}

/**
 * What a `byok` spawn runs: the active provider's key and the model its tier
 * says — the conversation's `model` is a tier name (`lite`/`max`, absent or
 * `default` for the Default tier), so the record never holds a provider's
 * id. A tier with no configured model falls back to Default's; none at all
 * means BYOK is not set up.
 */
export function resolveByok(config: ByokConfig | null, tier: string | null): { provider: ByokProviderName; apiKey: string; model: string } | null {
  if (config === null || config.active === null) return null;
  const entry = config.providers[config.active];
  if (entry === undefined) return null;
  const named = tier === "lite" || tier === "max" ? entry.models[tier] : undefined;
  const model = named ?? entry.models.default;
  if (model === undefined || model === "") return null;
  return { provider: config.active, apiKey: entry.apiKey, model };
}

function statusOf(config: ByokConfig | null): ByokStatus {
  const providers =
    config === null
      ? []
      : Object.entries(config.providers).map(([provider, entry]) => ({
          provider,
          last4: entry.apiKey.slice(-4),
          models: { ...entry.models },
        }));
  const active = config?.active ?? null;
  const model = active !== null ? (config?.providers[active]?.models.default ?? null) : null;
  return { configured: model !== null, active, model, providers };
}

/** `GET /api/settings/byok`: whether BYOK can run and on what, for the dialog and for health. */
export async function byokStatus(): Promise<ByokStatus> {
  return statusOf(await loadByok());
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
