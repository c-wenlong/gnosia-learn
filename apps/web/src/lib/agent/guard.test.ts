import { describe, expect, it } from "vitest";
import { CHAT_RATE_LIMIT, enforceRateLimit, enforceSameOrigin, readAgentBody, SUMMARIZE_RATE_LIMIT } from "@/lib/agent/guard";
import {
  checkRateLimit,
  clientIp,
  MAX_TRACKED_CLIENTS,
  measurePayload,
  PAYLOAD_LIMITS,
  type RateLimitStore,
} from "@gnosia/tutor/guards";
import { payloadTooLarge } from "@gnosia/tutor/server/turns";

const post = (headers: Record<string, string> = {}) =>
  new Request("http://study.test/api/agent/chat", { method: "POST", headers });

const turns = (count: number, chars = 1) =>
  Array.from({ length: count }, () => ({
    role: "user" as const,
    content: "x".repeat(chars),
  }));

describe("enforceSameOrigin", () => {
  it("lets a matching request through", () => {
    expect(enforceSameOrigin(post({ origin: "http://study.test", host: "study.test" }))).toBeNull();
    expect(enforceSameOrigin(post({ origin: "http://localhost:3131", host: "localhost:3131" }))).toBeNull();
  });

  it("never takes X-Forwarded-Host, which a client can send to a directly exposed server", () => {
    expect(
      enforceSameOrigin(post({ origin: "https://evil.test", host: "study.test", "x-forwarded-host": "evil.test" }))?.status,
    ).toBe(403);
  });

  it("answers 403 ORIGIN_MISMATCH with no Origin header", async () => {
    const res = enforceSameOrigin(post({ host: "study.test" }));
    expect(res?.status).toBe(403);
    await expect(res?.json()).resolves.toMatchObject({
      code: "ORIGIN_MISMATCH",
    });
  });

  it("answers 403 for a cross-site Origin, a port that differs, null, and nonsense", () => {
    for (const origin of ["https://evil.test", "http://study.test:4000", "null", "not a url", "file:///tmp/page.html"]) {
      expect(enforceSameOrigin(post({ origin, host: "study.test" }))?.status, origin).toBe(403);
    }
  });

  it("answers 403 when the browser says the request is cross-site or same-site, whatever Origin says", () => {
    for (const site of ["cross-site", "same-site"]) {
      expect(
        enforceSameOrigin(post({ origin: "http://study.test", host: "study.test", "sec-fetch-site": site }))?.status,
        site,
      ).toBe(403);
    }
  });
});

describe("measurePayload", () => {
  it("counts messages and the characters they carry", () => {
    expect(measurePayload(turns(3, 10))).toEqual({ count: 3, chars: 30 });
  });

  it("counts the learner note, which is interpolated into the prompt unclamped", () => {
    expect(measurePayload(turns(1, 5), "y".repeat(20))).toEqual({
      count: 1,
      chars: 25,
    });
  });

  it("skips content that carries nothing", () => {
    expect(
      measurePayload([{ content: null }, { content: undefined }, { content: "ab" }]),
    ).toEqual({ count: 3, chars: 2 });
  });

  it("measures non-string content by its serialised length", () => {
    // The chat route forwards content of any shape into JSON.stringify, so
    // the serialised form is what the provider request actually carries.
    expect(measurePayload([{ content: 42 }, { content: "ab" }])).toEqual({
      count: 2,
      chars: 4,
    });
    expect(measurePayload([{ content: ["ab", "cd"] }])).toEqual({
      count: 1,
      chars: JSON.stringify(["ab", "cd"]).length,
    });
  });

  it("treats unserialisable content as over budget", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(measurePayload([{ content: cyclic }]).chars).toBe(
      Number.POSITIVE_INFINITY,
    );
  });
});

