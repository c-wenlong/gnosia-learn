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

export function resolveProviders(
  env: EnvMap = process.env,
): ProviderConfig[] {
  const configs: ProviderConfig[] = [
    {
      id: "nvidia",
      label: "NVIDIA NIM",
      baseUrl: "https://integrate.api.nvidia.com/v1",
      model:
        env.NVIDIA_MODEL?.trim() || "meta/llama-3.1-8b-instruct",
      apiKeyEnv: "NVIDIA_API_KEY",
    },
    {
      id: "gemini",
      label: "Google Gemini",
      // OpenAI-compatible endpoint for Gemini Developer API
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
      apiKeyEnv: "GEMINI_API_KEY",
    },
    {
      id: "openrouter",
      label: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      // Auto-picks from currently available free models
      model: env.OPENROUTER_MODEL?.trim() || "openrouter/free",
      apiKeyEnv: "OPENROUTER_API_KEY",
      extraHeaders: {
        "HTTP-Referer":
          env.OPENROUTER_HTTP_REFERER?.trim() ||
          "https://self-learn-one.vercel.app",
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
