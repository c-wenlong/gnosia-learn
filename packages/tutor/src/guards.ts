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
 *   3. one IP only gets so many calls a minute.
 *
 * Each one is deliberately modest. Read the honest limits on each check below.
 */

/* -------------------------------------------------------------------------- */
/* 1. Same-origin                                                             */
/* -------------------------------------------------------------------------- */

/**
 * True when `origin` names the same host the request was addressed to.
 *
 * Comparing the request's own two headers, rather than a hardcoded domain
 * list, is what makes this work on production, on every preview URL and on
 * localhost with no configuration. It is the same comparison Next.js itself
 * runs for Server Actions (Origin against Host or X-Forwarded-Host).
 *
 * Honest about what it buys: `curl -H "Origin: https://our-host"` walks
 * straight through it, so this stops drive-by scripts and any cross-site page
 * trying to spend our quota, and nothing more. A determined caller is bounded
 * by the rate limit below and, properly, by a Vercel WAF rule.
 *
 * A missing Origin fails. Browsers attach Origin to every POST, same-origin
 * included (Fetch, "append a request `Origin` header": the header is set
 * whenever the method is neither GET nor HEAD, not only on CORS requests), so
 * no legitimate call from the app can arrive without it. A plain `curl` with
 * no headers is the case this rejects.
 */
export function isSameOrigin(
  origin: string | null,
  host: string | null,
): boolean {
  if (!origin || !host) return false;

  let originHost: string;
  try {
    // Also rejects the literal "null" origin a sandboxed iframe sends.
    originHost = new URL(origin).host;
  } catch {
    // A malformed Origin is a failed check, not a thrown request.
    return false;
  }
  if (!originHost) return false;

  // Host names are case-insensitive; `URL` already lowercases its side.
  return originHost === host.trim().toLowerCase();
}

/**
 * The host the client believes it connected to. Vercel rewrites
 * `x-forwarded-host` itself, and it is the header that survives a proxy that
 * rewrote `Host` to an internal name, so it wins when present.
 */
export function resolveHost(headers: Headers): string | null {
  return headers.get("x-forwarded-host") ?? headers.get("host");
}


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
/* 3. Per-IP rate limit                                                       */
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
 * Ceiling on tracked clients, so a caller rotating `x-forwarded-for` values
 * cannot grow the map without bound. Expired entries are swept on every call,
 * so this only bites under a spoofing flood; when it does, the entry closest
 * to expiry is dropped.
 */
export const MAX_TRACKED_CLIENTS = 10_000;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export type RateLimitStore = Map<string, RateLimitEntry>;

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
 * What this does NOT do: it is per-instance and per-region. With Fluid
 * Compute reusing an instance it catches a single client hammering one
 * endpoint, which is the common case, but a caller spread across regions or
 * firing concurrently into cold instances can exceed the number. It is a
 * floor that works the same locally, in preview and in production. The real
 * per-IP bound is a Vercel WAF rate-limit rule, staged separately.
 */
export function checkRateLimit(
  store: RateLimitStore,
  key: string,
  rule: RateLimitRule,
  now: number,
): RateLimitVerdict {
  // Sweep first: expired windows are dead weight, and the sweep is what keeps
  // the map bounded by "distinct clients seen in one window".
  for (const [existing, entry] of store) {
    if (entry.resetAt <= now) store.delete(existing);
  }

  let entry = store.get(key);
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
 * The caller's IP as the platform reports it: first entry of
 * `x-forwarded-for` (the client, the rest of the list is proxies), falling
 * back to `x-real-ip`.
 *
 * Both headers are absent when nothing sits in front of the server, which is
 * the case for a local `next start`. Everything then shares the `"unknown"`
 * bucket, which is the strict reading and keeps the limiter exercisable
 * locally. On Vercel the platform sets these headers and overwrites whatever
 * the client sent.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** One store per route, keyed by the route's own name, held per instance. */
const stores = new Map<string, RateLimitStore>();

export function storeFor(bucket: string): RateLimitStore {
  let store = stores.get(bucket);
  if (!store) {
    store = new Map();
    stores.set(bucket, store);
  }
  return store;
}

