import { PROVIDER_IDS, type ProviderId } from "@self-learn/schema/shared";

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

/** Every provider, in the cascade's order, whether or not a key is set for it. */
export function providerConfigs(
  env: EnvMap = process.env,
): ProviderConfig[] {
  return [
    {
      id: "nvidia",
      label: "NVIDIA NIM",
      baseUrl: baseUrl(env, "nvidia", "NVIDIA_BASE_URL"),
      model:
        env.NVIDIA_MODEL?.trim() || "meta/llama-3.1-8b-instruct",
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

/** The server's keys alone, for a caller with no owner (the tests, a script). */
export function serverCredentials(env: EnvMap = process.env): ProviderCredential[] {
  return orderCredentials({}, env);
}

/**
 * The cascade in words, for the `providers` field of an error: each provider
 * and where its key came from, never any of the key.
 */
export function availableProviderSummary(
  credentials: readonly ProviderCredential[],
): string {
  if (credentials.length === 0) return "none (add a provider key in Settings)";
  return credentials
    .map((c) => `${c.config.id} (${c.source === "saved" ? "your key" : "server key"})`)
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
      message: providerText(text, secrets) || res.statusText,
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
    model: data.model || provider.model,
    provider: provider.id,
    providerLabel: provider.label,
  };
}

/**
 * Try the providers in order. Continues on rate-limits / 5xx / empty replies.
 * `credentials` is `orderCredentials`' list (the routes get it from
 * `tutorCredentials`); an empty list is `MISSING_API_KEY`.
 */
export async function completeWithFallback(
  messages: ChatMessage[],
  credentials: readonly ProviderCredential[],
): Promise<
  | { ok: true; result: ChatCompletionResult; attempts: ProviderAttemptError[] }
  | {
      ok: false;
      attempts: ProviderAttemptError[];
      code: "MISSING_API_KEY" | "ALL_PROVIDERS_FAILED";
    }
> {
  if (credentials.length === 0) {
    return { ok: false, attempts: [], code: "MISSING_API_KEY" };
  }

  // Every key in play, so one provider's error cannot quote another's.
  const secrets = credentials.map((c) => c.apiKey);
  const attempts: ProviderAttemptError[] = [];

  for (const { config: provider, apiKey } of credentials) {
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
        attempts.push(err as ProviderAttemptError);
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
 * One minimal call with one key: a one-token completion, which every provider
 * authenticates, where a `/models` listing is public on some of them and so
 * proves nothing. Any 2xx is a working key, whatever the model wrote.
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

export function preferredModelLabel(
  env: EnvMap = process.env,
): string {
  const first = resolveProviders(env)[0];
  if (!first) return "free cascade (unconfigured)";
  return `${first.label} · ${first.model}`;
}
