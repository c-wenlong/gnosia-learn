import { describe, expect, it, vi, afterEach } from "vitest";
import {
  availableProviderSummary,
  completeWithFallback,
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
