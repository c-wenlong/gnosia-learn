import {
  looksLikeKey,
  MODEL_ID_PATTERN,
  PROVIDER_IDS,
  PROVIDER_LABELS,
  providerLabel,
  TUTOR_MODEL_LIMITS,
  type ProviderId,
  type ProviderName,
} from "@gnosia/schema/shared";

import { redactSecrets } from "@/lib/agent/redact";
import { resolveSiteUrl } from "@/lib/site-url";

export type { ProviderId, ProviderName };

/** The owner's saved keys that decrypted, by provider, a custom one's included. */
export type SavedKeys = Partial<Record<ProviderName, string>>;

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface ProviderConfig {
  id: ProviderName;
  label: string;
  baseUrl: string;
  model: string;
  apiKeyEnv: string;
  /** Extra request headers (OpenRouter attribution, etc.) */
  extraHeaders?: Record<string, string>;
  /** Where a person makes a key for this provider, for Settings' Add provider. */
  keyUrl?: string;
  /**
   * How the provider lists its models, when it is not `GET <baseUrl>/models`
   * answering OpenAI's `{ data: [{ id }] }`: another URL (absolute), another
   * shape, or, for a provider with no list endpoint, the ids its docs name.
   */
  models?: { url?: string; shape?: "openai" | "dashscope"; known?: readonly string[] };
  /** A provider the owner added (T14): no server key, no built-in default model. */
  custom?: true;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  provider: ProviderName;
  providerLabel: string;
}

export interface ProviderAttemptError {
  provider: ProviderName;
  model: string;
  status?: number;
  message: string;
  /**
   * A chain entry the tutor did not call, because nothing holds a key for its
   * provider (docs/TUTOR-MODELS.md, T4). Recorded so the owner can see it was
   * passed over; it is not a failure and does not end the chain.
   */
  skipped?: true;
  /** The attempt was cut off: its own time ran out, or the turn's did (docs/TUTOR-MODELS.md, T10). */
  timedOut?: true;
}

/** Preferred free production cascade: NVIDIA → Gemini Flash → OpenRouter free. */
export const DEFAULT_PROVIDER_ORDER: readonly ProviderId[] = PROVIDER_IDS;

/**
 * Where a key came from: the owner saved it in Settings (`provider_key`,
 * docs/BYOK.md), or the server's environment set it.
 */
export type KeySource = "saved" | "server";

/** A provider the cascade can call, with the key it calls it with. */
export interface ProviderCredential {
  config: ProviderConfig;
  apiKey: string;
  source: KeySource;
  /**
   * Where `config.model` came from: the owner's model chain in Settings, or
   * the built-in default and its `<PROVIDER>_MODEL` override
   * (docs/TUTOR-MODELS.md). Only the advice in a log line reads it.
   */
  modelFrom?: "chain" | "default";
}

/** A chain entry whose provider has no key, saved or server: passed over, and said so (T4). */
export interface SkippedEntry {
  skipped: true;
  provider: ProviderName;
  model: string;
  reason: string;
  /** The providers that do have a key, saved or server, for the message that says what to do (T4). */
  keyed: ProviderName[];
}

/** One place in the order the tutor tries: a call it can make, or an entry it must pass over. */
export type ChainStep = ProviderCredential | SkippedEntry;

export function isCallable(step: ChainStep): step is ProviderCredential {
  return !("skipped" in step);
}

/** One entry of an owner's model chain, as stored (`tutor_model`). */
export interface ChainEntry {
  provider: ProviderName;
  model: string;
}

type EnvMap = Record<string, string | undefined>;

/**
 * Each provider's OpenAI-compatible endpoint, as shipped.
 *
 * `<PROVIDER>_BASE_URL` overrides one, the same way `<PROVIDER>_MODEL` already
 * overrides the model beside it. The reason is a proxy or a mock: pointing the
 * cascade at a local stub is the only way to exercise a fallback path without
 * spending a real free-tier request, and a self-hoster fronting NVIDIA with a
 * gateway should not have to patch this file. A trailing slash is trimmed
 * because `callOpenAiCompatible` appends `/chat/completions`, and
 * `https://host/v1//chat/completions` is a 404 on some gateways and not others.
 */
const DEFAULT_BASE_URL = {
  nvidia: "https://integrate.api.nvidia.com/v1",
  // OpenAI-compatible endpoint for Gemini Developer API
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  openrouter: "https://openrouter.ai/api/v1",
  openai: "https://api.openai.com/v1",
  // Anthropic's OpenAI SDK compatibility layer, with Bearer auth.
  anthropic: "https://api.anthropic.com/v1",
  deepseek: "https://api.deepseek.com",
  // The international Z.ai platform; bigmodel.cn is the China one.
  glm: "https://api.z.ai/api/paas/v4",
  // Model Studio's international (Singapore) compatible mode.
  qwen: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  moonshot: "https://api.moonshot.ai/v1",
  minimax: "https://api.minimax.io/v1",
  mimo: "https://api.xiaomimimo.com/v1",
  mistral: "https://api.mistral.ai/v1",
  groq: "https://api.groq.com/openai/v1",
  xai: "https://api.x.ai/v1",
} as const satisfies Record<ProviderId, string>;

