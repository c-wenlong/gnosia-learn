import { describe, expect, it } from "vitest";

import { activeByokTiers } from "./studio-byok";

describe("activeByokTiers", () => {
  const providers = [
    { provider: "openrouter", last4: "abcd", models: { default: "qwen/qwen3-max", lite: "qwen/qwen3-coder" } },
    { provider: "dashscope", last4: "wxyz", models: { default: "qwen-max" } },
  ];

  it("reads the active provider's Default model and tiers", () => {
    expect(activeByokTiers({ configured: true, active: "openrouter", model: "qwen/qwen3-max", providers })).toEqual({
      model: "qwen/qwen3-max",
      tiers: { default: "qwen/qwen3-max", lite: "qwen/qwen3-coder" },
    });
  });

  it("offers nothing when BYOK cannot run, or the active provider is not listed", () => {
    expect(activeByokTiers({ configured: false, active: "openrouter", model: null, providers })).toBeNull();
    expect(activeByokTiers({ configured: true, active: "groq", model: "x", providers })).toBeNull();
  });
});
