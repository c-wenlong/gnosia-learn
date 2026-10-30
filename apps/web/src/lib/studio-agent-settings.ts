import {
  AGENT_EFFORTS,
  isAgentModel,
  PREFERENCE_KEYS,
  studioAgentPreference,
  type StudioAgentPreference,
  type StudioAgentPreferenceKey,
} from "@gnosia/schema/shared";

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
 * `GET /api/settings/agent` sends (#207, `offeredModels` in
 * `services/studio/src/agent/agent-settings.ts`), every one the rate table prices, by the name
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
export function runnerSettings(raw: unknown): {
  models: ModelChoice[] | null;
  defaults: AgentDefaults | null;
  resolved: RunnerResolved | null;
  byokModel: string | null;
  /** The active BYOK provider's tier models (D94): what its Lite/Default/Max rows run. */
  byokTiers: { default?: string; lite?: string; max?: string } | null;
} {
  if (typeof raw !== "object" || raw === null) return { models: null, defaults: null, resolved: null, byokModel: null, byokTiers: null };
  const body = raw as { models?: unknown; defaults?: unknown; planner?: unknown; byok?: unknown } & Record<string, unknown>;
  const models = Array.isArray(body.models)
    ? body.models
        .filter((model): model is ModelChoice => typeof model === "object" && model !== null && typeof (model as { value?: unknown }).value === "string" && typeof (model as { label?: unknown }).label === "string")
        .map((model) => (typeof model.id === "string" && model.id !== "" ? { value: model.value, label: model.label, id: model.id } : { value: model.value, label: model.label }))
    : [];
  const defaults = agentDefaults({ defaults: body.defaults });
  const passed = (kind: string): string | null => {
    const row = body[kind];
    const model = typeof row === "object" && row !== null ? (row as { model?: unknown }).model : undefined;
    const value = typeof model === "object" && model !== null ? (model as { passed?: unknown }).passed : undefined;
    return typeof value === "string" && value !== "" ? value : null;
  };
  const resolved: RunnerResolved = {
    turns: typeof body.planner === "string" && body.planner !== "" ? body.planner : null,
    // A `passed` of null means no `--model` flag, so the job runs on what
    // "Claude Code default" resolves to, which `defaults` names when known.
    video: passed("video") ?? defaults?.model ?? null,
    diagram: passed("diagram") ?? defaults?.model ?? null,
  };
  const byok = typeof body.byok === "object" && body.byok !== null ? (body.byok as { configured?: unknown; model?: unknown; active?: unknown; providers?: unknown }) : null;
  const byokModel = byok !== null && byok.configured === true && typeof byok.model === "string" && byok.model !== "" ? byok.model : null;
  // The active provider's tier picks, for a BYOK conversation's Lite/Default/
  // Max rows: read off the providers list, not the flat `model` (which is the
  // default tier only).
  const byokTiers = (() => {
    if (byok === null || typeof byok.active !== "string" || !Array.isArray(byok.providers)) return null;
    const entry = byok.providers.find(
      (row): row is { provider: string; models: Record<string, unknown> } =>
        typeof row === "object" && row !== null && (row as { provider?: unknown }).provider === byok.active && typeof (row as { models?: unknown }).models === "object" && (row as { models?: unknown }).models !== null,
    );
    if (entry === undefined) return null;
    const tiers: { default?: string; lite?: string; max?: string } = {};
    for (const tier of ["default", "lite", "max"] as const) {
      const model = entry.models[tier];
      if (typeof model === "string" && model !== "") tiers[tier] = model;
    }
    return tiers;
  })();
  return {
    models: models.length > 0 ? models : null,
    defaults,
    resolved: resolved.turns === null && resolved.video === null && resolved.diagram === null ? null : resolved,
    // The model `byok.json` names, for a BYOK conversation's meta row — its
    // turns run on it, not on the claude pick this menu otherwise offers.
    byokModel,
    byokTiers,
  };
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

/** The model each part of a conversation defaults to, as health's `agent` block resolved it (D90). */
export interface RunnerResolved {
  /** `agent.planner`: the model turns run on. */
  turns: string | null;
  /** `agent.video.model.passed`, or the Claude default it falls to. */
  video: string | null;
  /** `agent.diagram.model.passed`, likewise. */
  diagram: string | null;
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
  defaultOption?: FilterOption<string>,
): FilterOption<string>[] {
  const byModel = new Map<string, FilterOption<string>>();
  const idOf = new Map<string, string>();
  for (const choice of models) {
    const id = choice.id ?? choice.value;
    idOf.set(choice.value, id);
    idOf.set(id, id);
    const held = byModel.get(id);
    if (held === undefined) byModel.set(id, { value: choice.value, label: modelName(id) });
    else if (choice.value === current) held.value = current;
  }
  // A stored name with a context window (`claude-fable-5-1[1m]`, `fable[1m]`)
  // runs an offered model: it is that model's one entry, chosen and named
  // with its window, never a second entry for the same model.
  const window = /\[[0-9a-z]{1,8}\]$/.exec(current);
  const windowed = window === null ? undefined : idOf.get(current.slice(0, window.index));
  if (window !== null && windowed !== undefined) {
    const entry = byModel.get(windowed)!;
    entry.value = current;
    entry.label = modelName(`${windowed}${window[0]}`);
  }
  const offered = [...byModel.values()].sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true }));
  const options: FilterOption<string>[] = [
    // The resolved default without its context window: the menu is narrow,
    // and "Claude Code default (Fable 5.1, 1M context)" was cut off there.
    defaultOption ?? { value: "default", label: defaultLabel(defaults?.model, defaults !== null, (model) => modelName(model, { context: false })) },
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

/**
 * The conversation picker's "default" row (D90), passed to `modelOptions` as
 * its `defaultOption`. Clearing a conversation's pick sends no model, so
 * turns run on the planner's model and each job on its kind's saved setting:
 * the settings menus' "Claude Code default" names a different thing, and the
 * detail names what each part uses, as far as the runner said.
 */
export function runnerDefaultOption(resolved: RunnerResolved | null): FilterOption<string> {
  const parts = [
    resolved?.turns ? `turns: ${modelName(resolved.turns)}` : null,
    resolved?.video ? `video: ${modelName(resolved.video)}` : null,
    resolved?.diagram ? `diagram: ${modelName(resolved.diagram)}` : null,
  ].filter((part): part is string => part !== null);
  return {
    value: "default",
    label: "Runner default",
    detail: parts.length > 0 ? parts.join(" · ") : "each part keeps its own setting",
  };
}

/**
 * A conversation's model rows as tiers, the way Manus's picker offers Lite /
 * Default / Max rather than a model list (D92): every harness's own three,
 * and the tier's value is the model name the spawn takes, so a pick is a
 * `model` write as it always was. BYOK's tiers carry the active provider's
 * configured models (D94) — one with none is shown but greyed out, never
 * pickable. A pick stored as a name no tier still covers is appended as
 * itself, so the menu can always show what is set.
 */
export function harnessModelOptions(
  harness: string,
  current: string,
  resolved: RunnerResolved | null,
  byokTiers: { default?: string; lite?: string; max?: string } | null = null,
): FilterOption<string>[] {
  if (harness === "byok") {
    return (["default", "lite", "max"] as const).map((tier) => {
      const model = byokTiers?.[tier];
      return {
        value: tier,
        label: tier === "default" ? "Default" : tier === "lite" ? "Lite" : "Max",
        detail: model ?? "not configured",
        disabled: model === undefined,
      };
    });
  }
  const options: FilterOption<string>[] =
    harness === "codex"
      ? [
          { value: "default", label: "Default", detail: "the model your codex login runs" },
          { value: "gpt-6-luna", label: "Lite", detail: "GPT-6 Luna — fast, for everyday asks" },
          { value: "gpt-6-astra", label: "Max", detail: "GPT-6 Astra — frontier, for the hard ones" },
        ]
      : [
          { ...runnerDefaultOption(resolved), label: "Default" },
          { value: "sonnet", label: "Lite", detail: "Sonnet — fast, for everyday asks" },
          { value: "fable", label: "Max", detail: "Fable — the strongest, for hard ones" },
        ];
  if (current !== "default" && !options.some((option) => option.value === current) && isAgentModel(current)) {
    options.push({ value: current, label: modelName(current) });
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
export function checkedAgent(
  value: unknown,
  stored: StudioAgentPreference | null = null,
  offered: readonly ModelChoice[] | null = null,
): StudioAgentPreference | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const read = studioAgentPreference(value);
  const sent = value as { model?: unknown; effort?: unknown };
  if (read.model !== sent.model || read.effort !== sent.effort) return null;
  return acceptableModel(read.model, stored?.model ?? null, offered) ? read : null;
}

/**
 * A model the panel may store: `default`, one the menu offers, or the value
 * already stored (a full id set some other way, which the menu shows and a
 * change of the effort beside it sends back). Anything else is a typo that
 * would fail every job of that kind at spawn.
 *
 * "The menu" is the runner's own list when it answered (`offered`, from
 * `GET /api/settings/agent`), as the panel draws it, so a model the runner
 * adds can be saved the day it is offered; `MODEL_CHOICES` only when it
 * did not.
 */
export function acceptableModel(model: string, stored: string | null, offered: readonly ModelChoice[] | null = null): boolean {
  if (model === "default") return true;
  // The one name rule the runner and the catalog share (`isAgentModel`: lower
  // case, one bracketed suffix at most), so "Sonnet" is refused here as there.
  if (!isAgentModel(model)) return false;
  return (offered ?? MODEL_CHOICES).some((choice) => choice.value === model) || model === stored;
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
