import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  availableProviderSummary,
  completeWithFallback,
  DEFAULT_ATTEMPT_TIMEOUT_MS,
  DEFAULT_TURN_DEADLINE_MS,
  isCallable,
  keyFor,
  keyTestModel,
  missingKeyMessage,
  listProviderModels,
  MODEL_LIST_MAX_BYTES,
  orderCredentials,
  resetGoneModelReports,
  turnTimeouts,
  tutorSteps,
  type ChainEntry,
  type ProviderCredential,
} from "@/lib/agent/providers";

/**
 * The tutor's model chain (docs/TUTOR-MODELS.md): resolution order, entries
 * with no key kept and skipped, an empty step list when there is no chain
 * (the built-in defaults are gone, T15), and a provider's model list, read
 * and redacted. `fetch` is stubbed
 * throughout; no test calls a provider.
 */

afterEach(() => {
  resetGoneModelReports();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ENV = { NVIDIA_API_KEY: "server-nvidia-key-0123456789", OPENROUTER_API_KEY: "server-openrouter-key-0123456789" };
const OWN_GEMINI = "AIzaSyOwnGeminiKeyExample0123456789abc";

function ok(content: string, model = "m") {
  return { ok: true, json: async () => ({ choices: [{ message: { content } }], model }) };
}
function fail(status: number, text = "nope") {
  return { ok: false, status, statusText: "", text: async () => text };
}

describe("tutorSteps", () => {
  it("is empty when the owner has no chain: the built-in defaults are gone (T15)", () => {
    expect(tutorSteps([], { gemini: OWN_GEMINI }, ENV)).toEqual([]);
    expect(tutorSteps([], {}, ENV)).toEqual([]);
    expect(tutorSteps([], {}, { ...ENV, NVIDIA_MODEL: "nvidia/other" })).toEqual([]);
  });

  it("follows the chain's order and model ids, with the key keyFor finds for each", () => {
    const chain: ChainEntry[] = [
      { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free" },
      { provider: "gemini", model: "gemini-2.5-pro" },
      { provider: "nvidia", model: "nvidia/nemotron" },
      { provider: "gemini", model: "gemini-2.5-flash-lite" },
    ];
    const steps = tutorSteps(chain, { gemini: OWN_GEMINI }, ENV);
    expect(steps.map((s) => (isCallable(s) ? [s.config.id, s.config.model, s.source] : s))).toEqual([
      ["openrouter", "meta-llama/llama-3.3-70b-instruct:free", "server"],
      ["gemini", "gemini-2.5-pro", "saved"],
      ["nvidia", "nvidia/nemotron", "server"],
      ["gemini", "gemini-2.5-flash-lite", "saved"],
    ]);
    // Each entry keeps its provider's endpoint.
    expect(steps.map((s) => (isCallable(s) ? s.config.baseUrl : null))).toEqual([
      "https://openrouter.ai/api/v1",
      "https://generativelanguage.googleapis.com/v1beta/openai",
      "https://integrate.api.nvidia.com/v1",
      "https://generativelanguage.googleapis.com/v1beta/openai",
    ]);
  });

  it("keeps an entry with no key in place as a skip, rather than dropping it or ending the chain", () => {
    const steps = tutorSteps(
      [
        { provider: "gemini", model: "gemini-2.5-pro" },
        { provider: "nvidia", model: "nvidia/nemotron" },
      ],
      {},
      ENV,
    );
    expect(steps[0]).toEqual({
      skipped: true,
      provider: "gemini",
      model: "gemini-2.5-pro",
      reason: "no key for Google Gemini",
      keyed: ["nvidia", "openrouter"],
    });
    expect(isCallable(steps[1]!)).toBe(true);
  });

  it("never adds the defaults behind a chain", () => {
    const steps = tutorSteps([{ provider: "nvidia", model: "only-this" }], {}, ENV);
    expect(steps).toHaveLength(1);
  });

  it("finds a saved key before the server's, and none when neither holds one", () => {
    expect(keyFor("nvidia", { nvidia: "own-nvidia-key-0123456789" }, ENV)).toEqual({ apiKey: "own-nvidia-key-0123456789", source: "saved" });
    expect(keyFor("nvidia", {}, ENV)).toEqual({ apiKey: ENV.NVIDIA_API_KEY, source: "server" });
    expect(keyFor("gemini", {}, ENV)).toBeNull();
  });

  it("describes the chain by model, skips included, and never any key", () => {
    const summary = availableProviderSummary(
      tutorSteps(
        [
          { provider: "gemini", model: "gemini-2.5-pro" },
          { provider: "nvidia", model: "nvidia/nemotron" },
        ],
        {},
        ENV,
      ),
    );
    expect(summary).toBe("gemini gemini-2.5-pro (no key) → nvidia nvidia/nemotron (server key)");
    expect(summary).not.toContain("server-nvidia");
  });
});

describe("completeWithFallback over a chain", () => {
  it("records a skip, falls through a failing entry and stops at the first that answers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fail(410, "gone"))
      .mockResolvedValueOnce(ok("from the second", "served-model"))
      .mockResolvedValueOnce(ok("never reached"));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const steps = tutorSteps(
      [
        { provider: "gemini", model: "gemini-2.5-pro" },
        { provider: "nvidia", model: "retired/model" },
        { provider: "openrouter", model: "openrouter/free" },
        { provider: "nvidia", model: "after" },
      ],
      {},
      ENV,
    );
    const outcome = await completeWithFallback([{ role: "user", content: "hi" }], steps);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result).toMatchObject({ provider: "openrouter", content: "from the second" });
    expect(outcome.attempts).toEqual([
      { provider: "gemini", model: "gemini-2.5-pro", message: "no key for Google Gemini", skipped: true },
      expect.objectContaining({ provider: "nvidia", model: "retired/model", status: 410 }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)).model);
    expect(bodies).toEqual(["retired/model", "openrouter/free"]);
  });

  it("tells the operator to change a retired chain model in Settings, not in the environment", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(fail(410)).mockResolvedValueOnce(ok("x")));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await completeWithFallback(
      [{ role: "user", content: "hi" }],
      tutorSteps([{ provider: "nvidia", model: "old" }, { provider: "openrouter", model: "b" }], {}, ENV),
    );
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain("under Model selection in Settings");
    expect(String(errorSpy.mock.calls[0]?.[0])).not.toContain("NVIDIA_MODEL");
  });

  it("is MISSING_API_KEY, with the skips as attempts, when no entry has a key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const outcome = await completeWithFallback(
      [{ role: "user", content: "hi" }],
      tutorSteps([{ provider: "gemini", model: "a" }], {}, {}),
    );
    expect(outcome).toEqual({
      ok: false,
      code: "MISSING_API_KEY",
      attempts: [{ provider: "gemini", model: "a", message: "no key for Google Gemini", skipped: true }],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is ALL_PROVIDERS_FAILED when every entry with a key failed, without trying the defaults", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fail(500));
    vi.stubGlobal("fetch", fetchMock);
    const outcome = await completeWithFallback(
      [{ role: "user", content: "hi" }],
      tutorSteps([{ provider: "nvidia", model: "a" }], {}, ENV),
    );
    expect(outcome).toMatchObject({ ok: false, code: "ALL_PROVIDERS_FAILED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("listProviderModels", () => {
  const key = "sk-or-v1-ListKeyExample0123456789abcdef0123456789";
  const credential = (id: "nvidia" | "gemini" | "openrouter", env: Record<string, string> = {}): ProviderCredential => {
    const [c] = orderCredentials({ [id]: key }, env);
    return c!;
  };

  function listing(data: unknown, init: { status?: number } = {}) {
    return new Response(JSON.stringify(data), { status: init.status ?? 200, headers: { "content-type": "application/json" } });
  }

  it("asks the provider's configured base URL for /models with the key, and nothing a caller chose", async () => {
    const fetchMock = vi.fn().mockResolvedValue(listing({ data: [{ id: "b/model" }, { id: "a/model" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await listProviderModels(credential("nvidia"));
    expect(result).toEqual({ ok: true, models: [{ id: "a/model" }, { id: "b/model" }] });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://integrate.api.nvidia.com/v1/models");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${key}`);

    fetchMock.mockClear();
    await listProviderModels(credential("nvidia", { NVIDIA_BASE_URL: "http://127.0.0.1:9/v1/" }));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:9/v1/models");
  });

  it("takes Gemini's models/ prefix off, marks OpenRouter's free models, and drops ids a chain could not hold", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(listing({ data: [{ id: "models/gemini-2.5-flash" }, { id: "models/gemini-2.5-flash" }] })),
    );
    expect(await listProviderModels(credential("gemini"))).toEqual({ ok: true, models: [{ id: "gemini-2.5-flash" }] });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        listing({
          data: [
            { id: "x/free:free", pricing: { prompt: "0", completion: "0" } },
            { id: "x/paid", pricing: { prompt: "0.000001", completion: "0.000002" } },
            { id: "has space" },
            { id: "ünïcode" },
            { id: "y".repeat(201) },
            { id: 42 },
            null,
            { id: `leak-${key}` },
            { id: `masked-${key.slice(0, 12)}` },
          ],
        }),
      ),
    );
    const result = await listProviderModels(credential("openrouter"));
    expect(result).toEqual({ ok: true, models: [{ id: "x/free:free", free: true }, { id: "x/paid", free: false }] });
    expect(JSON.stringify(result)).not.toContain(key.slice(9, 20));
  });

  it("reports a refusal in the provider's words with the key taken out, and never throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(listing({ error: { message: `Invalid key ${key}` } }, { status: 401 })));
    const refused = await listProviderModels(credential("openrouter"));
    expect(refused).toEqual({ ok: false, status: 401, message: "Invalid key [redacted]" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 200 })));
    expect(await listProviderModels(credential("openrouter"))).toMatchObject({ ok: false, message: expect.stringContaining("not JSON") });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(listing({ models: [] })));
    expect(await listProviderModels(credential("openrouter"))).toMatchObject({ ok: false, message: expect.stringContaining("no data") });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError(`connect failed for ${key}`)));
    expect(await listProviderModels(credential("openrouter"))).toEqual({ ok: false, status: null, message: "connect failed for [redacted]" });
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));
    expect(await listProviderModels(credential("openrouter"), 2_000)).toMatchObject({ ok: false, message: expect.stringContaining("2 seconds") });
  });
  it("stops reading a list past its cap however long the provider says it is, and an error body past 64 KB", async () => {
    // A stream that would run to twice the cap, with no Content-Length: the
    // reader must give up at the cap rather than hold all of it.
    let sent = 0;
    let cancelled = false;
    const chunk = new Uint8Array(1024 * 1024).fill(0x20);
    const endless = (status: number) =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            if (sent >= MODEL_LIST_MAX_BYTES * 2) return controller.close();
            sent += chunk.byteLength;
            controller.enqueue(chunk);
          },
          cancel() {
            cancelled = true;
          },
        }),
        { status },
      );
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => endless(200)));
    expect(await listProviderModels(credential("openrouter"))).toMatchObject({ ok: false, message: expect.stringContaining("too large") });
    expect(cancelled).toBe(true);
    expect(sent).toBeLessThanOrEqual(MODEL_LIST_MAX_BYTES + 2 * chunk.byteLength);

    sent = 0;
    cancelled = false;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => endless(502)));
    expect(await listProviderModels(credential("openrouter"))).toEqual({ ok: false, status: 502, message: "HTTP 502" });
    expect(cancelled).toBe(true);
    expect(sent).toBeLessThan(4 * chunk.byteLength);

    // A declared length past the cap is refused before any of it is read.
    const declared = new Response("{}", { status: 200, headers: { "content-length": String(MODEL_LIST_MAX_BYTES + 1) } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(declared));
    expect(await listProviderModels(credential("openrouter"))).toMatchObject({ ok: false, message: expect.stringContaining("too large") });
  });
});

