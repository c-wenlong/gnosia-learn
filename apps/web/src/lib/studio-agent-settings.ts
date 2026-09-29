import {
  AGENT_EFFORTS,
  isAgentModel,
  PREFERENCE_KEYS,
  studioAgentPreference,
  type StudioAgentPreference,
  type StudioAgentPreferenceKey,
} from "@self-learn/schema/shared";

import type { FilterOption } from "@/components/ui/filter-menu";
import { modelName } from "@/lib/model-name";

/**
 * The studio's settings panel: the model and effort each agent runs with
 * (D53 of docs/STUDIO-VIDEOS.md), as the menus show them.
 *
 * Pure and React-free: the page reads the two preference rows and health's
 * `agent` block on the server, and this turns them into the two rows' menus,
 * each showing what "Claude Code default" resolves to right now. The runner
 * resolves the same rule at job start; this only says it.
 */

export type AgentKind = "video" | "diagram";

export const AGENT_KEYS: Record<AgentKind, StudioAgentPreferenceKey> = {
  video: PREFERENCE_KEYS.studioVideoAgent,
  diagram: PREFERENCE_KEYS.studioDiagramAgent,
};

/** The row names, in the order the panel lists them. */
export const AGENT_ROWS: { kind: AgentKind; name: string }[] = [
  { kind: "video", name: "Videos" },
  { kind: "diagram", name: "Diagrams" },
];

/** One model the menu offers: the name `claude --model` takes, and the model it runs (`id`). */
export interface ModelChoice {
  value: string;
  label: string;
  /** The model the name runs, as the rate table keys it: an alias's full name, or the name itself. */
  id?: string;
}

/**
 * The models the menu offers when the runner does not say: the list
 * `GET /api/settings/agent` sends (#207, `OFFERED_MODELS` in
 * `services/studio/src/api.ts`), every one the rate table prices, by the name
 * `claude --model` takes, with the model each runs. The runner's own list
 * wins when it answers, since it drops a model its rate table cannot price;
 * this copy is also what a save may store.
 */
export const MODEL_CHOICES: ModelChoice[] = [
  { value: "fable", label: "Fable", id: "claude-fable-5-1" },
  { value: "opus", label: "Opus", id: "claude-opus-5" },
  { value: "sonnet", label: "Sonnet", id: "claude-sonnet-5" },
  { value: "claude-fable-5-1", label: "Claude Fable 5.1", id: "claude-fable-5-1" },
  { value: "claude-opus-5-5", label: "Claude Opus 5.5", id: "claude-opus-5-5" },
  { value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", id: "claude-sonnet-5-5" },
];

// Its own React-free module with no imports, so the video job view (a client
// component) can name a model without pulling the schema package in with it.
export { modelName } from "@/lib/model-name";

/**
 * `GET /api/settings/agent` (#207), read defensively: its model list and what
 * "Claude Code default" resolves to. Either is null when the runner did not
 * answer or sent something else, and the page falls back to health's
 * `agent.defaults` and `MODEL_CHOICES`.
 */
export function runnerSettings(raw: unknown): { models: ModelChoice[] | null; defaults: AgentDefaults | null } {
  if (typeof raw !== "object" || raw === null) return { models: null, defaults: null };
  const body = raw as { models?: unknown; defaults?: unknown };
  const models = Array.isArray(body.models)
    ? body.models
        .filter((model): model is ModelChoice => typeof model === "object" && model !== null && typeof (model as { value?: unknown }).value === "string" && typeof (model as { label?: unknown }).label === "string")
        .map((model) => (typeof model.id === "string" && model.id !== "" ? { value: model.value, label: model.label, id: model.id } : { value: model.value, label: model.label }))
    : [];
  return { models: models.length > 0 ? models : null, defaults: agentDefaults({ defaults: body.defaults }) };
}

const EFFORT_LABELS: Record<(typeof AGENT_EFFORTS)[number], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};

/**
 * A row's stored value, or its default when no row is stored. Videos default
 * to the Claude Code default for both; diagrams keep `sonnet`, today's
 * behaviour, so a diagram's cost does not move until the owner picks.
 */
export function storedAgent(kind: AgentKind, raw: unknown): StudioAgentPreference {
  if (raw === undefined || raw === null) return kind === "diagram" ? { model: "sonnet", effort: "default" } : { model: "default", effort: "default" };
  return studioAgentPreference(raw);
}

/** What "Claude Code default" resolves to now, per setting: the owner's own setting, or none. */
export interface AgentDefaults {
  model: string | null;
  effort: string | null;
}

/**
 * The resolved defaults, from health's `agent` block.
 *
 * `agent.defaults` (`{ model, effort }`, the owner's user settings) when the
 * runner sends it. Else each is read off the video row's resolution when it
 * came from the settings file (`source: "claude-settings"`), since `passed`
 * is then the default itself; a panel value hides it, and the menu then
 * says "Claude Code default" without the name.
 */
