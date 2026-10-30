/**
 * Abuse prevention for the `/api/agent/*` routes.
 *
 * These routes spend the owner's provider quota (NVIDIA, Gemini, OpenRouter)
 * on behalf of whoever calls them, and the app has no user accounts: learner
 * state is localStorage only and the caller is a `"use client"` component
 * doing a same-origin `fetch`. Anything the browser would have to send is
 * visible in the JS bundle, so there is no token to check. What is left is
 * three cheap bounds that make casual abuse unrewarding:
 *
 *   1. the request has to look like it came from a page on this same host,
 *   2. the payload has to be small enough that one call cannot amplify cost,
 *   3. one owner only gets so many calls a minute.
 *
 * Each one is deliberately modest. Read the honest limits on each check below.
 */

/* -------------------------------------------------------------------------- */
/* 1. Same-origin                                                             */
/* -------------------------------------------------------------------------- */

/*
 * The same-origin rule is not here. It is `requestIsSameOrigin` in the web
 * app's `apps/web/src/lib/auth/core.ts`, the one rule every guarded route
 * uses; the native sidecar has no browser in front of it to ask.
 */


/* -------------------------------------------------------------------------- */
/* 2. Payload bounds                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Ceilings on what one request may forward to a paid provider.
 *
 * Sized to be unreachable by a real session rather than to be tight. A long
 * Socratic dialogue is tens of short turns: 40 messages is more than any
 * session the UI can produce by hand, and 24000 characters is roughly 6k
 * tokens, several times the longest transcript the summarise button has ever
 * sent. Anything past these is a caller trying to turn one HTTP request into
 * a large bill, so it is cheaper to refuse than to clamp silently.
 *
 * The character budget counts the learner note as well as the messages: the
 * note is interpolated into the system prompt by `buildAgentSessionContext`
 * with no clamp of its own, so leaving it out would leave the whole cap
 * bypassable by one enormous note. Recaps need no counting here, because
 * `sanitizeKnowledge` already clamps them through `KNOWLEDGE_LIMITS`.
 */
export const PAYLOAD_LIMITS = {
  maxMessages: 40,
  maxTotalChars: 24_000,
} as const;

/** The shape both routes share: chat's `ChatMessage` and summarize's `TranscriptTurn`. */
interface CountableMessage {
  content?: unknown;
}

/**
 * Message count and total characters a request would forward.
 *
 * Non-string `content` is measured by its serialised length rather than
 * skipped. The chat route forwards whatever it was given straight into
 * `JSON.stringify` (summarize filters to string content, chat does not), so
 * counting only strings would let one message carrying a large array or
 * object past a cap whose whole job is to bound the outbound request.
 */
export function measurePayload(
  messages: readonly CountableMessage[],
  extraText?: string,
): { count: number; chars: number } {
  let chars = typeof extraText === "string" ? extraText.length : 0;
  for (const message of messages) {
    const content = message?.content;
    if (typeof content === "string") {
      chars += content.length;
    } else if (content !== undefined && content !== null) {
      chars += serialisedLength(content);
    }
  }
  return { count: messages.length, chars };
}

/**
 * Length of a value once serialised, which is the form the provider request
 * actually carries. A value that cannot be serialised (a cycle, a BigInt)
 * counts as over budget: it would break the provider call anyway, and
 * refusing it here is cheaper than finding out downstream.
 */
