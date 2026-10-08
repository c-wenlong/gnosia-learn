import { DEFAULT_MODEL } from "./config";
import { ratesFor } from "./cost";
import {
  DEFAULT_PREFERENCE,
  readClaudeDefaults,
  readStoredPreference,
  resolveAgentSettings,
  resolveSetting,
  type AgentPreference,
} from "./video/agent-model";
import type { AgentSetting } from "./video/types";

/**
 * The model and effort a job started now would run with, per kind (D53 of
 * docs/STUDIO-VIDEOS.md): the one place the runners, `/api/health` and the
 * settings route ask, so the three cannot disagree about what "default" means.
 *
 * The two kinds differ in one rule each.
 *
 * - **Videos** default to the owner's own Claude Code default, so no row and
 *   a row of defaults are the same thing: each field goes through
 *   `resolveSetting`.
 * - **Diagrams** keep `sonnet` until the owner saves the Diagrams row, so no
 *   row is its own case (`source: "default"`), and only a row that exists
 *   goes through `resolveSetting`. Effort has no such history (the diagram
 *   agent passed none), so with no row it is the owner's Claude Code default,
 *   as the panel's table says. And a model the brief itself names beats the
 *   panel (`source: "brief"`): only `POST /api/jobs` or a person's brief edit
 *   can set one, and either is a person asking for that job in particular.
 */

export interface ClaudeDefaults {
  model: string | null;
  effort: string | null;
}

export interface ResolvedAgent {
  /** The stored preference row, or null when the owner has none (or none was ever read). */
  stored: AgentPreference | null;
  /** The owner's Claude Code defaults, from their user settings file: what "default" resolves to. */
  claude: ClaudeDefaults;
  model: AgentSetting;
  effort: AgentSetting;
}

/** The diagram rule, with nothing read: see the file comment. */
export function diagramAgentSettings(
  briefModel: string | null,
  stored: AgentPreference | null,
  claude: ClaudeDefaults,
): { model: AgentSetting; effort: AgentSetting } {
  const effort = resolveSetting(stored?.effort ?? "default", claude.effort);
  if (briefModel !== null && briefModel !== "") {
    return { model: { requested: briefModel, passed: briefModel, source: "brief" }, effort };
  }
  if (stored === null) {
    return { model: { requested: DEFAULT_MODEL, passed: DEFAULT_MODEL, source: "default" }, effort };
  }
  return { model: resolveSetting(stored.model, claude.model), effort };
}

/** The diagram agent's model and effort, read now. `briefModel` is the brief's own `model`, when it names one. */
export async function resolveDiagramAgent(briefModel?: string | null): Promise<ResolvedAgent> {
  const [stored, claude] = await Promise.all([readStoredPreference("studioDiagramAgent"), readClaudeDefaults()]);
  return { stored, claude, ...diagramAgentSettings(briefModel ?? null, stored, claude) };
}

/** The video agent's model and effort, read now. The video runner resolves the same way, inline. */
export async function resolveVideoAgent(): Promise<ResolvedAgent> {
  const [stored, claude] = await Promise.all([readStoredPreference("studioVideoAgent"), readClaudeDefaults()]);
  return { stored, claude, ...(await resolveAgentSettings(stored ?? DEFAULT_PREFERENCE, claude)) };
}

/**
 * The models a menu offers: every model the rate table prices, by the name
 * `claude --model` takes. The settings panel and a conversation's picker read
 * the same list, so the two cannot disagree about what can be picked (D90 of
 * docs/STUDIO-CHAT-FIRST.md).
 */
const OFFERED_MODELS = [
  { value: "fable", label: "Fable", id: "claude-fable-5-1" },
  { value: "opus", label: "Opus", id: "claude-opus-5" },
  { value: "sonnet", label: "Sonnet", id: "claude-sonnet-5" },
  { value: "claude-fable-5-1", label: "Claude Fable 5.1", id: "claude-fable-5-1" },
  { value: "claude-opus-5-5", label: "Claude Opus 5.5", id: "claude-opus-5-5" },
  { value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", id: "claude-sonnet-5-5" },
] as const;

/** What `GET /api/settings/agent` and `/api/health`'s agent block report as `models`. */
export function offeredModels(): readonly { value: string; label: string; id: string }[] {
  return OFFERED_MODELS.filter((model) => ratesFor(model.id) !== null);
}
