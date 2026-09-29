import { describe, expect, it } from "vitest";

import { acceptableModel, agentDefaults, checkedAgent, effortOptions, modelOptions, storedAgent } from "./studio-agent-settings";

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
    expect(modelOptions("default", defaults)[0]!.label).toBe("Claude Code default (claude-fable-5-1)");
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

  it("offers the priced models, and keeps a stored value outside them", () => {
    expect(modelOptions("default", null).map((option) => option.value)).toEqual(["default", "fable", "opus", "sonnet"]);
    expect(modelOptions("claude-sonnet-5", null).at(-1)).toEqual({ value: "claude-sonnet-5", label: "claude-sonnet-5" });
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
