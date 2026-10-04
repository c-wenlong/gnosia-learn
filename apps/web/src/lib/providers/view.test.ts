import { describe, expect, it } from "vitest";

import type { ProviderKeyView } from "@/lib/provider-keys/settings";
import { providersView } from "./view";

function row(id: ProviderKeyView["id"], over: Partial<ProviderKeyView> = {}): ProviderKeyView {
  return { id, label: id.toUpperCase(), model: `${id}-default`, saved: null, server: false, inUse: null, ...over };
}
const SAVED = { last4: "abcd", savedOn: "4 Oct 2026", readable: true };

describe("providersView", () => {
  it("lists providers with models in chain order, then keyed ones, and offers the rest to add", () => {
    const view = providersView(
      {
        reachable: true,
        rows: [row("nvidia", { saved: SAVED, inUse: "saved" }), row("gemini"), row("openrouter", { saved: SAVED, inUse: "saved" })],
      },
      [
        { provider: "openrouter", model: "x" },
        { provider: "openrouter", model: "y" },
      ],
      true,
    );
    expect(view.rows.map((r) => [r.id, r.models])).toEqual([
      ["openrouter", ["x", "y"]],
      ["nvidia", []],
    ]);
    expect(view.addable).toEqual([{ id: "gemini", label: "GEMINI" }]);
    expect(view.usingDefaults).toBe(false);
    expect(view.full).toBe(false);
  });

  it("lists a provider that has models but lost its key, and one with only a server key", () => {
    const view = providersView(
      { reachable: true, rows: [row("nvidia"), row("gemini", { server: true, inUse: "server" }), row("openrouter")] },
      [{ provider: "nvidia", model: "m" }],
      true,
    );
    expect(view.rows.map((r) => r.id)).toEqual(["nvidia", "gemini"]);
    expect(view.addable.map((a) => a.id)).toEqual(["openrouter"]);
  });

  it("orders rows as the defaults are tried while there are no models: saved keys before the server's", () => {
    const view = providersView(
      {
        reachable: true,
        rows: [row("nvidia", { server: true, inUse: "server" }), row("gemini"), row("openrouter", { saved: SAVED, inUse: "saved" })],
      },
      [],
      true,
    );
    expect(view.rows.map((r) => r.id)).toEqual(["openrouter", "nvidia"]);
  });

  it("says when the tutor is on the built-in defaults, and when the chain is full", () => {
    expect(providersView({ reachable: true, rows: [row("nvidia", { saved: SAVED })] }, [], true).usingDefaults).toBe(true);
    const ten = Array.from({ length: 10 }, (_, i) => ({ provider: "nvidia" as const, model: `m${i}` }));
    expect(providersView({ reachable: true, rows: [row("nvidia")] }, ten, true).full).toBe(true);
  });
});
