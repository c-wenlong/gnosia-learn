import { describe, expect, it } from "vitest";

import type { ProviderKeyView } from "@/lib/provider-keys/settings";
import { providersView } from "./view";

function row(id: ProviderKeyView["id"], over: Partial<ProviderKeyView> = {}): ProviderKeyView {
  return { id, label: id.toUpperCase(), model: `${id}-default`, saved: null, server: false, inUse: null, ...over };
}
const SAVED = { last4: "abcd", savedOn: "4 Oct 2026", readable: true };

describe("providersView", () => {
  it("lists every provider in the keys view's order, keyed or not, with its chain models attached", () => {
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
      ["nvidia", []],
      ["gemini", []],
      ["openrouter", ["x", "y"]],
    ]);
    expect(view.usingDefaults).toBe(false);
  });

  it("keeps a provider listed when its key is gone and its models stay", () => {
    const view = providersView(
      { reachable: true, rows: [row("nvidia"), row("gemini", { server: true, inUse: "server" })] },
      [{ provider: "nvidia", model: "m" }],
      true,
    );
    expect(view.rows.map((r) => [r.id, r.models, r.inUse])).toEqual([
      ["nvidia", ["m"], null],
      ["gemini", [], "server"],
    ]);
  });

  it("says when the tutor has nothing to call", () => {
    expect(providersView({ reachable: true, rows: [row("nvidia", { saved: SAVED })] }, [], true).usingDefaults).toBe(true);
  });
});