describe("a turn's time limits", () => {
  // The limits run on a fake clock: `AbortSignal.timeout` keeps Node's own
  // timer, which no fake controls, so it is swapped for one on `setTimeout`
  // that does. On the wall clock a loaded machine fired the second attempt's
  // timer after the turn's deadline and the walk recorded two attempts, not three.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("The operation timed out.", "TimeoutError")), ms);
      return controller.signal;
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A fetch that never answers on its own, and rejects as fetch does when its signal aborts. */
  function hanging() {
    return vi.fn((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    );
  }

  it("gives up on an entry that never answers and moves on to the next", async () => {
    const hang = hanging();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) =>
        JSON.parse(String(init?.body)).model === "hangs" ? hang(url, init) : Promise.resolve(ok("from the second")),
      ),
    );
    const walk = completeWithFallback(
      [{ role: "user", content: "hi" }],
      tutorSteps([{ provider: "nvidia", model: "hangs" }, { provider: "openrouter", model: "answers" }], {}, ENV),
      { attemptMs: 60, deadlineMs: 5_000 },
    );
    // The first entry's limit, and no more: the second answers at once.
    await vi.advanceTimersByTimeAsync(60);
    const outcome = await walk;
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.content).toBe("from the second");
    expect(outcome.attempts).toEqual([
      { provider: "nvidia", model: "hangs", message: "No answer within 0 seconds, so the tutor moved on.", timedOut: true },
    ]);
  });

  it("stops the walk at the turn's deadline and returns the attempts so far, saying what was not tried", async () => {
    vi.stubGlobal("fetch", hanging());
    let settled = false;
    const walk = completeWithFallback(
      [{ role: "user", content: "hi" }],
      tutorSteps(
        [
          { provider: "nvidia", model: "first" },
          { provider: "nvidia", model: "second" },
          { provider: "openrouter", model: "third" },
          { provider: "openrouter", model: "fourth" },
        ],
        {},
        ENV,
      ),
      // Each attempt may take 80 ms, the whole turn 200: the third is cut
      // off by the turn's deadline, and the fourth is never started.
      { attemptMs: 80, deadlineMs: 200 },
    ).finally(() => {
      settled = true;
    });
    // Two whole attempts end at 160 ms; the walk is still on the third.
    await vi.advanceTimersByTimeAsync(199);
    expect(settled).toBe(false);
    // The deadline, not the third attempt's own limit (240 ms), ends it.
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    const outcome = await walk;
    expect(outcome).toMatchObject({ ok: false, code: "ALL_PROVIDERS_FAILED" });
    if (outcome.ok) return;
    expect(outcome.attempts.map((a) => [a.model, a.timedOut])).toEqual([
      ["first", true],
      ["second", true],
      ["third", true],
    ]);
    expect(outcome.attempts[2]?.message).toMatch(/^Cut off: the turn ran out of its 0 seconds, so 1 more model was not tried\.$/);
  });

  it("reads its limits from the environment, within bounds, and defaults otherwise", () => {
    expect(turnTimeouts({})).toEqual({ attemptMs: DEFAULT_ATTEMPT_TIMEOUT_MS, deadlineMs: DEFAULT_TURN_DEADLINE_MS });
    expect(turnTimeouts({ TUTOR_ATTEMPT_TIMEOUT_MS: "15000", TUTOR_TURN_DEADLINE_MS: " 45000 " })).toEqual({
      attemptMs: 15_000,
      deadlineMs: 45_000,
    });
    for (const bad of ["", "0", "-5", "abc", "1.5", "999", "300001"]) {
      expect(turnTimeouts({ TUTOR_ATTEMPT_TIMEOUT_MS: bad }).attemptMs).toBe(DEFAULT_ATTEMPT_TIMEOUT_MS);
    }
  });
});

