import type { ProviderName } from "@self-learn/schema/shared";

/**
 * The BYOK provider presets the studio runner can spawn on (the runner's own
 * `BYOK_PROVIDERS` table), keyed by the id the tutor's provider table uses —
 * the same account under each table's name, since "the same keys" is the
 * premise (D95). A tutor id not listed (deepseek, a custom provider) is not
 * a BYOK provider.
 */
export const TUTOR_TO_BYOK: Partial<Record<ProviderName, string>> = {
  openai: "openai",
  anthropic: "anthropic",
  gemini: "google",
  openrouter: "openrouter",
  nvidia: "nvidia",
};

/** The tutors' provider id a BYOK preset answers to, or undefined for a name the tutor does not know. */
export function byokToTutor(byokProvider: string): ProviderName | undefined {
  return (Object.keys(TUTOR_TO_BYOK) as ProviderName[]).find((id) => TUTOR_TO_BYOK[id] === byokProvider);
}

/** The presets' labels for the provider dropdowns, with a model hint each field shows. */
export const BYOK_PROVIDERS = [
  { value: "openai", label: "OpenAI", modelHint: "e.g. gpt-5.4" },
  { value: "anthropic", label: "Anthropic", modelHint: "e.g. claude-sonnet-4-5" },
  { value: "google", label: "Google", modelHint: "e.g. gemini-3-pro" },
  { value: "openrouter", label: "OpenRouter", modelHint: "e.g. anthropic/claude-sonnet-4.5" },
  { value: "nvidia", label: "NVIDIA NIM", modelHint: "e.g. qwen/qwen3-coder-480b-a35b-instruct" },
] as const;