function baseUrl(env: EnvMap, id: ProviderId, variable: string): string {
  const configured = env[variable]?.trim();
  return (configured || DEFAULT_BASE_URL[id]).replace(/\/+$/, "");
}

/**
 * What OpenRouter is told this traffic came from, for its attribution page.
 *
 * `OPENROUTER_HTTP_REFERER` still wins, and is passed through as written: it is
 * an explicit answer to exactly this question, and a header is all it becomes.
 *
 * Below it, `resolveSiteUrl` answers, in place of the literal
 * `https://gnosia-one.vercel.app` that used to sit here. That was this
 * deployment's own domain, so a fork that set `NEXT_PUBLIC_SITE_URL` and
 * nothing else was crediting its requests to us.
 *
 * It calls the shared resolver rather than reading those variables again.
 * Parsing them a second time here is exactly how the two answers came to
 * disagree on bad input: a non-blank but unparseable `NEXT_PUBLIC_SITE_URL`
 * sends the layout to localhost, and used to send the malformed string on to
 * OpenRouter as a header. One implementation, one answer, including the empty
 * string that once crashed a build.
 */
export function openRouterReferer(env: EnvMap): string {
  const explicit = env.OPENROUTER_HTTP_REFERER?.trim();
  if (explicit) return explicit;
  return resolveSiteUrl(env).toString();
}

/**
 * NVIDIA's default chat model. `meta/llama-3.1-8b-instruct`, the previous
 * default, reached end of life on 2026-08-26 and answers 410 Gone; see the
 * note in docs/DEPLOYMENT.md on how this one was picked and how to swap it.
 * `NVIDIA_MODEL` overrides it.
 */
export const DEFAULT_NVIDIA_MODEL = "google/gemma-4-31b-it";

/**
 * The providers added on 2026-10-05 (docs/TUTOR-MODELS.md, T13): each one's
 * label, default model, where a key is made, and how it lists its models,
 * from each provider's own docs on that day. Every one is called through its
 * OpenAI-compatible chat endpoint with a Bearer key.
 *
 * Their server keys are read from `TUTOR_<ID>_API_KEY`, never the bare
 * `<ID>_API_KEY`: `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are commonly
 * exported for other tools (the studio strips the first from its agents for
 * that reason), and the tutor must not start spending one because the shell
 * that started the app happened to hold it. `TUTOR_<ID>_BASE_URL` and
 * `TUTOR_<ID>_MODEL` override the endpoint and the default as for the first
 * three.
 */
const ADDED_PROVIDERS: readonly {
  id: Exclude<ProviderId, "nvidia" | "gemini" | "openrouter">;
  model: string;
  keyUrl: string;
  models?: ProviderConfig["models"];
  extraHeaders?: Record<string, string>;
}[] = [
  { id: "openai", model: "gpt-6-luna", keyUrl: "https://platform.openai.com/api-keys" },
  {
    id: "anthropic",
    model: "claude-haiku-4-5",
    keyUrl: "https://platform.claude.com/settings/keys",
    // The list is paged, 20 by default; one page of up to 1000 holds every model.
    models: { url: "/models?limit=1000" },
    extraHeaders: { "anthropic-version": "2023-06-01" },
  },
  { id: "deepseek", model: "deepseek-flash", keyUrl: "https://platform.deepseek.com/api_keys" },
  {
    id: "glm",
    model: "glm-4.7-flash",
    keyUrl: "https://z.ai/manage-apikey/apikey-list",
    // Z.ai has no list endpoint; these are the ids its docs and pricing page name.
    models: { known: ["glm-5.3-flash", "glm-4.7-flash", "glm-4.5-flash"] },
  },
  {
    id: "qwen",
    model: "qwen3.8-flash",
    keyUrl: "https://modelstudio.console.alibabacloud.com/ap-southeast-1/model/settings/api-key",
    // The list is Model Studio's native endpoint beside compatible-mode, on
    // the same host as the chat endpoint (`dashScopeListUrl`).
    models: { shape: "dashscope" },
  },
  { id: "moonshot", model: "kimi-k2.6", keyUrl: "https://platform.kimi.ai/console/api-keys" },
  { id: "minimax", model: "MiniMax-M3", keyUrl: "https://platform.minimax.io/user-center/basic-information/interface-key" },
  { id: "mimo", model: "mimo-v2.6-flash", keyUrl: "https://platform.xiaomimimo.com/#/console/api-keys" },
  { id: "mistral", model: "mistral-small-latest", keyUrl: "https://console.mistral.ai/api-keys" },
  { id: "groq", model: "openai/gpt-oss-20b", keyUrl: "https://console.groq.com/keys" },
  { id: "xai", model: "grok-4.3", keyUrl: "https://console.x.ai/team/default/api-keys" },
];

/**
 * A provider the owner added (docs/TUTOR-MODELS.md, T14), as the tutor calls
 * it: its own base URL, its saved key only (`apiKeyEnv` names nothing, so no
 * server key ever stands in), and no default model, so it is called only
 * through the owner's chain and never by the built-in defaults.
 */
