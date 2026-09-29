import { describe, expect, it } from "vitest";

import {
  acceptableModel,
  agentDefaults,
  checkedAgent,
  effortOptions,
  modelName,
  modelOptions,
  rowPriced,
  rowWarning,
  runnerSettings,
  storedAgent,
} from "./studio-agent-settings";

describe("the settings panel's menus (D53)", () => {
  it("defaults videos to the Claude Code default and diagrams to sonnet, today's behaviour", () => {
    expect(storedAgent("video", undefined)).toEqual({ model: "default", effort: "default" });
    expect(storedAgent("diagram", null)).toEqual({ model: "sonnet", effort: "default" });
    expect(storedAgent("video", { model: "opus", effort: "max" })).toEqual({ model: "opus", effort: "max" });
    expect(storedAgent("video", { model: "--dangerous", effort: "loud" })).toEqual({ model: "default", effort: "default" });
  });

  it("shows what the default resolves to, from health's agent block", () => {
    const fromSettings = {
      video: {
        model: { requested: "default", passed: "claude-fable-5-1", source: "claude-settings" },
        effort: { requested: "default", passed: "high", source: "claude-settings" },
      },
      diagram: { model: { requested: "sonnet", passed: "sonnet", source: "brief" }, effort: { requested: "default", passed: null, source: "cli" } },
    };
    const defaults = agentDefaults(fromSettings);
    expect(defaults).toEqual({ model: "claude-fable-5-1", effort: "high" });
    expect(modelOptions("default", defaults)[0]!.label).toBe("Claude Code default (Fable 5.1)");
    expect(effortOptions(defaults)[0]!.label).toBe("Claude Code default (High)");
  });

  it("prefers the runner's own defaults when it sends them, and says less when it cannot know", () => {
    expect(agentDefaults({ defaults: { model: "claude-opus-5", effort: null } })).toEqual({ model: "claude-opus-5", effort: null });
    expect(effortOptions({ model: null, effort: null })[0]!.label).toBe("Claude Code default (the CLI's own)");
    const hidden = agentDefaults({ video: { model: { requested: "opus", passed: "opus", source: "panel" } } });
    expect(hidden).toBeNull();
    expect(modelOptions("opus", hidden)[0]!.label).toBe("Claude Code default");
    expect(agentDefaults(null)).toBeNull();
  });

  it("offers each priced model once, by a name a person reads, and keeps a stored value outside them", () => {
    expect(modelOptions("default", null).map((option) => `${option.value}: ${option.label}`)).toEqual([
      "default: Claude Code default",
      "fable: Fable 5.1",
      "opus: Opus 5",
      "claude-opus-5-5: Opus 5.5",
      "sonnet: Sonnet 5",
      "claude-sonnet-5-5: Sonnet 5.5",
    ]);
    // A stored full name of a model the menu offers by its alias is that entry, chosen, not a second one.
    const stored = modelOptions("claude-fable-5-1", null);
    expect(stored.filter((option) => option.label === "Fable 5.1")).toEqual([{ value: "claude-fable-5-1", label: "Fable 5.1" }]);
    expect(stored).toHaveLength(6);
    expect(modelOptions("claude-haiku-9[1m]", null).at(-1)).toEqual({ value: "claude-haiku-9[1m]", label: "Haiku 9, 1M context" });
    expect(effortOptions(null).map((option) => option.label)).toEqual(["Claude Code default", "Low", "Medium", "High", "Extra high", "Max"]);
  });

  it("refuses a value the shared reader would not keep as sent", () => {
    expect(checkedAgent({ model: "opus", effort: "high" })).toEqual({ model: "opus", effort: "high" });
    expect(checkedAgent({ model: "opus --x", effort: "high" })).toBeNull();
    expect(checkedAgent({ model: "opus", effort: "loud" })).toBeNull();
    expect(checkedAgent("opus")).toBeNull();
  });
});

describe("what a save may store", () => {
  it("takes default, a menu model or the value already stored, and refuses a typo", () => {
    expect(acceptableModel("opus", null)).toBe(true);
    expect(acceptableModel("default", null)).toBe(true);
    expect(acceptableModel("opsu", null)).toBe(false);
    expect(acceptableModel("claude-opus-5[1m]", "claude-opus-5[1m]")).toBe(true);
    expect(checkedAgent({ model: "opsu", effort: "high" })).toBeNull();
    expect(checkedAgent({ model: "claude-sonnet-5", effort: "low" }, { model: "claude-sonnet-5", effort: "high" })).toEqual({ model: "claude-sonnet-5", effort: "low" });
  });
});

