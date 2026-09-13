import { describe, expect, it, vi, afterEach } from "vitest";
import {
  availableProviderSummary,
  completeWithFallback,
  openRouterReferer,
  resolveProviders,
} from "@/lib/agent/providers";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("resolveProviders", () => {
  it("returns providers in NVIDIA → Gemini → OpenRouter order when keys exist", () => {
    const providers = resolveProviders({
      NVIDIA_API_KEY: "nv",
      GEMINI_API_KEY: "gm",
      OPENROUTER_API_KEY: "or",
    });
    expect(providers.map((p) => p.id)).toEqual([
      "nvidia",
      "gemini",
      "openrouter",
    ]);
    expect(providers[0].model).toBe("meta/llama-3.1-8b-instruct");
    expect(providers[1].model).toBe("gemini-2.5-flash");
    expect(providers[2].model).toBe("openrouter/free");
  });

  it("skips providers without keys", () => {
    const providers = resolveProviders({
      GEMINI_API_KEY: "gm",
    });
    expect(providers.map((p) => p.id)).toEqual(["gemini"]);
  });

  it("honors model overrides", () => {
    const providers = resolveProviders({
      NVIDIA_API_KEY: "nv",
      NVIDIA_MODEL: "meta/llama-3.1-70b-instruct",
    });
    expect(providers[0].model).toBe("meta/llama-3.1-70b-instruct");
  });

  it("uses the published endpoints when no base URL is set", () => {
    const providers = resolveProviders({
      NVIDIA_API_KEY: "nv",
      GEMINI_API_KEY: "gm",
      OPENROUTER_API_KEY: "or",
    });
    expect(providers.map((p) => p.baseUrl)).toEqual([
      "https://integrate.api.nvidia.com/v1",
      "https://generativelanguage.googleapis.com/v1beta/openai",
      "https://openrouter.ai/api/v1",
    ]);
  });

  it("honors base URL overrides, one provider at a time", () => {
    const providers = resolveProviders({
      NVIDIA_API_KEY: "nv",
      GEMINI_API_KEY: "gm",
      NVIDIA_BASE_URL: "http://localhost:8080/v1",
    });
    expect(providers[0].baseUrl).toBe("http://localhost:8080/v1");
    // The one that was not overridden is untouched.
    expect(providers[1].baseUrl).toBe(
      "https://generativelanguage.googleapis.com/v1beta/openai",
    );
  });

  it("trims a trailing slash, since the caller appends /chat/completions", () => {
    const providers = resolveProviders({
      GEMINI_API_KEY: "gm",
      GEMINI_BASE_URL: "http://127.0.0.1:1234/v1/",
    });
    expect(providers[0].baseUrl).toBe("http://127.0.0.1:1234/v1");
  });

  it("falls back to the default for a blank base URL", () => {
    const providers = resolveProviders({ NVIDIA_API_KEY: "nv", NVIDIA_BASE_URL: "  " });
    expect(providers[0].baseUrl).toBe("https://integrate.api.nvidia.com/v1");
  });
});

describe("openRouterReferer", () => {
  it("prefers the explicit variable", () => {
    expect(
      openRouterReferer({
        OPENROUTER_HTTP_REFERER: "https://example.test",
        NEXT_PUBLIC_SITE_URL: "https://ignored.test",
      }),
    ).toBe("https://example.test");
  });

  it("credits the deployment's own site URL, not this project's domain", () => {
    // The point of the change: a fork that configured its site and nothing
    // else must not spend its OpenRouter requests under our name.
    expect(openRouterReferer({ NEXT_PUBLIC_SITE_URL: "https://forked.test" })).toBe(
      "https://forked.test",
    );
  });

  it("assumes https for a bare Vercel domain, as the layout does", () => {
    expect(
      openRouterReferer({ VERCEL_PROJECT_PRODUCTION_URL: "forked.vercel.app" }),
    ).toBe("https://forked.vercel.app");
  });

  it("falls back to localhost when the deployment says nothing at all", () => {
    expect(openRouterReferer({})).toBe("http://localhost:3000");
  });

  it("rides along on the provider's headers", () => {
    const providers = resolveProviders({
      OPENROUTER_API_KEY: "or",
      NEXT_PUBLIC_SITE_URL: "https://forked.test",
    });
    expect(providers[0].extraHeaders?.["HTTP-Referer"]).toBe("https://forked.test");
  });
});

describe("availableProviderSummary", () => {
  it("describes missing keys", () => {
    expect(availableProviderSummary({})).toContain("none");
  });
});

describe("completeWithFallback", () => {
  it("returns MISSING_API_KEY when no keys are configured", async () => {
    const outcome = await completeWithFallback(
      [{ role: "user", content: "hi" }],
      {},
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("MISSING_API_KEY");
  });

  it("uses the first successful provider", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "hello from nvidia" } }],
        model: "meta/llama-3.1-8b-instruct",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await completeWithFallback(
      [{ role: "user", content: "hi" }],
      {
        NVIDIA_API_KEY: "nv",
        GEMINI_API_KEY: "gm",
      },
    );

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.provider).toBe("nvidia");
      expect(outcome.result.content).toBe("hello from nvidia");
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back when the primary provider fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        text: async () => "rate limited",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "hello from gemini" } }],
          model: "gemini-2.5-flash",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await completeWithFallback(
      [{ role: "user", content: "hi" }],
      {
        NVIDIA_API_KEY: "nv",
        GEMINI_API_KEY: "gm",
        OPENROUTER_API_KEY: "or",
      },
    );

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.provider).toBe("gemini");
      expect(outcome.attempts).toHaveLength(1);
      expect(outcome.attempts[0].provider).toBe("nvidia");
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