export function customProviderConfig(row: { id: ProviderName; label: string; baseUrl: string }): ProviderConfig {
  return { id: row.id, label: row.label, baseUrl: row.baseUrl, model: "", apiKeyEnv: "", custom: true };
}

/** Every provider, in the cascade's order, whether or not a key is set for it. */
export function providerConfigs(
  env: EnvMap = process.env,
): ProviderConfig[] {
  const added = ADDED_PROVIDERS.map((p): ProviderConfig => {
    const prefix = `TUTOR_${p.id.toUpperCase()}`;
    return {
      id: p.id,
      label: PROVIDER_LABELS[p.id],
      baseUrl: baseUrl(env, p.id, `${prefix}_BASE_URL`),
      model: env[`${prefix}_MODEL`]?.trim() || p.model,
      apiKeyEnv: `${prefix}_API_KEY`,
      keyUrl: p.keyUrl,
      ...(p.models === undefined ? {} : { models: p.models }),
      ...(p.extraHeaders === undefined ? {} : { extraHeaders: p.extraHeaders }),
    };
  });
  return [
    {
      id: "nvidia",
      label: PROVIDER_LABELS.nvidia,
      baseUrl: baseUrl(env, "nvidia", "NVIDIA_BASE_URL"),
      model: env.NVIDIA_MODEL?.trim() || DEFAULT_NVIDIA_MODEL,
      apiKeyEnv: "NVIDIA_API_KEY",
      keyUrl: "https://build.nvidia.com/explore/discover",
    },
    {
      id: "gemini",
      label: PROVIDER_LABELS.gemini,
      baseUrl: baseUrl(env, "gemini", "GEMINI_BASE_URL"),
      model: env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
      apiKeyEnv: "GEMINI_API_KEY",
      keyUrl: "https://aistudio.google.com/apikey",
    },
    {
      id: "openrouter",
      label: PROVIDER_LABELS.openrouter,
      baseUrl: baseUrl(env, "openrouter", "OPENROUTER_BASE_URL"),
      // Auto-picks from currently available free models
      model: env.OPENROUTER_MODEL?.trim() || "openrouter/free",
      apiKeyEnv: "OPENROUTER_API_KEY",
      keyUrl: "https://openrouter.ai/keys",
      extraHeaders: {
        "HTTP-Referer": openRouterReferer(env),
        "X-Title": env.OPENROUTER_APP_TITLE?.trim() || "Self-Learn",
      },
    },
    ...added,
  ];
}

/** The providers the server's environment holds a key for, in the cascade's order. */
export function resolveProviders(
  env: EnvMap = process.env,
): ProviderConfig[] {
  return providerConfigs(env).filter((c) => Boolean(env[c.apiKeyEnv]?.trim()));
}

/**
 * The keys the tutor calls with, in the order it tries them (docs/BYOK.md,
 * decision 4): the owner's saved keys first, in the cascade's order, then the
 * server's for the providers the owner saved none for.
 *
 * A provider appears once. The owner's key stands in for the server's rather
 * than going ahead of it, so a saved key that stops working shows up as a
 * failed attempt (and as a failed Test in Settings) instead of being hidden by
 * the server quietly answering for it. `saved` holds only keys that
 * decrypted; one that did not is missing, and the server's key applies.
 */
export function orderCredentials(
  saved: SavedKeys,
  env: EnvMap = process.env,
): ProviderCredential[] {
  const configs = providerConfigs(env);
  const own: ProviderCredential[] = configs.flatMap((config) => {
    const apiKey = saved[config.id];
    return apiKey ? [{ config, apiKey, source: "saved" as const }] : [];
  });
  const server: ProviderCredential[] = configs.flatMap((config) => {
    const apiKey = env[config.apiKeyEnv]?.trim();
    return !saved[config.id] && apiKey ? [{ config, apiKey, source: "server" as const }] : [];
  });
  return [...own, ...server];
}

/**
 * The key the tutor calls one provider with (docs/BYOK.md, decision 9): the
 * owner's saved key if it decrypted, else the server's, else none.
 */
export function keyFor(
  provider: ProviderName,
  saved: SavedKeys,
  env: EnvMap = process.env,
): { apiKey: string; source: KeySource } | null {
  const own = saved[provider];
  if (own) return { apiKey: own, source: "saved" };
  // A custom provider is in no built-in config, so it has no server key (T14).
  const config = providerConfigs(env).find((c) => c.id === provider);
  const server = config === undefined || config.apiKeyEnv === "" ? undefined : env[config.apiKeyEnv]?.trim();
  return server ? { apiKey: server, source: "server" } : null;
}

/**
 * The order the tutor tries for an owner (docs/TUTOR-MODELS.md).
 *
 * With a model chain, the chain alone, top to bottom: each entry calls its
 * provider's endpoint with its own model id and the key `keyFor` finds, and
 * an entry with no key is kept in place as a `SkippedEntry` rather than
 * dropped, so the attempts say why it was passed over (T4). With no chain,
 * nothing: the built-in defaults are gone (T15) — the tutor calls only the
 * models the owner added, and an unconfigured provider is one it skips.
 */