describe("GET /api/settings/agent (#207)", () => {
  it("takes the runner's priced models and defaults, and falls back to nothing on a bad answer", () => {
    const read = runnerSettings({
      models: [{ value: "opus", label: "Opus", id: "claude-opus-5" }, { value: 3 }],
      defaults: { model: "claude-fable-5-1", effort: "high" },
    });
    expect(read).toEqual({ models: [{ value: "opus", label: "Opus", id: "claude-opus-5" }], defaults: { model: "claude-fable-5-1", effort: "high" } });
    expect(modelOptions("default", read.defaults, read.models!).map((option) => option.value)).toEqual(["default", "opus"]);
    expect(runnerSettings(null)).toEqual({ models: null, defaults: null });
  });

  it("lists a model the runner offers under two names once, and says the default without its raw id", () => {
    // What the runner sent in the phase 2 measurement: each family by alias
    // and by full name, the alias and one full name the same model.
    const read = runnerSettings({
      models: [
        { value: "fable", label: "Fable", id: "claude-fable-5-1" },
        { value: "opus", label: "Opus", id: "claude-opus-5" },
        { value: "sonnet", label: "Sonnet", id: "claude-sonnet-5" },
        { value: "claude-fable-5-1", label: "Claude Fable 5.1", id: "claude-fable-5-1" },
        { value: "claude-opus-5-5", label: "Claude Opus 5.5", id: "claude-opus-5-5" },
        { value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", id: "claude-sonnet-5-5" },
      ],
      defaults: { model: "claude-fable-5-1[1m]", effort: "high" },
    });
    const options = modelOptions("default", read.defaults, read.models!);
    const labels = options.map((option) => option.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toEqual(["Claude Code default (Fable 5.1)", "Fable 5.1", "Opus 5", "Opus 5.5", "Sonnet 5", "Sonnet 5.5"]);
    expect(labels.join(" ")).not.toContain("[1m]");
  });

  it("shows a stored model with a context window as that model's one entry, chosen (Greptile on #217)", () => {
    for (const stored of ["claude-fable-5-1[1m]", "fable[1m]"]) {
      const options = modelOptions(stored, null);
      const fable = options.filter((option) => option.label.startsWith("Fable"));
      expect(fable).toEqual([{ value: stored, label: "Fable 5.1, 1M context" }]);
      expect(options).toHaveLength(6);
    }
    // A context window on a model the menu does not offer is still appended, once.
    expect(modelOptions("claude-haiku-9[1m]", null).filter((option) => option.label.startsWith("Haiku"))).toHaveLength(1);
  });
});

describe("a model's name, for a person", () => {
  it("reads an alias, a full id and a context-window suffix, and leaves anything else as it is", () => {
    expect(modelName("claude-fable-5-1[1m]")).toBe("Fable 5.1, 1M context");
    expect(modelName("claude-opus-5")).toBe("Opus 5");
    expect(modelName("claude-sonnet-5-5")).toBe("Sonnet 5.5");
    expect(modelName("sonnet")).toBe("Sonnet");
    expect(modelName("opus[1m]")).toBe("Opus, 1M context");
    expect(modelName("claude-opus-5[200k]")).toBe("Opus 5, 200K context");
    expect(modelName("some-other-model")).toBe("some-other-model");
    expect(modelName("claude-fable-5-1[1m]", { context: false })).toBe("Fable 5.1");
  });
});

describe("the late #207 rules", () => {
  const view = {
    video: { price: { priced: true, pricedAs: "claude-opus-5" }, warning: null },
    diagram: {
      price: { priced: false, pricedAs: "claude-sonnet-5" },
      warning: '"claude-haiku-9" has no price in the studio\'s rate table, so a job stopped before it reports its own cost is estimated at claude-sonnet-5\'s rates.',
    },
  };

  it("reads each row's warning and price, and nothing from a bad answer", () => {
    expect(rowWarning(view, "video")).toBeNull();
    expect(rowWarning(view, "diagram")).toMatch(/^"claude-haiku-9" has no price/);
    expect(rowPriced(view, "diagram")).toBe(false);
    expect(rowPriced(view, "video")).toBe(true);
    expect(rowPriced({ video: { price: "yes" } }, "video")).toBeNull();
    expect(rowWarning(null, "video")).toBeNull();
  });

  it("never lists an unpriced stored model as if it were priced, nor a value that is no model name", () => {
    expect(modelOptions("claude-haiku-9", null, undefined, false).at(-1)).toEqual({ value: "claude-haiku-9", label: "Haiku 9 (no price)" });
    expect(modelOptions("Sonnet", null).some((option) => option.value === "Sonnet")).toBe(false);
    expect(modelOptions("opus --x", null).some((option) => option.value === "opus --x")).toBe(false);
  });

  it("refuses a model the runner's name rule refuses, capitals included, even when it is the stored one", () => {
    expect(acceptableModel("Sonnet", null)).toBe(false);
    expect(acceptableModel("Sonnet", "Sonnet")).toBe(false);
    expect(acceptableModel("claude-opus-5[1m]", "claude-opus-5[1m]")).toBe(true);
    expect(acceptableModel("claude-opus-5[1M]", "claude-opus-5[1M]")).toBe(false);
    expect(checkedAgent({ model: "Sonnet", effort: "high" }, { model: "Sonnet", effort: "high" })).toBeNull();
  });
});
