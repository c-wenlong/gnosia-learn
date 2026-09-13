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
 * `OPENROUTER_HTTP_REFERER` still wins. Below it the site URL the app already
 * resolves for social cards answers instead of a literal
 * `https://self-learn-one.vercel.app`, which was this deployment's own domain:
 * a fork that set `NEXT_PUBLIC_SITE_URL` and nothing else would otherwise
 * spend its requests under our name. Same two variables and same scheme
 * defaulting as `resolveSiteUrl` in `apps/web/src/app/layout.tsx`, kept here
 * rather than imported because that module is a route file that pulls in React
 * and the whole metadata object with it.
 *
 * The last resort is localhost, matching that function, and it is only reached
 * when the deployment has said nothing about where it lives at all.
 */
export function openRouterReferer(env: EnvMap): string {
  const explicit = env.OPENROUTER_HTTP_REFERER?.trim();
  if (explicit) return explicit;
  const site =
    env.NEXT_PUBLIC_SITE_URL?.trim() || env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (!site) return "http://localhost:3000";
  return /^https?:\/\//i.test(site) ? site : `https://${site}`;
}

export function resolveProviders(
  env: EnvMap = process.env,
): ProviderConfig[] {
  const configs: ProviderConfig[] = [
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
        attempts.push(err as ProviderAttemptError);
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
