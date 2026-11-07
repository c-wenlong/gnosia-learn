import { afterEach, describe, expect, it, vi } from "vitest";

import { providerConfigs } from "@gnosia/tutor/providers";
import type { CustomProvider } from "@/lib/custom-providers/store";
import type { SavedKeyStatus } from "@/lib/provider-keys/store";

const store = vi.hoisted(() => ({ savedKeyStatuses: vi.fn(), readOwnerCustomProviders: vi.fn() }));
vi.mock("@/lib/provider-keys/store", () => ({
  savedKeyStatuses: store.savedKeyStatuses,
  failureCode: () => "SQLITE_CANTOPEN",
}));
vi.mock("@/lib/custom-providers/store", () => ({ readOwnerCustomProviders: store.readOwnerCustomProviders }));

const { loadProviderKeys, providerKeyViews } = await import("./settings");

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

/** Every built-in row as the card draws one with no key anywhere; a test overrides the rows it changes. */
function bareRows(env: Record<string, string> = ENV) {
  return providerConfigs(env).map((c) => ({
    id: c.id,
    label: c.label,
    model: c.model,
    keyUrl: c.keyUrl,
    saved: null,
    server: false,
    inUse: null,
  }));
}

describe("providerKeyViews rows", () => {
  it("draws a saved key that no longer decrypts beside the server's, and which one the tutor uses", () => {
    const rows = bareRows().map((r) =>
      r.id === "nvidia"
        ? { ...r, saved: { last4: "abcd", savedOn: "4 Oct 2026", readable: false }, server: true, inUse: "server" }
        : r.id === "openrouter"
          ? { ...r, server: true, inUse: "server" }
          : r,
    );
    expect(providerKeyViews([saved("nvidia", false)], ENV, true)).toEqual({
      reachable: true,
      rows,
      order: [
        { id: "nvidia", label: `NVIDIA NIM (${rows[0].model})`, source: "server" },
        { id: "openrouter", label: `OpenRouter (${rows.find((r) => r.id === "openrouter")!.model})`, source: "server" },
      ],
    });
    expect(rows[0]).toMatchObject({ id: "nvidia", label: "NVIDIA NIM", keyUrl: "https://build.nvidia.com/explore/discover" });
  });

  it("uses the owner's readable key over the server's, and formats its day in UTC", () => {
    const status = { provider: "nvidia" as const, last4: "wxyz", updatedAt: "2026-10-04T23:30:00.000-05:00", readable: true };
    const nvidia = providerKeyViews([status], ENV, true).rows.find((r) => r.id === "nvidia");
    expect(nvidia).toMatchObject({ saved: { last4: "wxyz", savedOn: "5 Oct 2026", readable: true }, server: true, inUse: "saved" });
  });

  it("holds no server key for an env value of only whitespace", () => {
    const nvidia = providerKeyViews([], { NVIDIA_API_KEY: "   " }, true).rows.find((r) => r.id === "nvidia");
    expect(nvidia).toMatchObject({ server: false, inUse: null });
    expect(providerKeyViews([], { NVIDIA_API_KEY: "   " }, true).order).toEqual([]);
  });

  it("lists an owner's own provider with its base URL, and leaves it out of the order", () => {
    const custom: CustomProvider = { id: "custom-lab", label: "Lab box", baseUrl: "http://10.0.0.2:8000/v1" };
    const view = providerKeyViews([{ ...saved("nvidia"), provider: "custom-lab" }], ENV, true, [custom]);
    expect(view.rows.at(-1)).toEqual({
      id: "custom-lab",
      label: "Lab box",
      model: "",
      custom: { baseUrl: "http://10.0.0.2:8000/v1" },
      saved: { last4: "abcd", savedOn: "4 Oct 2026", readable: true },
      server: false,
      inUse: "saved",
    });
    expect(view.rows).toHaveLength(providerConfigs(ENV).length + 1);
    expect(view.order.map((o) => o.id)).toEqual(["nvidia", "openrouter"]);
  });
});

describe("loadProviderKeys", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    store.savedKeyStatuses.mockReset();
    store.readOwnerCustomProviders.mockReset();
  });

  /** The server's environment as ENV says, every other provider key blanked. */
  function serverEnv() {
    for (const c of providerConfigs({})) vi.stubEnv(c.apiKeyEnv, "");
    for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  }

  it("shows the server's keys alone, marked unreachable, when the saved keys cannot be read", async () => {
    serverEnv();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    store.savedKeyStatuses.mockRejectedValue(new Error("SQLITE_CANTOPEN: secret-bearing message"));
    store.readOwnerCustomProviders.mockResolvedValue([{ id: "custom-lab", label: "Lab box", baseUrl: "http://x/v1" }]);
    const view = await loadProviderKeys("kai");
    expect(store.savedKeyStatuses).toHaveBeenCalledWith("kai");
    expect(view.reachable).toBe(false);
    expect(view.rows.map((r) => r.id)).toEqual(providerConfigs(ENV).map((c) => c.id));
    expect(view.rows.every((r) => r.saved === null)).toBe(true);
    expect(view.order.map((o) => [o.id, o.source])).toEqual([
      ["nvidia", "server"],
      ["openrouter", "server"],
    ]);
    expect(warn).toHaveBeenCalledWith("settings: saved provider keys unavailable (SQLITE_CANTOPEN)");
  });

  it("is reachable with the owner's keys and providers when both reads answer", async () => {
    serverEnv();
    store.savedKeyStatuses.mockResolvedValue([saved("gemini")]);
    store.readOwnerCustomProviders.mockResolvedValue([{ id: "custom-lab", label: "Lab box", baseUrl: "http://x/v1" }]);
    const view = await loadProviderKeys("kai");
    expect(view.reachable).toBe(true);
    expect(view.rows.at(-1)).toMatchObject({ id: "custom-lab", custom: { baseUrl: "http://x/v1" } });
    expect(view.order.map((o) => [o.id, o.source])).toEqual([
      ["gemini", "saved"],
      ["nvidia", "server"],
      ["openrouter", "server"],
    ]);
  });
});
