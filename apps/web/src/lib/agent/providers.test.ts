import { describe, expect, it, vi, afterEach } from "vitest";
import {
  availableProviderSummary,
  completeWithFallback,
  DEFAULT_NVIDIA_MODEL,
  openRouterReferer,
  resetGoneModelReports,
  resolveProviders,
} from "@/lib/agent/providers";
import { resolveSiteUrl } from "@/lib/site-url";

afterEach(() => {
  resetGoneModelReports();
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
    expect(providers[0].model).toBe("google/gemma-4-31b-it");
    expect(providers[1].model).toBe("gemini-2.5-flash");
    expect(providers[2].model).toBe("openrouter/free");
  });

  it("never defaults to the retired Llama 3.1 8B", () => {
    expect(DEFAULT_NVIDIA_MODEL).not.toBe("meta/llama-3.1-8b-instruct");
    expect(resolveProviders({ NVIDIA_API_KEY: "nv" })[0].model).toBe(
      DEFAULT_NVIDIA_MODEL,
    );
  });

  it("falls back to the default when NVIDIA_MODEL is blank", () => {
    const providers = resolveProviders({
      NVIDIA_API_KEY: "nv",
      NVIDIA_MODEL: "   ",
    });
    expect(providers[0].model).toBe(DEFAULT_NVIDIA_MODEL);
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
      "https://forked.test/",
    );
  });

  it("assumes https for a bare Vercel domain, as the layout does", () => {
    expect(
      openRouterReferer({ VERCEL_PROJECT_PRODUCTION_URL: "forked.vercel.app" }),
    ).toBe("https://forked.vercel.app/");
  });

  it("falls back to localhost when the deployment says nothing at all", () => {
    expect(openRouterReferer({})).toBe("http://localhost:3000/");
  });

  it("agrees with the layout on a value that will not parse", () => {
    // The two resolution paths used to disagree here: the layout fell back to
    // localhost and this sent the malformed string on as a header.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(openRouterReferer({ NEXT_PUBLIC_SITE_URL: "http://" })).toBe(
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "http://" }).toString(),
    );
    expect(openRouterReferer({ NEXT_PUBLIC_SITE_URL: "http://" })).toBe(
      "http://localhost:3000/",
    );
    expect(warn).toHaveBeenCalled();
  });

  it("agrees with the layout on an empty string", () => {
    expect(openRouterReferer({ NEXT_PUBLIC_SITE_URL: "" })).toBe(
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "" }).toString(),
    );
  });

  it("rides along on the provider's headers", () => {
    const providers = resolveProviders({
      OPENROUTER_API_KEY: "or",
      NEXT_PUBLIC_SITE_URL: "https://forked.test",
    });
    expect(providers[0].extraHeaders?.["HTTP-Referer"]).toBe("https://forked.test/");
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
        model: "google/gemma-4-31b-it",
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
  it("logs a 410 once with the model name, and keeps falling back", async () => {
    const gone = {
      ok: false,
      status: 410,
      statusText: "Gone",
      text: async () => "end of life",
    };
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
      String(url).includes("nvidia.com")
        ? gone
        : {
            ok: true,
            json: async () => ({
              choices: [{ message: { content: "from gemini" } }],
              model: "gemini-2.5-flash",
            }),
          },
    );
    vi.stubGlobal("fetch", fetchMock);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const env = { NVIDIA_API_KEY: "nv", GEMINI_API_KEY: "gm" };

    for (let i = 0; i < 3; i++) {
      const outcome = await completeWithFallback(
        [{ role: "user", content: "hi" }],
        env,
      );
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.attempts[0]).toMatchObject({
          provider: "nvidia",
          model: DEFAULT_NVIDIA_MODEL,
          status: 410,
        });
      }
    }

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain(DEFAULT_NVIDIA_MODEL);
    expect(errorSpy.mock.calls[0][0]).toContain("410");
  });

  it("does not log a rate limit as a retired model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        text: async () => "slow down",
      }),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await completeWithFallback([{ role: "user", content: "hi" }], {
      NVIDIA_API_KEY: "nv",
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
