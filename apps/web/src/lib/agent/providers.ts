import { MODEL_ID_PATTERN, PROVIDER_IDS, TUTOR_MODEL_LIMITS, type ProviderId } from "@self-learn/schema/shared";

import { redactSecrets } from "@/lib/agent/redact";
import { resolveSiteUrl } from "@/lib/site-url";

export type { ProviderId };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  baseUrl: string;
  model: string;
  apiKeyEnv: string;
  /** Extra request headers (OpenRouter attribution, etc.) */
  extraHeaders?: Record<string, string>;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  provider: ProviderId;
  providerLabel: string;
}

export interface ProviderAttemptError {
  provider: ProviderId;
  model: string;
  status?: number;
  message: string;
  /**
   * A chain entry the tutor did not call, because nothing holds a key for its
   * provider (docs/TUTOR-MODELS.md, T4). Recorded so the owner can see it was
   * passed over; it is not a failure and does not end the chain.
   */
  skipped?: true;
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
  provider: ProviderId;
  model: string;
  reason: string;
}

/** One place in the order the tutor tries: a call it can make, or an entry it must pass over. */
export type ChainStep = ProviderCredential | SkippedEntry;

export function isCallable(step: ChainStep): step is ProviderCredential {
  return !("skipped" in step);
}

/** One entry of an owner's model chain, as stored (`tutor_model`). */
export interface ChainEntry {
  provider: ProviderId;
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
 * `https://self-learn-one.vercel.app` that used to sit here. That was this
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

/** Every provider, in the cascade's order, whether or not a key is set for it. */
export function providerConfigs(
  env: EnvMap = process.env,
): ProviderConfig[] {
  return [
    {
      id: "nvidia",
      label: "NVIDIA NIM",
      baseUrl: baseUrl(env, "nvidia", "NVIDIA_BASE_URL"),
      model: env.NVIDIA_MODEL?.trim() || DEFAULT_NVIDIA_MODEL,
      apiKeyEnv: "NVIDIA_API_KEY",
    },
    {
      id: "gemini",
      label: "Google Gemini",
      baseUrl: baseUrl(env, "gemini", "GEMINI_BASE_URL"),
      model: env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
      apiKeyEnv: "GEMINI_API_KEY",
    },
    {
      id: "openrouter",
      label: "OpenRouter",
      baseUrl: baseUrl(env, "openrouter", "OPENROUTER_BASE_URL"),
      // Auto-picks from currently available free models
      model: env.OPENROUTER_MODEL?.trim() || "openrouter/free",
      apiKeyEnv: "OPENROUTER_API_KEY",
      extraHeaders: {
        "HTTP-Referer": openRouterReferer(env),
        "X-Title": env.OPENROUTER_APP_TITLE?.trim() || "Self-Learn",
      },
    },
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
  saved: Partial<Record<ProviderId, string>>,
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
  provider: ProviderId,
  saved: Partial<Record<ProviderId, string>>,
  env: EnvMap = process.env,
): { apiKey: string; source: KeySource } | null {
  const own = saved[provider];
  if (own) return { apiKey: own, source: "saved" };
  const config = providerConfigs(env).find((c) => c.id === provider);
  const server = config === undefined ? undefined : env[config.apiKeyEnv]?.trim();
  return server ? { apiKey: server, source: "server" } : null;
}

/**
 * The order the tutor tries for an owner (docs/TUTOR-MODELS.md).
 *
 * With a model chain, the chain alone, top to bottom: each entry calls its
 * provider's endpoint with its own model id and the key `keyFor` finds, and
 * an entry with no key is kept in place as a `SkippedEntry` rather than
 * dropped, so the attempts say why it was passed over (T4). With no chain, the
 * built-in defaults in the provider order, `orderCredentials` exactly as
 * before the chain existed (T3). A chain never falls back to the defaults
 * once it runs out: the owner chose it, and a default answering behind it
 * would hide an entry that stopped working, the reason D9 gives for keys.
 */
export function tutorSteps(
  chain: readonly ChainEntry[],
  saved: Partial<Record<ProviderId, string>>,
  env: EnvMap = process.env,
): ChainStep[] {
  if (chain.length === 0) return orderCredentials(saved, env).map((c) => ({ ...c, modelFrom: "default" as const }));
  const configs = new Map(providerConfigs(env).map((c) => [c.id, c]));
  return chain.flatMap((entry): ChainStep[] => {
    const config = configs.get(entry.provider);
    if (config === undefined) return [];
    const key = keyFor(entry.provider, saved, env);
    if (key === null) {
      return [{ skipped: true, provider: entry.provider, model: entry.model, reason: `no key for ${entry.provider}` }];
    }
    return [{ config: { ...config, model: entry.model }, ...key, modelFrom: "chain" }];
  });
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
  if (steps.length === 0) return "none (add a provider key in Settings)";
  return steps
    .map((step) => {
      if (!isCallable(step)) return `${step.provider} ${step.model} (no key)`;
      const name = step.modelFrom === "chain" ? `${step.config.id} ${step.config.model}` : step.config.id;
      return `${name} (${step.source === "saved" ? "your key" : "server key"})`;
    })
    .join(" → ");
}

/** A provider's error body, with every key the caller holds taken out, then clipped. */
function providerText(text: string, secrets: readonly string[], max = 400): string {
  return redactSecrets(text, secrets).slice(0, max);
}

async function callOpenAiCompatible(
  provider: ProviderConfig,
  apiKey: string,
  messages: ChatMessage[],
  secrets: readonly string[],
): Promise<ChatCompletionResult> {
  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
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
    const text = await res.text();
    throw {
      provider: provider.id,
      model: provider.model,
      status: res.status,
      // The reason phrase too: a gateway is free to put anything in it.
      message: providerText(text, secrets) || providerText(res.statusText, secrets, 200),
    } satisfies ProviderAttemptError;
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    model?: string;
  };
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
  const fix = modelFrom === "chain" ? "replace it under Models in Settings" : `set ${attempt.provider.toUpperCase()}_MODEL`;
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
  if (credentials.length === 0) {
    return { ok: false, attempts: steps.flatMap((s) => (isCallable(s) ? [] : [skipped(s)])), code: "MISSING_API_KEY" };
  }

  // Every key in play, so one provider's error cannot quote another's.
  const secrets = credentials.map((c) => c.apiKey);
  const attempts: ProviderAttemptError[] = [];

  for (const step of steps) {
    if (!isCallable(step)) {
      attempts.push(skipped(step));
      continue;
    }
    const { config: provider, apiKey } = step;
    try {
      const result = await callOpenAiCompatible(provider, apiKey, messages, secrets);
      return { ok: true, result, attempts };
    } catch (err) {
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
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { model?: unknown };
      const model = typeof data.model === "string" && data.model ? providerText(data.model, secrets, 200) : config.model;
      return { ok: true, model };
    }
    const text = await res.text().catch(() => "");
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
 * A listed id as the chat endpoint takes it. Gemini's OpenAI-compatible
 * `/models` names each model `models/<id>`, and its chat endpoint is
 * documented with the bare `<id>`.
 */
function listedId(provider: ProviderId, id: string): string {
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
  const { config, apiKey } = credential;
  const secrets = [apiKey];
  try {
    const res = await fetch(`${config.baseUrl}/models`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, ...(config.extraHeaders ?? {}) },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = (await readCapped(res, ERROR_BODY_MAX_BYTES).catch(() => "")) ?? "";
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
    const text = await readCapped(res, MODEL_LIST_MAX_BYTES);
    if (text === null) return tooLarge;
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return { ok: false, status: res.status, message: "The provider's model list is not JSON." };
    }
    const data = (body as { data?: unknown } | null)?.data;
    if (!Array.isArray(data)) return { ok: false, status: res.status, message: "The provider's model list has no data array." };
    const seen = new Set<string>();
    const models: ListedModel[] = [];
    for (const item of data.slice(0, MODEL_LIST_MAX_MODELS)) {
      const raw = (item as { id?: unknown } | null)?.id;
      if (typeof raw !== "string") continue;
      const id = listedId(config.id, raw.trim());
      if (id.length === 0 || id.length > TUTOR_MODEL_LIMITS.maxModelChars || !MODEL_ID_PATTERN.test(id)) continue;
      if (redactSecrets(id, secrets) !== id || seen.has(id)) continue;
      seen.add(id);
      const pricing = (item as { pricing?: { prompt?: unknown; completion?: unknown } }).pricing;
      const free =
        pricing && typeof pricing === "object"
          ? String(pricing.prompt) === "0" && String(pricing.completion) === "0"
          : undefined;
      models.push(free === undefined ? { id } : { id, free });
    }
    models.sort((a, b) => a.id.localeCompare(b.id));
    return { ok: true, models };
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
