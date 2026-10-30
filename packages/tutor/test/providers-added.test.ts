import { afterEach, describe, expect, it, vi } from "vitest";

import {
  completeWithFallback,
  customProviderConfig,
  dashScopeListUrl,
  listProviderModels,
  orderCredentials,
  providerConfigs,
  type ProviderCredential,
  redirectPolicy,
  testProviderKey,
} from "../src/providers";

/**
 * The providers added on 2026-10-05 (docs/TUTOR-MODELS.md, T13): their
 * server keys are opt-in under `TUTOR_<ID>_API_KEY`, and the three whose
 * model lists differ from OpenAI's are read the way each one's docs say.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function credential(id: string, env: Record<string, string> = {}): ProviderCredential {
  const config = providerConfigs(env).find((c) => c.id === id);
  if (config === undefined) throw new Error(`no provider ${id}`);
  return { config, apiKey: "test-key-0123456789abcdef", source: "saved" };
}

describe("the added providers", () => {
  it("are all OpenAI-compatible configs after the first three, each with a default model and where to get a key", () => {
    const configs = providerConfigs({});
    expect(configs.slice(0, 3).map((c) => c.id)).toEqual(["nvidia", "gemini", "openrouter"]);
    for (const c of configs) {
      expect(c.baseUrl).toMatch(/^https:\/\/[^ ]+[^/]$/);
      expect(c.model.length).toBeGreaterThan(0);
      expect(c.keyUrl).toMatch(/^https:\/\//);
    }
    expect(configs.find((c) => c.id === "anthropic")?.extraHeaders).toEqual({ "anthropic-version": "2023-06-01" });
  });

  it("never take a server key from the bare <ID>_API_KEY a shell may export for other tools", () => {
    const shell = { ANTHROPIC_API_KEY: "sk-ant-api-from-the-shell-000000", OPENAI_API_KEY: "sk-from-the-shell-0000000000" };
    expect(orderCredentials({}, shell).map((c) => c.config.id)).toEqual([]);
    const opted = orderCredentials({}, { TUTOR_ANTHROPIC_API_KEY: "sk-ant-api-opted-in-0000000000", TUTOR_ANTHROPIC_MODEL: "claude-x" });
    expect(opted.map((c) => [c.config.id, c.config.model, c.source])).toEqual([["anthropic", "claude-x", "server"]]);
  });

  it("asks Anthropic for one page of up to 1000 models, with its version header", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "claude-haiku-4-5", type: "model" }], has_more: false }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await listProviderModels(credential("anthropic"));
    expect(result).toEqual({ ok: true, models: [{ id: "claude-haiku-4-5" }] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/models?limit=1000");
    expect((init.headers as Record<string, string>)["anthropic-version"]).toBe("2023-06-01");
  });

  it("offers GLM's documented ids without a request, since Z.ai has no list endpoint", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await listProviderModels(credential("glm"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.ok && result.models.map((m) => m.id)).toEqual(["glm-4.5-flash", "glm-4.7-flash", "glm-5.3-flash"]);
  });

  it("reads Qwen's native list page by page, by `output.models[].model`, until its total", async () => {
    const page = (ids: string[], total: number) =>
      new Response(JSON.stringify({ request_id: "r", output: { total, page_no: 1, page_size: 100, models: ids.map((model) => ({ model, name: model })) } }), {
        status: 200,
      });
    const first = Array.from({ length: 100 }, (_, i) => `qwen-${String(i).padStart(3, "0")}`);
    const fetchMock = vi.fn().mockResolvedValueOnce(page(first, 102)).mockResolvedValueOnce(page(["qwen3.8-flash", "qwen-000"], 102));
    vi.stubGlobal("fetch", fetchMock);
    const result = await listProviderModels(credential("qwen"));
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      "https://dashscope-intl.aliyuncs.com/api/v1/models?page_no=1&page_size=100",
      "https://dashscope-intl.aliyuncs.com/api/v1/models?page_no=2&page_size=100",
    ]);
    expect(result.ok && result.models).toHaveLength(101);
    expect(result.ok && result.models.some((m) => m.id === "qwen3.8-flash")).toBe(true);
  });

  it("fails a Qwen list when any page fails, rather than showing part of it as the whole", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    expect((await listProviderModels(credential("qwen"))).ok).toBe(false);
    const full = Array.from({ length: 100 }, (_, i) => ({ model: `m-${i}` }));
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ output: { models: full } }), { status: 200 }))
        .mockResolvedValueOnce(new Response("{}", { status: 500 })),
    );
    expect(await listProviderModels(credential("qwen"))).toMatchObject({ ok: false, status: 500 });
  });

  it("lists Qwen on the host its base URL names, never the international one behind an override", async () => {
    expect(dashScopeListUrl("https://dashscope.aliyuncs.com/compatible-mode/v1")).toBe("https://dashscope.aliyuncs.com/api/v1/models");
    expect(dashScopeListUrl("https://ws1.cn-beijing.maas.aliyuncs.com/compatible-mode/v1")).toBe(
      "https://ws1.cn-beijing.maas.aliyuncs.com/api/v1/models",
    );
    expect(dashScopeListUrl("https://proxy.example/qwen")).toBeNull();
    // A proxy override lists as an OpenAI-compatible endpoint, on the proxy.
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "qwen3.8-flash" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await listProviderModels(credential("qwen", { TUTOR_QWEN_BASE_URL: "https://proxy.example/qwen" }));
    expect(String((fetchMock.mock.calls[0] as unknown as [string])[0])).toBe("https://proxy.example/qwen/models");
    expect(result).toEqual({ ok: true, models: [{ id: "qwen3.8-flash" }] });
  });

  it("sends a turn through an added provider's chat endpoint with its key and headers (Anthropic)", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ model: "claude-haiku-4-5", choices: [{ message: { role: "assistant", content: "Hello." } }] }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const outcome = await completeWithFallback([{ role: "user", content: "Hi" }], [credential("anthropic")]);
    expect(outcome.ok && outcome.result).toMatchObject({ content: "Hello.", provider: "anthropic", providerLabel: "Anthropic" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/chat/completions");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-key-0123456789abcdef");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "claude-haiku-4-5", stream: false });
  });
});

describe("a custom provider's calls", () => {
  const custom: ProviderCredential = {
    config: { ...customProviderConfig({ id: "custom-gw", label: "Gateway", baseUrl: "https://gw.example/v1" }), model: "gw/fast" },
    apiKey: "test-key-0123456789abcdef",
    source: "saved",
  };

  it("refuse a redirect, so the key never follows one past the saved URL's check; built-ins keep the default", async () => {
    expect(redirectPolicy(custom.config)).toBe("error");
    expect(redirectPolicy(credential("openai").config)).toBe("follow");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await listProviderModels(custom);
    await testProviderKey(custom);
    await completeWithFallback([{ role: "user", content: "hi" }], [custom]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const call of fetchMock.mock.calls as unknown as [string, RequestInit][]) expect(call[1].redirect).toBe("error");
  });
});
