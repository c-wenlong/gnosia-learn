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

/** What the BYOK dialog saves: a provider, its key, and the model to run. */
export interface ByokConfig {
  provider: keyof typeof BYOK_PROVIDERS;
  /** The key verbatim. Never leaves this file except into a spawn's env. */
  apiKey: string;
  /** The model `qwen --model` takes for that provider. */
  model: string;
}

/** What `GET /api/settings/byok` reports: enough to render the dialog, never the key. */
export interface ByokStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
  /** The last four characters of the stored key, for "configured" to be believed. */
  last4: string | null;
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
    const config = checkByok(JSON.parse(raw));
    // A file edited by hand until its key is empty is no config at all.
    return config.apiKey === "" ? null : config;
  } catch {
    return null;
  }
}

/** What a save stores: the provider checked against the table, the key non-empty, the model non-empty. */
function checkByok(raw: unknown): ByokConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new JobRefused(400, `"byok" is an object: { provider, apiKey, model }`, { field: "byok" });
  }
  const input = raw as Record<string, unknown>;
  const provider = checkByokProvider(input.provider);
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  const model = typeof input.model === "string" ? input.model.trim() : "";
  if (model === "") throw new JobRefused(400, `"model" is the name qwen runs for that provider`, { field: "model" });
  return { provider, apiKey, model };
}

/** A provider name checked against the table: own-property only, so `"constructor"` and `"__proto__"` are not providers. */
export function checkByokProvider(raw: unknown): keyof typeof BYOK_PROVIDERS {
  const provider = (typeof raw === "string" ? raw.trim().toLowerCase() : "") as keyof typeof BYOK_PROVIDERS;
  if (!Object.hasOwn(BYOK_PROVIDERS, provider)) {
    throw new JobRefused(400, `"provider" is one of ${Object.keys(BYOK_PROVIDERS).join(", ")}`, { field: "provider" });
  }
  return provider;
}

/**
 * `PUT /api/settings/byok`'s body, checked. The key is written mode 0600 under
 * the studio home, beside the drafts it will power. An empty `apiKey` keeps
 * the stored one when the provider did not change (Connect pressed again with
 * the saved row standing); a new provider's key is its own.
 */
export async function saveByok(raw: unknown): Promise<ByokStatus> {
  const config = checkByok(raw);
  if (config.apiKey === "") {
    const held = await loadByok();
    if (held === null || held.provider !== config.provider) {
      throw new JobRefused(400, `"apiKey" is the provider's key`, { field: "apiKey" });
    }
    config.apiKey = held.apiKey;
  }
  await mkdir(studioHome(), { recursive: true });
  // Temp file and rename, never a write into the live path: a turn or a GET
  // mid-write must see the old key whole or the new one, never a half file.
  const temporary = `${byokPath()}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(config, null, 1)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, byokPath());
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
  return statusOf(config);
}

function statusOf(config: ByokConfig | null): ByokStatus {
  if (config === null) return { configured: false, provider: null, model: null, last4: null };
  return { configured: true, provider: config.provider, model: config.model, last4: config.apiKey.slice(-4) };
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
export function byokEnv(base: NodeJS.ProcessEnv, config: ByokConfig, tmp: string, systemPromptFile: string): NodeJS.ProcessEnv {
  // `login`, always: the Anthropic seal holds under BYOK too, since a stray
  // `ANTHROPIC_API_KEY` in the runner's shell would outbid the configured
  // provider the same way it outbids the login. `TMPDIR` lands in `tmp` on
  // the way through.
  const env = agentEnv(base, "login", tmp);
  // A key already in the runner's shell must not outbid the configured one.
  for (const name of BYOK_ENV_VARS) delete env[name];
  const preset = BYOK_PROVIDERS[config.provider];
  env[preset.keyVar] = config.apiKey;
  if (preset.baseUrl !== "") env[preset.baseUrlVar] = preset.baseUrl;
  env[preset.modelVar] = config.model;
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