describe("payloadTooLarge (the 413 the chat and summarize routes answer)", () => {
  it("rejects a single message hiding its bulk in non-string content", () => {
    // One message, so the count cap cannot catch it: only measuring the
    // serialised content does.
    const res = payloadTooLarge([
      { content: new Array(5000).fill("aaaaaaaa") },
    ]);
    expect(res?.status).toBe(413);
  });

  it("allows a payload exactly at the message cap", () => {
    expect(payloadTooLarge(turns(PAYLOAD_LIMITS.maxMessages, 1))).toBeNull();
  });

  it("allows a payload exactly at the character cap", () => {
    expect(
      payloadTooLarge([
        { content: "x".repeat(PAYLOAD_LIMITS.maxTotalChars) },
      ]),
    ).toBeNull();
  });

  it("answers 413 one message over the cap", async () => {
    const res = payloadTooLarge(turns(PAYLOAD_LIMITS.maxMessages + 1, 1));
    expect(res?.status).toBe(413);
    expect(res?.body).toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

  it("answers 413 one character over the cap", () => {
    expect(
      payloadTooLarge([
        { content: "x".repeat(PAYLOAD_LIMITS.maxTotalChars + 1) },
      ])?.status,
    ).toBe(413);
  });

  it("answers 413 when a huge learner note is what breaches the cap", () => {
    expect(
      payloadTooLarge(
        turns(1, 1),
        "y".repeat(PAYLOAD_LIMITS.maxTotalChars),
      )?.status,
    ).toBe(413);
  });

  it("allows an empty payload, leaving the 400 to the route's own validation", () => {
    expect(payloadTooLarge([])).toBeNull();
  });
});

describe("checkRateLimit", () => {
  const rule = { limit: 3, windowMs: 60_000 };

  it("allows up to the limit and counts down remaining", () => {
    const store: RateLimitStore = new Map();
    expect(checkRateLimit(store, "ip", rule, 0).remaining).toBe(2);
    expect(checkRateLimit(store, "ip", rule, 10).remaining).toBe(1);
    const third = checkRateLimit(store, "ip", rule, 20);
    expect(third).toMatchObject({ allowed: true, remaining: 0 });
  });

  it("blocks the request after the limit with a Retry-After to the window edge", () => {
    const store: RateLimitStore = new Map();
    for (let i = 0; i < rule.limit; i += 1) checkRateLimit(store, "ip", rule, 0);
    expect(checkRateLimit(store, "ip", rule, 30_000)).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 30,
    });
  });

  it("never reports a Retry-After below 1 second", () => {
    const store: RateLimitStore = new Map();
    for (let i = 0; i < rule.limit; i += 1) checkRateLimit(store, "ip", rule, 0);
    expect(
      checkRateLimit(store, "ip", rule, rule.windowMs - 1).retryAfterSeconds,
    ).toBe(1);
  });

  it("rolls the window over once it expires", () => {
    const store: RateLimitStore = new Map();
    for (let i = 0; i < rule.limit; i += 1) checkRateLimit(store, "ip", rule, 0);
    expect(checkRateLimit(store, "ip", rule, 59_999).allowed).toBe(false);
    expect(checkRateLimit(store, "ip", rule, 60_000)).toMatchObject({
      allowed: true,
      remaining: 2,
    });
  });

  it("keeps a separate window per client", () => {
    const store: RateLimitStore = new Map();
    for (let i = 0; i < rule.limit; i += 1) checkRateLimit(store, "a", rule, 0);
    expect(checkRateLimit(store, "a", rule, 0).allowed).toBe(false);
    expect(checkRateLimit(store, "b", rule, 0).allowed).toBe(true);
  });

  it("evicts expired entries so the map cannot grow without bound", () => {
    const store: RateLimitStore = new Map();
    for (let i = 0; i < 50; i += 1) checkRateLimit(store, `ip-${i}`, rule, 0);
    expect(store.size).toBe(50);
    checkRateLimit(store, "later", rule, 60_000);
    expect(store.size).toBe(1);
  });

  it("sweeps at most once a second, yet never counts a window that has ended", () => {
    const short = { limit: 1, windowMs: 100 };
    const store: RateLimitStore = new Map();
    expect(checkRateLimit(store, "x", short, 0).allowed).toBe(true);
    checkRateLimit(store, "old", short, 0);
    expect(checkRateLimit(store, "x", short, 50).allowed).toBe(false);
    // 200 ms on: no sweep yet, so the ended window is still in the map...
    expect(checkRateLimit(store, "x", short, 200).allowed).toBe(true);
    expect(store.has("old")).toBe(true);
    // ...until a second has passed since the last sweep.
    checkRateLimit(store, "y", short, 1_000);
    expect(store.has("old")).toBe(false);
  });

  it("stays under the tracked-client cap when a caller rotates its IP", () => {
    const store: RateLimitStore = new Map();
    // Pre-fill to the cap with entries that are still inside their window, so
    // the sweep cannot reclaim them and the hard cap is what has to hold.
    for (let i = 0; i < MAX_TRACKED_CLIENTS; i += 1) {
      store.set(`spoof-${i}`, { count: 1, resetAt: 60_000 + i });
    }
    checkRateLimit(store, "fresh", rule, 0);
    expect(store.size).toBe(MAX_TRACKED_CLIENTS);
    expect(store.has("fresh")).toBe(true);
    expect(store.has("spoof-0")).toBe(false);
  });
});