function serialisedLength(content: unknown): number {
  try {
    return JSON.stringify(content)?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}


/* -------------------------------------------------------------------------- */
/* 3. Rate limit                                                              */
/* -------------------------------------------------------------------------- */

export interface RateLimitRule {
  /** Requests allowed inside one window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/**
 * Separate ceilings, because the two routes cost different amounts. Chat
 * sends one exchange; summarize sends the whole transcript, so a handful an
 * hour is already generous for one learner and 6 a minute is well past what
 * the button can produce by hand.
 */
export const CHAT_RATE_LIMIT: RateLimitRule = { limit: 20, windowMs: 60_000 };
export const SUMMARIZE_RATE_LIMIT: RateLimitRule = { limit: 6, windowMs: 60_000 };

/**
 * Ceiling on tracked keys, so the map cannot grow without bound. Expired
 * entries are swept at most once per `SWEEP_INTERVAL_MS`, so this only bites
 * under a flood of distinct keys; when it does, the entry closest to expiry is
 * dropped.
 */
export const MAX_TRACKED_CLIENTS = 10_000;

/**
 * How often a store is swept for expired windows. Sweeping on every call made
 * each request with a new key a walk over up to `MAX_TRACKED_CLIENTS` entries.
 */
export const SWEEP_INTERVAL_MS = 1_000;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export type RateLimitStore = Map<string, RateLimitEntry>;

/** When each store was last swept. A WeakMap, so a test's throwaway store leaves nothing behind. */
const lastSwept = new WeakMap<RateLimitStore, number>();

export interface RateLimitVerdict {
  allowed: boolean;
  /** Requests left in the current window, after this one. */
  remaining: number;
  /** Whole seconds until the window rolls over, at least 1. */
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter. `now` is a parameter and `store` is passed in, so the
 * whole thing is testable without sleeping or reaching into module state.
 *
 * `key` is whoever the window belongs to. The web app passes the signed-in
 * owner, never anything the client chose: keyed on `X-Forwarded-For`, a
 * caller sending a new value each time never hit a limit (S7-11 and S4-02 of
 * the 2026-10 audit).
 *
 * What this does NOT do: it is per-instance and per-region. With Fluid
 * Compute reusing an instance it catches a single client hammering one
 * endpoint, which is the common case, but a caller spread across regions or
 * firing concurrently into cold instances can exceed the number. It is a
 * floor that works the same locally, in preview and in production.
 */
export function checkRateLimit(
  store: RateLimitStore,
  key: string,
  rule: RateLimitRule,
  now: number,
): RateLimitVerdict {
  // Expired windows are dead weight, and sweeping them is what keeps the map
  // bounded by "distinct keys seen in one window". At most once a second; a
  // clock that went backwards sweeps at once.
  const swept = lastSwept.get(store);
  if (swept === undefined || now - swept >= SWEEP_INTERVAL_MS || now < swept) {
    for (const [existing, entry] of store) {
      if (entry.resetAt <= now) store.delete(existing);
    }
    lastSwept.set(store, now);
  }

  let entry = store.get(key);
  // Between sweeps an entry can outlive its window; it is a new window then.
  if (entry && entry.resetAt <= now) {
    store.delete(key);
    entry = undefined;
  }
  if (!entry) {
    if (store.size >= MAX_TRACKED_CLIENTS) {
      let soonest: string | undefined;
      let soonestResetAt = Number.POSITIVE_INFINITY;
      for (const [existing, candidate] of store) {
        if (candidate.resetAt < soonestResetAt) {
          soonestResetAt = candidate.resetAt;
          soonest = existing;
        }
      }
      if (soonest !== undefined) store.delete(soonest);
    }
    entry = { count: 0, resetAt: now + rule.windowMs };
    store.set(key, entry);
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  if (entry.count >= rule.limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: rule.limit - entry.count,
    retryAfterSeconds,
  };
}

/**
 * Whether a proxy in front of this server sets the forwarded headers itself.
 * Vercel does (it overwrites `X-Forwarded-For` and `X-Real-IP` with the
 * client's address), so `VERCEL=1` counts; anywhere else the deployment says
 * so with `TRUST_PROXY=1`. Without either, those headers are whatever the
 * client typed.
 */
export function trustsProxy(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL === "1" || env.TRUST_PROXY === "1" || env.TRUST_PROXY === "true";
}

/**
 * Who sent a request, for a limit that has no owner to key on (sign-in).
 *
 * Behind a trusted proxy (`trustsProxy`), the first `X-Forwarded-For` entry
 * (the client; the rest are proxies), else `X-Real-IP`. Anywhere else the
 * forwarded headers are the client's own words, and a limit keyed on them is
 * one a caller escapes by sending a new value each time, so every request is
 * `"direct"`: one shared bucket. A route handler cannot see the socket's
 * address, so that is the strict reading.
 */
export function clientIp(headers: Headers, env: Record<string, string | undefined> = process.env): string {
  if (!trustsProxy(env)) return "direct";
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** One store per route, keyed by the route's own name, held per instance. */
const stores = new Map<string, RateLimitStore>();

/** For tests: forget every window in every bucket. */
export function resetRateLimits(): void {
  stores.clear();
}

export function storeFor(bucket: string): RateLimitStore {
  let store = stores.get(bucket);
  if (!store) {
    store = new Map();
    stores.set(bucket, store);
  }
  return store;
}