export function agentDefaults(raw: unknown): AgentDefaults | null {
  if (typeof raw !== "object" || raw === null) return null;
  const agent = raw as Record<string, unknown>;
  const defaults = agent.defaults;
  if (typeof defaults === "object" && defaults !== null) {
    const record = defaults as Record<string, unknown>;
    return {
      model: typeof record.model === "string" && record.model !== "" ? record.model : null,
      effort: typeof record.effort === "string" && record.effort !== "" ? record.effort : null,
    };
  }
  const pick = (setting: unknown): string | null | undefined => {
    if (typeof setting !== "object" || setting === null) return undefined;
    const value = setting as { source?: unknown; passed?: unknown };
    if (value.source === "claude-settings" && typeof value.passed === "string") return value.passed;
    if (value.source === "cli") return null;
    return undefined;
  };
  const rows = ["video", "diagram"].map((kind) => agent[kind]).filter((row) => typeof row === "object" && row !== null) as Record<string, unknown>[];
  let model: string | null | undefined;
  let effort: string | null | undefined;
  for (const row of rows) {
    model = model === undefined ? pick(row.model) : model;
    effort = effort === undefined ? pick(row.effort) : effort;
  }
  if (model === undefined && effort === undefined) return null;
  return { model: model ?? null, effort: effort ?? null };
}

/** "Claude Code default (Fable 5.1)", or without the name when it is not known. */
export function defaultLabel(resolved: string | null | undefined, known: boolean, words: (value: string) => string = (value) => value): string {
  if (!known) return "Claude Code default";
  return resolved === null || resolved === undefined ? "Claude Code default (the CLI's own)" : `Claude Code default (${words(resolved)})`;
}

/**
 * The model menu: the default with what it resolves to, then each priced
 * model once, then a stored value outside those.
 *
 * **Once per model.** The runner offers each family by its alias and by full
 * names (`fable` and `claude-fable-5-1`), and where two names run the same
 * model (`id`) they are one entry: the stored name when it is one of them,
 * so the menu shows it chosen, else the first offered. Each entry is named
 * for the model it runs ("Opus 5", "Opus 5.5"), which also tells the alias
 * and a newer full name apart, and the list is sorted so a family's
 * versions sit together.
 */
export function modelOptions(
  current: string,
  defaults: AgentDefaults | null,
  models: readonly ModelChoice[] = MODEL_CHOICES,
  currentPriced: boolean | null = null,
): FilterOption<string>[] {
  const byModel = new Map<string, FilterOption<string>>();
  for (const choice of models) {
    const id = choice.id ?? choice.value;
    const held = byModel.get(id);
    if (held === undefined) byModel.set(id, { value: choice.value, label: modelName(id) });
    else if (choice.value === current) held.value = current;
  }
  const offered = [...byModel.values()].sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true }));
  const options: FilterOption<string>[] = [
    { value: "default", label: defaultLabel(defaults?.model, defaults !== null, modelName) },
    ...offered,
  ];
  // A stored model outside the menu's list is offered only when it is a model
  // name, and says so when the runner could not price it (#207), so it never
  // sits among the priced ones looking like one of them.
  if (!options.some((option) => option.value === current) && isAgentModel(current)) {
    const name = modelName(current);
    options.push({ value: current, label: currentPriced === false ? `${name} (no price)` : name });
  }
  return options;
}

export function effortLabel(effort: string): string {
  return EFFORT_LABELS[effort as keyof typeof EFFORT_LABELS] ?? effort;
}

/** The effort menu: the default with the level it resolves to, then `low` to `max`. */
export function effortOptions(defaults: AgentDefaults | null): FilterOption<string>[] {
  return [
    { value: "default", label: defaultLabel(defaults?.effort, defaults !== null, effortLabel) },
    ...AGENT_EFFORTS.map((effort) => ({ value: effort, label: EFFORT_LABELS[effort] })),
  ];
}

/**
 * The value a save sends, checked the way the stored value is read: a value
 * `studioAgentPreference` would not keep as sent is refused rather than
 * quietly stored as something else.
 */
export function checkedAgent(value: unknown, stored: StudioAgentPreference | null = null): StudioAgentPreference | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const read = studioAgentPreference(value);
  const sent = value as { model?: unknown; effort?: unknown };
  if (read.model !== sent.model || read.effort !== sent.effort) return null;
  return acceptableModel(read.model, stored?.model ?? null) ? read : null;
}

/**
 * A model the panel may store: `default`, one the menu offers, or the value
 * already stored (a full id set some other way, which the menu shows and a
 * change of the effort beside it sends back). Anything else is a typo that
 * would fail every job of that kind at spawn.
 */
export function acceptableModel(model: string, stored: string | null): boolean {
  if (model === "default") return true;
  // The one name rule the runner and the catalog share (`isAgentModel`: lower
  // case, one bracketed suffix at most), so "Sonnet" is refused here as there.
  if (!isAgentModel(model)) return false;
  return MODEL_CHOICES.some((choice) => choice.value === model) || model === stored;
}

/**
 * A row's warning from `GET /api/settings/agent` (#207): a model the rate
 * table cannot price still runs, and a stopped job is then estimated at
 * another model's rates. Null when there is none, or the runner did not say.
 */
export function rowWarning(raw: unknown, kind: AgentKind): string | null {
  const warning = rowOf(raw, kind)?.warning;
  return typeof warning === "string" && warning.trim() !== "" ? warning.trim() : null;
}

/** Whether the runner can price what the row runs now: `price.priced`, or null when it did not say. */
export function rowPriced(raw: unknown, kind: AgentKind): boolean | null {
  const price = rowOf(raw, kind)?.price;
  if (typeof price !== "object" || price === null) return null;
  const priced = (price as { priced?: unknown }).priced;
  return typeof priced === "boolean" ? priced : null;
}

function rowOf(raw: unknown, kind: AgentKind): Record<string, unknown> | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = (raw as Record<string, unknown>)[kind];
  return typeof row === "object" && row !== null ? (row as Record<string, unknown>) : null;
}