describe("clientIp", () => {
  const proxied = { VERCEL: "1" };

  it("takes the first x-forwarded-for entry behind a trusted proxy", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }), proxied)).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-forwarded-for": "  203.0.113.7  " }), { TRUST_PROXY: "1" })).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip behind a trusted proxy", () => {
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.8" }), proxied)).toBe("203.0.113.8");
    expect(clientIp(new Headers({ "x-forwarded-for": " , ", "x-real-ip": "203.0.113.9" }), proxied)).toBe("203.0.113.9");
  });

  it("ignores the forwarded headers when nothing says a proxy set them, so rotating them changes nothing", () => {
    for (let i = 0; i < 5; i += 1) {
      expect(clientIp(new Headers({ "x-forwarded-for": `10.9.0.${i}`, "x-real-ip": `10.8.0.${i}` }), {})).toBe("direct");
    }
    expect(clientIp(new Headers(), {})).toBe("direct");
  });
});

describe("enforceRateLimit", () => {
  it("allows the first calls and then answers 429 with Retry-After", async () => {
    for (let i = 0; i < SUMMARIZE_RATE_LIMIT.limit; i += 1) {
      expect(enforceRateLimit("owner-a", "test-summarize", SUMMARIZE_RATE_LIMIT, 0)).toBeNull();
    }
    const res = enforceRateLimit("owner-a", "test-summarize", SUMMARIZE_RATE_LIMIT, 15_000);
    expect(res?.status).toBe(429);
    expect(res?.headers.get("Retry-After")).toBe("45");
    await expect(res?.json()).resolves.toMatchObject({
      code: "RATE_LIMITED",
      retryAfterSeconds: 45,
    });
  });

  it("keeps the chat and summarize buckets independent", () => {
    for (let i = 0; i < SUMMARIZE_RATE_LIMIT.limit; i += 1) {
      enforceRateLimit("owner-b", "split-summarize", SUMMARIZE_RATE_LIMIT, 0);
    }
    expect(enforceRateLimit("owner-b", "split-summarize", SUMMARIZE_RATE_LIMIT, 0)?.status).toBe(429);
    expect(enforceRateLimit("owner-b", "split-chat", CHAT_RATE_LIMIT, 0)).toBeNull();
  });

  it("gives each owner their own window", () => {
    for (let i = 0; i < SUMMARIZE_RATE_LIMIT.limit; i += 1) {
      enforceRateLimit("owner-c", "per-owner", SUMMARIZE_RATE_LIMIT, 0);
    }
    expect(enforceRateLimit("owner-c", "per-owner", SUMMARIZE_RATE_LIMIT, 0)?.status).toBe(429);
    expect(enforceRateLimit("owner-d", "per-owner", SUMMARIZE_RATE_LIMIT, 0)).toBeNull();
  });
});

describe("readAgentBody", () => {
  /** A body streamed in chunks with no Content-Length, as a chunked upload is. */
  const streamed = (chunks: string[]) => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const next = chunks[pulled];
        pulled += 1;
        if (next === undefined) controller.close();
        else controller.enqueue(new TextEncoder().encode(next));
      },
    });
    const req = new Request("http://study.test/api/agent/judge", { method: "POST", body, duplex: "half" } as RequestInit);
    return { req, pulled: () => pulled };
  };

  it("answers the parsed body", async () => {
    const req = new Request("http://study.test/x", { method: "POST", body: JSON.stringify({ a: 1 }) });
    expect(await readAgentBody(req, 100)).toEqual({ body: { a: 1 } });
  });

  it("refuses a declared length past the limit with a 413, before reading", async () => {
    const req = new Request("http://study.test/x", {
      method: "POST",
      headers: { "content-length": "5000" },
      body: "x".repeat(5000),
    });
    const answer = await readAgentBody(req, 4096);
    expect(answer).toBeInstanceOf(Response);
    const response = answer as Response;
    expect(response.status).toBe(413);
    expect((await response.json()).code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("stops reading a stream with no length as soon as it passes the limit", async () => {
    const { req, pulled } = streamed(Array.from({ length: 100 }, () => "x".repeat(1024)));
    const answer = (await readAgentBody(req, 4096)) as Response;
    expect(answer.status).toBe(413);
    expect(pulled()).toBeLessThan(10);
  });

  it("refuses a body that is not JSON with a 400 that does not echo it", async () => {
    const req = new Request("http://study.test/x", { method: "POST", body: "secret-not-json" });
    const answer = (await readAgentBody(req, 100)) as Response;
    expect(answer.status).toBe(400);
    const text = await answer.text();
    expect(text).toContain("BAD_REQUEST");
    expect(text).not.toContain("secret-not-json");
  });
});