export function tutorSteps(
  chain: readonly ChainEntry[],
  saved: SavedKeys,
  env: EnvMap = process.env,
  custom: readonly ProviderConfig[] = [],
): ChainStep[] {
  if (chain.length === 0) return [];
  const configs = new Map<string, ProviderConfig>([...providerConfigs(env), ...custom].map((c) => [c.id, c]));
  const keyed = [...PROVIDER_IDS, ...custom.map((c) => c.id)].filter((id) => keyFor(id, saved, env) !== null);
  return chain.flatMap((entry): ChainStep[] => {
    const config = configs.get(entry.provider);
    if (config === undefined) return [];
    const key = keyFor(entry.provider, saved, env);
    if (key === null) {
      return [{ skipped: true, provider: entry.provider, model: entry.model, reason: `no key for ${config.label}`, keyed }];
    }
    return [{ config: { ...config, model: entry.model }, ...key, modelFrom: "chain" }];
  });
}

/**
 * The model a provider's key Test sends, and whether the tutor uses that key
 * at all (docs/TUTOR-MODELS.md, T9): the owner's first chain entry for the
 * provider; else the provider's built-in default, which the test still calls
 * but the tutor never will — it serves nothing but the chain now (T15).
 */
export function keyTestModel(
  chain: readonly ChainEntry[],
  provider: ProviderName,
  env: EnvMap = process.env,
): { model: string; modelFrom: "chain" | "default"; used: boolean } {
  const entry = chain.find((e) => e.provider === provider);
  if (entry !== undefined) return { model: entry.model, modelFrom: "chain", used: true };
  // A custom provider has no default (T14): an empty model, which the key
  // Test refuses rather than sending.
  const config = providerConfigs(env).find((c) => c.id === provider);
  return { model: config?.model ?? "", modelFrom: "default", used: false };
}

/** The server's keys alone, for a caller with no owner (the tests, a script). */
export function serverCredentials(env: EnvMap = process.env): ProviderCredential[] {
  return orderCredentials({}, env);
}

/**
 * The cascade in words, for the `providers` field of an error: each provider
 * and where its key came from, never any of the key.
 */
export function availableProviderSummary(
  steps: readonly ChainStep[],
): string {
  if (steps.length === 0) return "none (add a provider and a model in Settings)";
  return steps
    .map((step) => {
      if (!isCallable(step)) return `${step.provider} ${step.model} (no key)`;
      const name = step.modelFrom === "chain" ? `${step.config.id} ${step.config.model}` : step.config.id;
      return `${name} (${step.source === "saved" ? "your key" : "server key"})`;
    })
    .join(" → ");
}

/**
 * The chain entries a turn passed over for want of a key, for a success
 * response (T4): empty, and so left out of the body, when there were none.
 */
export function skippedEntries(attempts: readonly ProviderAttemptError[]): { skipped?: ProviderAttemptError[] } {
  const skipped = attempts.filter((a) => a.skipped === true);
  return skipped.length > 0 ? { skipped } : {};
}

