import { afterEach, describe, expect, it, vi } from "vitest";

import { sendJson } from "./send-json";

/**
 * `sendJson` is the settings cards' and the library's request: the status,
 * whether it was a 2xx, and the reply as JSON, or null with no answer at all.
 * It logs nothing, since a body may hold a key: `no-console` in
 * eslint.config.mjs holds that.
 */

function answer(status: number, body: string) {
  const fetchMock = vi.fn(async () => new Response(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** A `fetch` that answers nothing, and rejects as a browser does once its signal aborts. */
function hangUntilAborted(_url: string, init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason ?? new DOMException("aborted", "AbortError")));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sendJson", () => {
  it("sends the body as JSON, uncached, and reads the reply", async () => {
    const fetchMock = answer(200, JSON.stringify({ ok: true, chain: [] }));
    const reply = await sendJson<{ ok?: boolean; chain?: unknown[] }>("POST", "/api/learner/tutor-model", { provider: "groq" });
    expect(reply).toEqual({ status: 200, ok: true, data: { ok: true, chain: [] } });
    expect(fetchMock).toHaveBeenCalledWith("/api/learner/tutor-model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "groq" }),
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
  });

  it("sends no body, and no content type, when given none", async () => {
    const fetchMock = answer(200, "{}");
    await sendJson("GET", "/api/x");
    expect(fetchMock).toHaveBeenCalledWith("/api/x", { method: "GET", cache: "no-store", signal: expect.any(AbortSignal) });
  });

  it("says a refusal's status, and reads its body", async () => {
    answer(400, JSON.stringify({ ok: false, error: "No such provider." }));
    expect(await sendJson("DELETE", "/api/learner/provider-key", { provider: "x" })).toEqual({
      status: 400,
      ok: false,
      data: { ok: false, error: "No such provider." },
    });
  });

  it("reads a body that is not JSON, or is JSON null, as an empty object", async () => {
    answer(502, "<html>Bad gateway</html>");
    expect(await sendJson("POST", "/api/x", {})).toEqual({ status: 502, ok: false, data: {} });
    answer(200, "null");
    expect(await sendJson("POST", "/api/x", {})).toEqual({ status: 200, ok: true, data: {} });
  });

  it("is null when nothing answered, and logs nothing: a key may be in the body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => undefined));
    expect(await sendJson("POST", "/api/learner/provider-key", { provider: "groq", key: "gsk_secret" })).toBeNull();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("gives up on a server that never answers, so nothing waits on it for good", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("fetch", vi.fn(hangUntilAborted));
      const reply = sendJson("POST", "/api/learner/preference", {}, { timeoutMs: 1_000 });
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await reply).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("is null once the caller's signal aborts it", async () => {
    vi.stubGlobal("fetch", vi.fn(hangUntilAborted));
    const controller = new AbortController();
    const reply = sendJson("GET", "/api/learner/recent", undefined, { signal: controller.signal });
    controller.abort();
    expect(await reply).toBeNull();
  });
});
