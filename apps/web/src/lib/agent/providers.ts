import { resolveSiteUrl } from "@/lib/site-url";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ProviderId = "nvidia" | "gemini" | "openrouter";

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
export const DEFAULT_PROVIDER_ORDER: ProviderId[] = [
  "nvidia",
  "gemini",
  "openrouter",
];

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

export function resolveProviders(
  env: EnvMap = process.env,
): ProviderConfig[] {
  const configs: ProviderConfig[] = [
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

  return configs.filter((c) => Boolean(env[c.apiKeyEnv]?.trim()));
}

export function availableProviderSummary(
  env: EnvMap = process.env,
): string {
  const available = resolveProviders(env).map((p) => p.id);
  if (available.length === 0) {
    return "none (set NVIDIA_API_KEY, GEMINI_API_KEY, and/or OPENROUTER_API_KEY)";
  }
  return available.join(" → ");
}

async function callOpenAiCompatible(
  provider: ProviderConfig,
  apiKey: string,
  messages: ChatMessage[],
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
      message: text.slice(0, 400) || res.statusText,
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

/** Models already reported as gone, so a busy route logs each once. */
const reportedGone = new Set<string>();

/**
 * A 404 or 410 from a provider means the model is gone, not that the provider
 * is having a bad minute. The cascade then falls through to the next provider
 * and the user sees a slower tutor with no error, which is how the retired
 * NVIDIA default went unnoticed. Say it once, with the model's name.
 */
function reportIfModelGone(attempt: ProviderAttemptError): void {
  if (attempt.status !== 404 && attempt.status !== 410) return;
  const key = `${attempt.provider}/${attempt.model}`;
  if (reportedGone.has(key)) return;
  reportedGone.add(key);
  console.error(
    `agent: ${attempt.provider} answered ${attempt.status} for model ${attempt.model}; it is probably retired, set ${attempt.provider.toUpperCase()}_MODEL`,
  );
}

/** Test hook: forget which gone models were already reported. */
export function resetGoneModelReports(): void {
  reportedGone.clear();
}

/**
 * Try free providers in order. Continues on rate-limits / 5xx / empty replies.
 */
export async function completeWithFallback(
  messages: ChatMessage[],
  env: EnvMap = process.env,
): Promise<
  | { ok: true; result: ChatCompletionResult; attempts: ProviderAttemptError[] }
  | {
      ok: false;
      attempts: ProviderAttemptError[];
      code: "MISSING_API_KEY" | "ALL_PROVIDERS_FAILED";
    }
> {
  const providers = resolveProviders(env);
  if (providers.length === 0) {
    return { ok: false, attempts: [], code: "MISSING_API_KEY" };
  }

  const attempts: ProviderAttemptError[] = [];

  for (const provider of providers) {
    const apiKey = env[provider.apiKeyEnv]?.trim();
    if (!apiKey) continue;
    try {
      const result = await callOpenAiCompatible(provider, apiKey, messages);
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
        reportIfModelGone(attempt);
      } else {
        attempts.push({
          provider: provider.id,
          model: provider.model,
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  }

  return { ok: false, attempts, code: "ALL_PROVIDERS_FAILED" };
}

export function preferredModelLabel(
  env: EnvMap = process.env,
): string {
  const first = resolveProviders(env)[0];
  if (!first) return "free cascade (unconfigured)";
  return `${first.label} · ${first.model}`;
}