/** "A", "A or B", "A, B or C". */
function either(labels: readonly string[]): string {
  return labels.length <= 1 ? (labels[0] ?? "") : `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}

/**
 * What a tutor surface says when nothing it would try has a key (T4). Two
 * different situations: the chain is empty, meaning the owner has set up no
 * model at all; or the owner's chain names only providers without a key,
 * possibly while others have one, which says which providers need a key and
 * which could take a model instead.
 */
export function missingKeyMessage(steps: readonly ChainStep[]): string {
  const skips = steps.filter((s): s is SkippedEntry => !isCallable(s));
  if (skips.length === 0) return "No model is set up. In Settings, add a key under Providers and pick a model under Model selection.";
  const lacking = [...new Set(skips.map((s) => s.reason.replace(/^no key for /, "")))];
  const keyed = (skips[0]?.keyed ?? []).map((id) => providerLabel(id));
  const addKey = `add a key for ${either(lacking)} under Providers`;
  return keyed.length === 0
    ? `None of your models has a key. In Settings, ${addKey}.`
    : `None of your models has a key. In Settings, ${addKey}, or pick a model from ${either(keyed)} under Model selection.`;
}

/** A provider's error body, with every key the caller holds taken out, then clipped. */
function providerText(text: string, secrets: readonly string[], max = 400): string {
  return redactSecrets(text, secrets).slice(0, max);
}

/** The most of an error body read: a person sees 300 characters of it. */
const ERROR_BODY_MAX_BYTES = 64 * 1024;

/**
 * A response body as text, read chunk by chunk and abandoned past `max`
 * bytes, so a gateway that sends more than it declares (or declares nothing)
 * costs at most `max` bytes of memory. Null when it was too large.
 */
async function readCapped(res: Response, max: number): Promise<string | null> {
  if (res.body === null) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/**
 * `readCapped` for anything `fetch` answered with. An object with no body
 * stream at all (a test double, not a real `Response`) is read through its
 * own `text` or `json`.
 */
async function bodyText(res: Response, max: number): Promise<string | null> {
  if (res.body !== undefined) return readCapped(res, max);
  const loose = res as unknown as { text?: () => Promise<string>; json?: () => Promise<unknown> };
  if (typeof loose.text === "function") return loose.text();
  if (typeof loose.json === "function") return JSON.stringify(await loose.json());
  return "";
}

/**
 * How long one provider call may take, and how long a whole tutor turn may
 * walk the chain (docs/TUTOR-MODELS.md, T10). Without them a provider that
 * accepts the connection and never answers holds the turn until the platform
 * kills the function, and the person gets a bare 504 with no attempts. The
 * defaults leave room for a slow free model; `TUTOR_ATTEMPT_TIMEOUT_MS` and
 * `TUTOR_TURN_DEADLINE_MS` override them, between 1 and 300 seconds.
 */
export const DEFAULT_ATTEMPT_TIMEOUT_MS = 20_000;
export const DEFAULT_TURN_DEADLINE_MS = 60_000;

export interface TurnTimeouts {
  attemptMs: number;
  deadlineMs: number;
}

function millis(value: string | undefined, fallback: number): number {
  const n = Number(value?.trim());
  return Number.isInteger(n) && n >= 1_000 && n <= 300_000 ? n : fallback;
}

export function turnTimeouts(env: EnvMap = process.env): TurnTimeouts {
  return {
    attemptMs: millis(env.TUTOR_ATTEMPT_TIMEOUT_MS, DEFAULT_ATTEMPT_TIMEOUT_MS),
    deadlineMs: millis(env.TUTOR_TURN_DEADLINE_MS, DEFAULT_TURN_DEADLINE_MS),
  };
}

/**
 * How a provider call treats a redirect. A custom provider's base URL was
 * checked when it was saved (https, or http to this machine), and a redirect
 * would carry the call, and on a same-origin hop its key, past that check, to
 * an address nobody checked. So a custom provider's 3xx fails the call
 * (T14). The built-in providers' URLs are this file's own, and keep the
 * default.
 */
export function redirectPolicy(config: Pick<ProviderConfig, "custom">): RequestRedirect {
  return config.custom === true ? "error" : "follow";
}

/** The most of a reply read: a tutor turn is a few KB, and this is far past any. */
const REPLY_MAX_BYTES = 2 * 1024 * 1024;

async function callOpenAiCompatible(
  provider: ProviderConfig,
  apiKey: string,
  messages: ChatMessage[],
  secrets: readonly string[],
  signal?: AbortSignal,
): Promise<ChatCompletionResult> {
  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    signal,
    redirect: redirectPolicy(provider),
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(provider.extraHeaders ?? {}),
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      temperature: 0.7,
      stream: false,
    }),
  });

  if (!res.ok) {
    const text = (await bodyText(res, ERROR_BODY_MAX_BYTES)) ?? "";
    throw {
      provider: provider.id,
      model: provider.model,
      status: res.status,
      // The reason phrase too: a gateway is free to put anything in it.
      message: providerText(text, secrets) || providerText(res.statusText, secrets, 200),
    } satisfies ProviderAttemptError;
  }

  const text = await bodyText(res, REPLY_MAX_BYTES);
  if (text === null) {
    throw { provider: provider.id, model: provider.model, message: "The reply was too large to read." } satisfies ProviderAttemptError;
  }
  let data: { choices?: Array<{ message?: { content?: string | null } }>; model?: string };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    throw { provider: provider.id, model: provider.model, message: "The reply was not JSON." } satisfies ProviderAttemptError;
  }
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw {
      provider: provider.id,
      model: provider.model,
      message: "Empty response from model",
    } satisfies ProviderAttemptError;
  }

  return {
    content,
    // The browser shows this, so it gets the same redaction as an error body.
    model: typeof data.model === "string" && data.model ? providerText(data.model, secrets, 200) : provider.model,
    provider: provider.id,
    providerLabel: provider.label,
  };
}

/** Models already reported as gone, so a busy route logs each once. */
const reportedGone = new Set<string>();

/**
 * A 410 means the model is gone. A 404 is ambiguous: the model may be gone, or
 * the configured base URL (a proxy, a gateway) may not serve the route at all.
 * The cascade falls through to the next provider either way and the user sees
 * a slower tutor with no error, which is how the retired NVIDIA default went
 * unnoticed. Say it once per model, naming the model, and name both causes
 * for a 404 so the log does not send an operator after the wrong one.
 */
/**
 * The host of a base URL and nothing else. A gateway may carry an access token
 * in its path, query or userinfo, and the secret redaction on provider errors
 * covers API keys, not this, so a log line gets the origin only.
 */
function originOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return "the configured base URL";
  }
}

function reportIfModelGone(attempt: ProviderAttemptError, baseUrl: string, modelFrom: "chain" | "default"): void {
  if (attempt.status !== 404 && attempt.status !== 410) return;
  const key = `${attempt.provider}/${attempt.model}`;
  if (reportedGone.has(key)) return;
  reportedGone.add(key);
  // A chain entry is the owner's to change in Settings; a default is the operator's, in the environment.
  // The first three read `<ID>_MODEL`; the providers of T13 read `TUTOR_<ID>_MODEL`.
  const variable = (["nvidia", "gemini", "openrouter"] as string[]).includes(attempt.provider)
    ? `${attempt.provider.toUpperCase()}_MODEL`
    : `TUTOR_${attempt.provider.toUpperCase()}_MODEL`;
  const fix = modelFrom === "chain" ? "replace it under Model selection in Settings" : `set ${variable}`;
  console.error(
    attempt.status === 410
      ? `agent: ${attempt.provider} answered 410 Gone for model ${attempt.model}; it is retired, ${fix}`
      : `agent: ${attempt.provider} answered 404 for model ${attempt.model} at ${originOf(baseUrl)}; the model may be retired (${fix}) or the base URL may not serve /chat/completions`,
  );
}

/** Test hook: forget which gone models were already reported. */
export function resetGoneModelReports(): void {
  reportedGone.clear();
}

/**
 * Try the providers in order. Continues on rate-limits / 5xx / empty replies.
 * `steps` is `tutorSteps`' list (the routes get it from `tutorCredentials`):
 * a chain entry with no key is recorded as a skipped attempt and the walk
 * goes on. Nothing to call at all is `MISSING_API_KEY`, with the skips as its
 * attempts.
 */
export async function completeWithFallback(
  messages: ChatMessage[],
  steps: readonly ChainStep[],
  timeouts: TurnTimeouts = turnTimeouts(),
): Promise<
  | { ok: true; result: ChatCompletionResult; attempts: ProviderAttemptError[] }
  | {
      ok: false;
      attempts: ProviderAttemptError[];
      code: "MISSING_API_KEY" | "ALL_PROVIDERS_FAILED";
    }
> {
  const skipped = (step: SkippedEntry): ProviderAttemptError => ({
    provider: step.provider,
    model: step.model,
    message: step.reason,
    skipped: true,
  });
  const credentials = steps.filter(isCallable);
  const seconds = (ms: number) => `${Math.round(ms / 1000)} seconds`;
  if (credentials.length === 0) {
    return { ok: false, attempts: steps.flatMap((s) => (isCallable(s) ? [] : [skipped(s)])), code: "MISSING_API_KEY" };
  }

  // Every key in play, so one provider's error cannot quote another's.
  const secrets = credentials.map((c) => c.apiKey);
  const attempts: ProviderAttemptError[] = [];

  // The whole walk has one deadline, and each call its own limit inside it.
  const deadline = AbortSignal.timeout(timeouts.deadlineMs);
  for (const [index, step] of steps.entries()) {
    if (!isCallable(step)) {
      attempts.push(skipped(step));
      continue;
    }
    const { config: provider, apiKey } = step;
    const signal = AbortSignal.any([AbortSignal.timeout(timeouts.attemptMs), deadline]);
    try {
      const result = await callOpenAiCompatible(provider, apiKey, messages, secrets, signal);
      return { ok: true, result, attempts };
    } catch (err) {
      if (signal.aborted) {
        // Cut off, whatever the fetch threw on the way out.
        if (deadline.aborted) {
          const untried = steps.slice(index + 1).filter(isCallable).length;
          attempts.push({
            provider: provider.id,
            model: provider.model,
            message: `Cut off: the turn ran out of its ${seconds(timeouts.deadlineMs)}${untried > 0 ? `, so ${untried} more ${untried === 1 ? "model was" : "models were"} not tried` : ""}.`,
            timedOut: true,
          });
          break;
        }
        attempts.push({
          provider: provider.id,
          model: provider.model,
          message: `No answer within ${seconds(timeouts.attemptMs)}, so the tutor moved on.`,
          timedOut: true,
        });
        continue;
      }
      if (
        err &&
        typeof err === "object" &&
        "provider" in err &&
        "message" in err
      ) {
        const attempt = err as ProviderAttemptError;
        attempts.push(attempt);
        reportIfModelGone(attempt, provider.baseUrl, step.modelFrom ?? "default");
      } else {
        attempts.push({
          provider: provider.id,
          model: provider.model,
          message: providerText(err instanceof Error ? err.message : "Unknown error", secrets),
        });
      }
    }
  }

  return { ok: false, attempts, code: "ALL_PROVIDERS_FAILED" };
}

/**
 * The sentence inside a provider's JSON error, when there is one: OpenAI's
 * and OpenRouter's `{ error: { message } }`, Gemini's the same inside an
 * array, NVIDIA's problem document `{ detail }` or `{ title }`. Otherwise the
 * text as it came. Only for Settings' Test, where a person reads it; the
 * tutor's `attempts` keep the body whole.
 */
export function providerMessage(text: string): string {
  try {
    const parsed: unknown = JSON.parse(text);
    const body = (Array.isArray(parsed) ? parsed[0] : parsed) as Record<string, unknown> | null;
    if (body && typeof body === "object") {
      const error = body.error;
      if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
        return (error as { message: string }).message;
      }
      for (const field of ["message", "detail", "title", "error"] as const) {
        if (typeof body[field] === "string" && body[field]) return body[field] as string;
      }
    }
  } catch {
    // Not JSON: the text is the message.
  }
  return text.trim();
}

/** What a Test in Settings says: the key works, or the provider's words, redacted. */
export type KeyTestResult =
  | { ok: true; model: string }
  | { ok: false; status: number | null; message: string };

/** The most of a Test's reply read: one token's worth is well under this. */
const KEY_TEST_REPLY_MAX_BYTES = 256 * 1024;

/** How long a Test waits for the provider before calling it a failure. */
export const KEY_TEST_TIMEOUT_MS = 15_000;

/**
 * One minimal call with one key and one model (`config.model`): the key Test
 * sends the model the tutor would call that key with first, and a chain
 * entry's Test sends the entry's own (docs/TUTOR-MODELS.md). A one-token
 * completion, which every provider authenticates, where a `/models` listing
 * is public on some of them and so proves nothing. Any 2xx is a working key, whatever the model wrote.
 * Never throws; a network failure or a timeout is a failed test.
 */
export async function testProviderKey(
  credential: ProviderCredential,
  timeoutMs: number = KEY_TEST_TIMEOUT_MS,
): Promise<KeyTestResult> {
  const { config, apiKey } = credential;
  const secrets = [apiKey];
  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      redirect: redirectPolicy(config),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(config.extraHeaders ?? {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: "Reply with the word ok." }],
        max_tokens: 1,
        stream: false,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    // Everything the provider sent that reaches the browser goes through
    // `providerText`, the model name and the status text included: a gateway
    // is free to put anything in either.
    // Read through the same cap as a model list: a reply to one token is
    // small, and a gateway that sends more is not read past the cap.
    if (res.ok) {
      let data: { model?: unknown } = {};
      try {
        data = JSON.parse((await bodyText(res, KEY_TEST_REPLY_MAX_BYTES)) ?? "{}") as { model?: unknown };
      } catch {
        // Any 2xx is a working key; an unreadable body only costs the model name.
      }
      const model = typeof data.model === "string" && data.model ? providerText(data.model, secrets, 200) : config.model;
      return { ok: true, model };
    }
    const text = (await bodyText(res, ERROR_BODY_MAX_BYTES).catch(() => "")) ?? "";
    // Redacted before and after the JSON is read, so an escape in the body
    // cannot hide an echo from the first pass.
    const message = providerText(providerMessage(redactSecrets(text, secrets)), secrets, 300);
    return { ok: false, status: res.status, message: message || providerText(res.statusText, secrets, 200) || `HTTP ${res.status}` };
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return {
      ok: false,
      status: null,
      message: timedOut
        ? `The provider did not answer within ${Math.round(timeoutMs / 1000)} seconds.`
        : providerText(err instanceof Error ? err.message : "The provider could not be reached.", secrets, 300),
    };
  }
}

/** A model a provider's `/models` lists, as Settings offers it. */
export interface ListedModel {
  id: string;
  /** OpenRouter prices every model; true when both prices are zero. Absent where the list says nothing about price. */
  free?: boolean;
}

export type ModelListResult =
  | { ok: true; models: ListedModel[] }
  | { ok: false; status: number | null; message: string };

/** How long a model list waits for the provider. */
export const MODEL_LIST_TIMEOUT_MS = 10_000;

/** The most a list may be: OpenRouter's, the longest, is about 2 MB and 350 models. */
export const MODEL_LIST_MAX_BYTES = 8 * 1024 * 1024;
const MODEL_LIST_MAX_MODELS = 2_000;

/**
 * A listed id as the chat endpoint takes it. Gemini's OpenAI-compatible
 * `/models` names each model `models/<id>`, and its chat endpoint is
 * documented with the bare `<id>`.
 */
function listedId(provider: ProviderName, id: string): string {
  return provider === "gemini" && id.startsWith("models/") ? id.slice("models/".length) : id;
}

/**
 * One provider's model list, from `<baseUrl>/models` with the key the tutor
 * would use (docs/TUTOR-MODELS.md, T2). The URL is the provider's configured
 * base URL and nothing a caller sends. Each id is checked as a stored id is
 * (`checkModelId`'s rule) and one that echoes the key is dropped, so what
 * reaches the browser is an id or nothing; an error is redacted as the
 * key Test's is. Never throws.
 */
export async function listProviderModels(
  credential: ProviderCredential,
  timeoutMs: number = MODEL_LIST_TIMEOUT_MS,
): Promise<ModelListResult> {
  const { config } = credential;
  // A provider with no list endpoint: the ids its docs name (T13).
  if (config.models?.known !== undefined && config.models.url === undefined) {
    return { ok: true, models: [...config.models.known].sort((a, b) => a.localeCompare(b)).map((id) => ({ id })) };
  }
  if (config.models?.shape === "dashscope") return listDashScopeModels(credential, timeoutMs);
  const path = config.models?.url ?? "/models";
  return fetchModelList(credential, path.startsWith("/") ? `${config.baseUrl}${path}` : path, timeoutMs);
}

/** The most pages read from a paged list (DashScope's), at its page size. */
const MODEL_LIST_MAX_PAGES = 10;
const DASHSCOPE_PAGE_SIZE = 100;

/**
 * Model Studio's native list (Alibaba Qwen, T13): `{ output: { total,
 * models: [{ model }] } }`, paged by `page_no` and `page_size`. Read page by
 * page until `total` is reached or `MODEL_LIST_MAX_PAGES`, each page through
 * the same capped reader and id checks as an OpenAI-shape list.
 */
async function listDashScopeModels(credential: ProviderCredential, timeoutMs: number): Promise<ModelListResult> {
  const url = dashScopeListUrl(credential.config.baseUrl);
  // A base URL that is not Model Studio's compatible mode (a proxy, a
  // gateway) lists as an OpenAI-compatible endpoint does.
  if (url === null) return fetchModelList(credential, `${credential.config.baseUrl}/models`, timeoutMs);
  const models: ListedModel[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= MODEL_LIST_MAX_PAGES; page += 1) {
    const result = await fetchModelList(credential, `${url}?page_no=${page}&page_size=${DASHSCOPE_PAGE_SIZE}`, timeoutMs, "dashscope");
    // A page that fails fails the list: a part shown as the whole would be
    // cached for five minutes with its later models missing.
    if (!result.ok) return result;
    for (const m of result.models) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        models.push(m);
      }
    }
    if (result.models.length < DASHSCOPE_PAGE_SIZE || (result.total !== undefined && models.length >= result.total)) break;
  }
  models.sort((a, b) => a.id.localeCompare(b.id));
  return { ok: true, models };
}

/**
 * Model Studio's native list on the host the chat endpoint is on:
 * `<origin>/<prefix>/compatible-mode/v1` lists at `<origin>/<prefix>/api/v1/models`,
 * so a China-region or workspace base URL keeps its key on its own host. Null
 * for a base URL without `/compatible-mode/v1`. Never a host the base URL
 * does not name.
 */
export function dashScopeListUrl(baseUrl: string): string | null {
  const marker = "/compatible-mode/v1";
  const at = baseUrl.indexOf(marker);
  if (at === -1 || at + marker.length !== baseUrl.length) return null;
  return `${baseUrl.slice(0, at)}/api/v1/models`;
}

/** One list request, read capped and checked. `total` is a paged list's own count, when it gives one. */
async function fetchModelList(
  credential: ProviderCredential,
  url: string,
  timeoutMs: number,
  shape: "openai" | "dashscope" = "openai",
): Promise<ModelListResult & { total?: number }> {
  const { config, apiKey } = credential;
  const secrets = [apiKey];
  try {
    const res = await fetch(url, {
      redirect: redirectPolicy(config),
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, ...(config.extraHeaders ?? {}) },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = (await bodyText(res, ERROR_BODY_MAX_BYTES).catch(() => "")) ?? "";
      const message = providerText(providerMessage(redactSecrets(text, secrets)), secrets, 300);
      return { ok: false, status: res.status, message: message || providerText(res.statusText, secrets, 200) || `HTTP ${res.status}` };
    }
    const tooLarge = { ok: false, status: res.status, message: "The model list is too large to read." } as const;
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MODEL_LIST_MAX_BYTES) {
      await res.body?.cancel().catch(() => {});
      return tooLarge;
    }
    // Capped as it is read too: a declared length is only a claim.
    const text = await bodyText(res, MODEL_LIST_MAX_BYTES);
    if (text === null) return tooLarge;
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return { ok: false, status: res.status, message: "The provider's model list is not JSON." };
    }
    const output = shape === "dashscope" ? (body as { output?: { models?: unknown; total?: unknown } } | null)?.output : undefined;
    const data = shape === "dashscope" ? output?.models : (body as { data?: unknown } | null)?.data;
    if (!Array.isArray(data)) return { ok: false, status: res.status, message: "The provider's model list has no data array." };
    const total = typeof output?.total === "number" ? output.total : undefined;
    const seen = new Set<string>();
    const models: ListedModel[] = [];
    for (const item of data.slice(0, MODEL_LIST_MAX_MODELS)) {
      const raw = shape === "dashscope" ? (item as { model?: unknown } | null)?.model : (item as { id?: unknown } | null)?.id;
      if (typeof raw !== "string") continue;
      const id = listedId(config.id, raw.trim());
      if (id.length === 0 || id.length > TUTOR_MODEL_LIMITS.maxModelChars || !MODEL_ID_PATTERN.test(id)) continue;
      if (looksLikeKey(id) || redactSecrets(id, secrets) !== id || seen.has(id)) continue;
      seen.add(id);
      const pricing = (item as { pricing?: { prompt?: unknown; completion?: unknown } }).pricing;
      const free =
        pricing && typeof pricing === "object"
          ? String(pricing.prompt) === "0" && String(pricing.completion) === "0"
          : undefined;
      models.push(free === undefined ? { id } : { id, free });
    }
    models.sort((a, b) => a.id.localeCompare(b.id));
    return total === undefined ? { ok: true, models } : { ok: true, models, total };
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return {
      ok: false,
      status: null,
      message: timedOut
        ? `The provider did not answer within ${Math.round(timeoutMs / 1000)} seconds.`
        : providerText(err instanceof Error ? err.message : "The provider could not be reached.", secrets, 300),
    };
  }
}

export function preferredModelLabel(
  env: EnvMap = process.env,
): string {
  const first = resolveProviders(env)[0];
  if (!first) return "free cascade (unconfigured)";
  return `${first.label} · ${first.model}`;
}
