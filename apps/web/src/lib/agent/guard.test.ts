import { describe, expect, it } from "vitest";
import {
  CHAT_RATE_LIMIT,
  checkRateLimit,
  clientIp,
  enforceRateLimit,
  enforceSameOrigin,
  isSameOrigin,
  MAX_TRACKED_CLIENTS,
  measurePayload,
  PAYLOAD_LIMITS,
  SUMMARIZE_RATE_LIMIT,
  type RateLimitStore,
} from "@/lib/agent/guard";
import { payloadTooLarge } from "@gnosia/tutor/server/turns";

const post = (headers: Record<string, string> = {}) =>
  new Request("http://study.test/api/agent/chat", { method: "POST", headers });

const turns = (count: number, chars = 1) =>
  Array.from({ length: count }, () => ({
    role: "user" as const,
    content: "x".repeat(chars),
  }));

describe("isSameOrigin", () => {
  it("passes when the Origin host matches the Host header", () => {
    expect(isSameOrigin("https://study.test", "study.test")).toBe(true);
  });

  it("passes on localhost with a port, which is how the dev server is reached", () => {
    expect(isSameOrigin("http://localhost:3131", "localhost:3131")).toBe(true);
  });

  it("ignores Host casing, since host names are case-insensitive", () => {
    expect(isSameOrigin("https://study.test", " STUDY.TEST ")).toBe(true);
  });

  it("fails on a different host", () => {
    expect(isSameOrigin("https://evil.test", "study.test")).toBe(false);
  });

  it("fails when only the port differs", () => {
    expect(isSameOrigin("http://localhost:3000", "localhost:3131")).toBe(false);
  });

  it("fails when Origin is missing, which is the plain curl case", () => {
    expect(isSameOrigin(null, "study.test")).toBe(false);
  });

  it("fails when Host is missing", () => {
    expect(isSameOrigin("https://study.test", null)).toBe(false);
  });

  it("fails on a malformed Origin instead of throwing", () => {
    expect(isSameOrigin("not a url", "study.test")).toBe(false);
    expect(isSameOrigin("", "study.test")).toBe(false);
  });

  it('fails on the literal "null" origin a sandboxed iframe sends', () => {
    expect(isSameOrigin("null", "study.test")).toBe(false);
  });

  it("fails on an origin with no host, such as a file or data URL", () => {
    expect(isSameOrigin("file:///tmp/page.html", "study.test")).toBe(false);
  });
});

describe("enforceSameOrigin", () => {
  it("lets a matching request through", () => {
    expect(
      enforceSameOrigin(
        post({ origin: "http://study.test", host: "study.test" }),
      ),
    ).toBeNull();
  });

  it("prefers x-forwarded-host, which survives a proxy that rewrote Host", () => {
    expect(
      enforceSameOrigin(
        post({
          origin: "https://study.test",
          host: "internal-1.local",
          "x-forwarded-host": "study.test",
        }),
      ),
    ).toBeNull();
  });

  it("answers 403 ORIGIN_MISMATCH with no Origin header", async () => {
    const res = enforceSameOrigin(post({ host: "study.test" }));
    expect(res?.status).toBe(403);
    await expect(res?.json()).resolves.toMatchObject({
      code: "ORIGIN_MISMATCH",
    });
  });

  it("answers 403 for a cross-site Origin", () => {
    expect(
      enforceSameOrigin(post({ origin: "https://evil.test", host: "study.test" }))
        ?.status,
    ).toBe(403);
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
  it("takes the first x-forwarded-for entry, which is the client", () => {
    expect(
      clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })),
    ).toBe("203.0.113.7");
  });

  it("trims whitespace around the entry", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "  203.0.113.7  " }))).toBe(
      "203.0.113.7",
    );
  });

  it("falls back to x-real-ip", () => {
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.8" }))).toBe(
      "203.0.113.8",
    );
  });

  it("falls back to x-real-ip when x-forwarded-for is empty", () => {
    expect(
      clientIp(
        new Headers({ "x-forwarded-for": " , ", "x-real-ip": "203.0.113.9" }),
      ),
    ).toBe("203.0.113.9");
  });

  it("shares one bucket when no proxy header is present, as on a local start", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("enforceRateLimit", () => {
  it("allows the first calls and then answers 429 with Retry-After", async () => {
    const headers = { "x-forwarded-for": "198.51.100.4" };
    for (let i = 0; i < SUMMARIZE_RATE_LIMIT.limit; i += 1) {
      expect(
        enforceRateLimit(post(headers), "test-summarize", SUMMARIZE_RATE_LIMIT, 0),
      ).toBeNull();
    }
    const res = enforceRateLimit(
      post(headers),
      "test-summarize",
      SUMMARIZE_RATE_LIMIT,
      15_000,
    );
    expect(res?.status).toBe(429);
    expect(res?.headers.get("Retry-After")).toBe("45");
    await expect(res?.json()).resolves.toMatchObject({
      code: "RATE_LIMITED",
      retryAfterSeconds: 45,
    });
  });

  it("keeps the chat and summarize buckets independent", () => {
    const headers = { "x-forwarded-for": "198.51.100.5" };
    for (let i = 0; i < SUMMARIZE_RATE_LIMIT.limit; i += 1) {
      enforceRateLimit(post(headers), "split-summarize", SUMMARIZE_RATE_LIMIT, 0);
    }
    expect(
      enforceRateLimit(post(headers), "split-summarize", SUMMARIZE_RATE_LIMIT, 0)
        ?.status,
    ).toBe(429);
    expect(
      enforceRateLimit(post(headers), "split-chat", CHAT_RATE_LIMIT, 0),
    ).toBeNull();
  });
});
