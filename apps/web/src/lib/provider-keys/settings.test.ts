import { describe, expect, it } from "vitest";

import type { SavedKeyStatus } from "@/lib/provider-keys/store";
import { providerKeyViews } from "./settings";

/**
 * The card's order (docs/BYOK.md, decision 4): the owner's usable keys first,
 * in the cascade's order, then the server's for the providers the owner saved
 * none for, each provider once.
 */
const ENV = { NVIDIA_API_KEY: "server-nvidia-key", OPENROUTER_API_KEY: "server-openrouter-key" };

function saved(provider: SavedKeyStatus["provider"], readable = true): SavedKeyStatus {
  return { provider, last4: "abcd", updatedAt: "2026-10-04T00:00:00.000Z", readable };
}

const order = (statuses: SavedKeyStatus[], env: Record<string, string> = ENV) =>
  providerKeyViews(statuses, env, true).order.map((o) => [o.id, o.source]);

describe("providerKeyViews order", () => {
  it("is the server's keys alone when the owner saved none", () => {
    expect(order([])).toEqual([
      ["nvidia", "server"],
      ["openrouter", "server"],
    ]);
  });

  it("puts the owner's keys first, in the cascade's order, then the server's", () => {
    expect(order([saved("openrouter"), saved("gemini")])).toEqual([
      ["gemini", "saved"],
      ["openrouter", "saved"],
      ["nvidia", "server"],
    ]);
  });

  it("lists a provider once when the owner's key stands in for the server's", () => {
    expect(order([saved("nvidia")])).toEqual([
      ["nvidia", "saved"],
      ["openrouter", "server"],
    ]);
  });

  it("falls back to the server's key for a saved key that no longer decrypts", () => {
    expect(order([saved("nvidia", false)])).toEqual([
      ["nvidia", "server"],
      ["openrouter", "server"],
    ]);
  });

  it("is empty with no keys anywhere, and the owner's alone on a machine with no server keys", () => {
    expect(order([], {})).toEqual([]);
    expect(order([saved("gemini")], {})).toEqual([["gemini", "saved"]]);
  });
});
