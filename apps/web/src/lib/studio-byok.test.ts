import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("@/lib/studio-client", () => ({ call: mocks.call }));

const { activeByokTiers, BYOK_SETTINGS_CHANGED, listByokModels, removeByokProvider, saveByokModels, setByokActive } = await import("./studio-byok");

afterEach(() => {
  vi.unstubAllGlobals();
  mocks.call.mockReset();
});

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

describe("a BYOK write tells open composers to re-read the tiers (D94)", () => {
  /** A window to listen on, and how many times the event fired on it. */
  function listen() {
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    const heard = vi.fn();
    target.addEventListener(BYOK_SETTINGS_CHANGED, heard);
    return heard;
  }

  it("fires once the write answers ok, and hands the answer back", async () => {
    const heard = listen();
    const view = { ok: true, status: 200, data: { configured: true, active: "openrouter", model: null, providers: [] } };
    mocks.call.mockResolvedValue(view);
    expect(await setByokActive("openrouter")).toBe(view);
    await Promise.resolve();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(mocks.call).toHaveBeenCalledWith("/studio/api/settings/byok/active", { method: "PUT", body: '{"provider":"openrouter"}' });
  });

  it("stays quiet when the write is refused, on every write", async () => {
    const heard = listen();
    mocks.call.mockResolvedValue({ ok: false, status: 400, refusal: { error: "no", detail: null } });
    await setByokActive("openrouter");
    await removeByokProvider("openrouter");
    await saveByokModels("openrouter", { default: "m" });
    await Promise.resolve();
    expect(heard).not.toHaveBeenCalled();
    mocks.call.mockResolvedValue({ ok: true, status: 200, data: {} });
    await removeByokProvider("openrouter");
    await saveByokModels("openrouter", { default: "m" });
    await Promise.resolve();
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it("does not fire on a model list, which writes nothing", async () => {
    const heard = listen();
    mocks.call.mockResolvedValue({ ok: true, status: 200, data: { models: [] } });
    await listByokModels("openrouter", "k");
    await Promise.resolve();
    expect(heard).not.toHaveBeenCalled();
  });
});

describe("listByokModels (D93)", () => {
  it("leaves a blank or missing key out, so the runner opens the stored one", async () => {
    mocks.call.mockResolvedValue({ ok: true, status: 200, data: { models: [] } });
    await listByokModels("openrouter", "");
    await listByokModels("openrouter");
    expect(mocks.call.mock.calls).toEqual([
      ["/studio/api/settings/byok/models", { method: "POST", body: '{"provider":"openrouter"}' }],
      ["/studio/api/settings/byok/models", { method: "POST", body: '{"provider":"openrouter"}' }],
    ]);
  });

  it("puts a typed key in the POST body, never the path", async () => {
    mocks.call.mockResolvedValue({ ok: true, status: 200, data: { models: [] } });
    await listByokModels("openrouter", "sk-typed");
    expect(mocks.call.mock.calls).toEqual([
      ["/studio/api/settings/byok/models", { method: "POST", body: '{"provider":"openrouter","apiKey":"sk-typed"}' }],
    ]);
  });
});