describe("missingKeyMessage", () => {
  it("says a model is missing when there is no chain and no key (T15)", () => {
    expect(missingKeyMessage(tutorSteps([], {}, {}))).toBe("No model is set up. In Settings, add a key under Providers and pick a model under Model selection.");
  });

  it("names the providers that need a key and those that could take a model instead", () => {
    const steps = tutorSteps(
      [
        { provider: "gemini", model: "a" },
        { provider: "gemini", model: "b" },
      ],
      {},
      ENV,
    );
    expect(missingKeyMessage(steps)).toBe(
      "None of your models has a key. In Settings, add a key for Google Gemini under Providers, or pick a model from NVIDIA NIM or OpenRouter under Model selection.",
    );
    expect(missingKeyMessage(tutorSteps([{ provider: "gemini", model: "a" }, { provider: "nvidia", model: "b" }], {}, {}))).toBe(
      "None of your models has a key. In Settings, add a key for Google Gemini or NVIDIA NIM under Providers.",
    );
  });
});

describe("keyTestModel", () => {
  it("is the first chain entry for the provider, else the default — never used, the tutor calls the chain alone", () => {
    const chain: ChainEntry[] = [
      { provider: "openrouter", model: "x/one" },
      { provider: "nvidia", model: "n/first" },
      { provider: "nvidia", model: "n/second" },
    ];
    expect(keyTestModel(chain, "nvidia", {})).toEqual({ model: "n/first", modelFrom: "chain", used: true });
    // The provider's default still feeds a key Test, but `used` is false
    // either way now — the tutor calls nothing but the chain (T15).
    expect(keyTestModel(chain, "gemini", {})).toEqual({ model: "gemini-2.5-flash", modelFrom: "default", used: false });
    expect(keyTestModel([], "gemini", {})).toEqual({ model: "gemini-2.5-flash", modelFrom: "default", used: false });
  });
});
