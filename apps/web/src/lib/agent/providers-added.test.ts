import { afterEach, describe, expect, it, vi } from "vitest";

import { listProviderModels, orderCredentials, providerConfigs, type ProviderCredential } from "./providers";

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

  it("reports a Qwen list that fails on its first page, and keeps what it has when a later page fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    expect((await listProviderModels(credential("qwen"))).ok).toBe(false);
    const full = Array.from({ length: 100 }, (_, i) => ({ model: `m-${i}` }));
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ output: { models: full } }), { status: 200 }))
        .mockResolvedValueOnce(new Response("{}", { status: 500 })),
    );
    const partial = await listProviderModels(credential("qwen"));
    expect(partial.ok && partial.models).toHaveLength(100);
  });
});
