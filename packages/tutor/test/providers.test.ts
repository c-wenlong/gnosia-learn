import { describe, expect, it, vi, afterEach } from "vitest";
import {
  availableProviderSummary,
  completeWithFallback,
  DEFAULT_NVIDIA_MODEL,
  openRouterReferer,
  orderCredentials,
  resetGoneModelReports,
  resolveProviders,
  providerMessage,
  testProviderKey,
} from "../src/providers";
import { resolveSiteUrl } from "../src/site-url";

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
    expect(availableProviderSummary([])).toContain("none");
  });
});

describe("completeWithFallback", () => {
  it("returns MISSING_API_KEY when no keys are configured", async () => {
    const outcome = await completeWithFallback(
      [{ role: "user", content: "hi" }],
      orderCredentials({}, {}),
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
      orderCredentials({}, {
        NVIDIA_API_KEY: "nv",
        GEMINI_API_KEY: "gm",
      }),
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
      orderCredentials({}, {
        NVIDIA_API_KEY: "nv",
        GEMINI_API_KEY: "gm",
        OPENROUTER_API_KEY: "or",
      }),
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
    const credentials = orderCredentials({}, {
      NVIDIA_API_KEY: "nv",
      GEMINI_API_KEY: "gm",
    });

    for (let i = 0; i < 3; i++) {
      const outcome = await completeWithFallback(
        [{ role: "user", content: "hi" }],
        credentials,
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

  it("names both causes for a 404, since a bad base URL answers it too", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "404 page not found",
      }),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await completeWithFallback(
      [{ role: "user", content: "hi" }],
      orderCredentials({}, {
        NVIDIA_API_KEY: "nv",
        NVIDIA_BASE_URL: "https://user:pw@gateway.example/t0k3n-path/v1?key=q5",
      }),
    );
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = String(errorSpy.mock.calls[0][0]);
    expect(line).toContain(DEFAULT_NVIDIA_MODEL);
    expect(line).toContain("https://gateway.example");
    // Only the origin: a gateway token in the path, query or userinfo stays out.
    expect(line).not.toContain("t0k3n-path");
    expect(line).not.toContain("q5");
    expect(line).not.toContain("pw");
    expect(line).toContain("base URL");
    expect(line).not.toContain("it is retired");
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
    await completeWithFallback(
      [{ role: "user", content: "hi" }],
      orderCredentials({}, { NVIDIA_API_KEY: "nv" }),
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

/**
 * Bring your own key (docs/BYOK.md, decision 4): the owner's saved keys go
 * first, in the cascade's order, then the server's for the rest, and each
 * provider appears once.
 */
describe("orderCredentials", () => {
  const env = { NVIDIA_API_KEY: "server-nvidia-key", OPENROUTER_API_KEY: "server-openrouter-key" };

  it("is the server's keys alone when the owner saved none", () => {
    expect(orderCredentials({}, env).map((c) => [c.config.id, c.source])).toEqual([
      ["nvidia", "server"],
      ["openrouter", "server"],
    ]);
  });

  it("puts the owner's keys first, in the cascade's order, then the server's", () => {
    const order = orderCredentials({ openrouter: "own-openrouter-key", gemini: "own-gemini-key" }, env);
    expect(order.map((c) => [c.config.id, c.source, c.apiKey])).toEqual([
      ["gemini", "saved", "own-gemini-key"],
      ["openrouter", "saved", "own-openrouter-key"],
      ["nvidia", "server", "server-nvidia-key"],
    ]);
  });

  it("uses the owner's key in place of the server's for the same provider, not beside it", () => {
    const order = orderCredentials({ nvidia: "own-nvidia-key" }, env);
    expect(order.filter((c) => c.config.id === "nvidia")).toHaveLength(1);
    expect(order[0]).toMatchObject({ source: "saved", apiKey: "own-nvidia-key" });
  });

  it("works with no server keys at all, which is a local machine's case", () => {
    expect(orderCredentials({ gemini: "own-gemini-key" }, {}).map((c) => c.config.id)).toEqual(["gemini"]);
    expect(orderCredentials({}, {})).toEqual([]);
  });

  it("says where each key came from, and never any of the key", () => {
    const summary = availableProviderSummary(orderCredentials({ gemini: "own-gemini-key" }, env));
    expect(summary).toBe("gemini (your key) → nvidia (server key) → openrouter (server key)");
    expect(summary).not.toMatch(/own-gemini|server-nvidia|server-openrouter/);
  });
});

describe("provider errors never carry a key", () => {
  const key = "nvapi-Zk3xQ9vB7mW2pL5tR8yN4cH6dF1gJ0sA";

  it("takes a whole or masked echo out of a failed attempt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => `{"error":"Invalid key ${key}, also known as nvapi-Zk3x****gJ0sA"}`,
      }),
    );
    const outcome = await completeWithFallback([{ role: "user", content: "hi" }], orderCredentials({ nvidia: key }, {}));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    const text = JSON.stringify(outcome.attempts);
    expect(text).not.toContain(key);
    expect(text).not.toContain("Zk3x");
    expect(text).not.toContain("gJ0sA");
    expect(text).toContain("[redacted]");
    expect(text).toContain("Invalid key");
  });

  it("redacts a key echoed in the reason phrase of a failed attempt and in the model of a reply", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 401, statusText: `Unauthorized ${key}`, text: async () => "" })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ choices: [{ message: { content: "hello" } }], model: `echo-${key}` }),
        }),
    );
    const outcome = await completeWithFallback(
      [{ role: "user", content: "hi" }],
      orderCredentials({ nvidia: key, gemini: "AIzaSyExampleExampleExample0123456789" }, {}),
    );
    expect(outcome.ok).toBe(true);
    const text = JSON.stringify(outcome);
    expect(text).not.toContain(key);
    expect(text).not.toContain("Zk3x");
    expect(text).not.toContain("gJ0sA");
    if (!outcome.ok) return;
    expect(outcome.attempts[0]?.message).toBe("Unauthorized [redacted]");
    expect(outcome.result.model).toBe("echo-[redacted]");
  });

  it("tests a key with one minimal call and reports the provider's words, redacted", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => `Authentication failed for key ${key}`,
    });
    vi.stubGlobal("fetch", fetchMock);
    const [credential] = orderCredentials({ nvidia: key }, {});
    const result = await testProviderKey(credential!);
    expect(result).toEqual({ ok: false, status: 401, message: "Authentication failed for key [redacted]" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    expect(JSON.parse(String(init.body))).toMatchObject({ max_tokens: 1 });
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${key}`);
  });

  it("redacts a key echoed in a success's model name or an error's status text", async () => {
    const [credential] = orderCredentials({ nvidia: key }, {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ model: `model-for-${key}` }) }));
    expect(await testProviderKey(credential!)).toEqual({ ok: true, model: "model-for-[redacted]" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: `Bad key ${key}`, text: async () => "" }));
    expect(await testProviderKey(credential!)).toEqual({ ok: false, status: 401, message: "Bad key [redacted]" });
  });

  it("calls any 2xx a working key, and a network failure a failed test rather than a throw", async () => {
    const [credential] = orderCredentials({ gemini: "AIzaSyExampleExampleExample0123456789" }, {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ model: "gemini-2.5-flash" }) }));
    expect(await testProviderKey(credential!)).toEqual({ ok: true, model: "gemini-2.5-flash" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await testProviderKey(credential!)).toMatchObject({ ok: false, status: null, message: "fetch failed" });
  });
});

describe("providerMessage", () => {
  it("reads the sentence out of each provider's error shape", () => {
    expect(providerMessage('{"error":{"message":"No auth credentials found","code":401}}')).toBe("No auth credentials found");
    expect(providerMessage('[{"error":{"code":400,"message":"Please pass a valid API key","status":"INVALID_ARGUMENT"}}]')).toBe(
      "Please pass a valid API key",
    );
    expect(providerMessage('{"type":"about:blank","title":"Unauthorized","status":401,"detail":"Invalid key"}')).toBe("Invalid key");
    expect(providerMessage("Bad Gateway\n")).toBe("Bad Gateway");
  });
});
