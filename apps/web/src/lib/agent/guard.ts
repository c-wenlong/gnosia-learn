import { NextResponse } from "next/server";

import {
  checkRateLimit,
  clientIp,
  isSameOrigin,
  measurePayload,
  PAYLOAD_LIMITS,
  resolveHost,
  storeFor,
  type RateLimitRule,
} from "@self-learn/tutor/guards";

export {
  CHAT_RATE_LIMIT,
  checkRateLimit,
  clientIp,
  isSameOrigin,
  MAX_TRACKED_CLIENTS,
  measurePayload,
  PAYLOAD_LIMITS,
  SUMMARIZE_RATE_LIMIT,
  type RateLimitRule,
  type RateLimitStore,
  type RateLimitVerdict,
} from "@self-learn/tutor/guards";

/**
 * Abuse prevention for the `/api/agent/*` routes. The checks themselves —
 * origin comparison, payload measurement and the fixed-window limiter — live
 * in `@self-learn/tutor/guards`, which the native sidecar calls directly;
 * this file keeps only the `NextResponse` wrappers around them.
 */

/** 403 when the request did not come from a page on this host. */
export function enforceSameOrigin(req: Request): NextResponse | null {
  if (isSameOrigin(req.headers.get("origin"), resolveHost(req.headers))) {
    return null;
  }
  return NextResponse.json(
    {
      error:
        "This endpoint only answers requests from the study hub itself. Open the topic page and use the session there.",
      code: "ORIGIN_MISMATCH",
    },
    { status: 403 },
  );
}

/** 413 when one request would forward more than `PAYLOAD_LIMITS` allows. */
export function enforcePayloadBounds(
  messages: readonly { content?: unknown }[],
  extraText?: string,
): NextResponse | null {
  const { count, chars } = measurePayload(messages, extraText);
  if (count <= PAYLOAD_LIMITS.maxMessages && chars <= PAYLOAD_LIMITS.maxTotalChars) {
    return null;
  }
  return NextResponse.json(
    {
      error: `Session too large to send (messages: ${count}, characters: ${chars}; limit: ${PAYLOAD_LIMITS.maxMessages} messages, ${PAYLOAD_LIMITS.maxTotalChars} characters). Save a recap and start a fresh session.`,
      code: "PAYLOAD_TOO_LARGE",
    },
    { status: 413 },
  );
}

/** 429 with a correct `Retry-After` when this IP has used up its window. */
export function enforceRateLimit(
  req: Request,
  bucket: string,
  rule: RateLimitRule,
  now: number = Date.now(),
): NextResponse | null {
  const verdict = checkRateLimit(storeFor(bucket), clientIp(req.headers), rule, now);
  if (verdict.allowed) return null;

  return NextResponse.json(
    {
      error: `Too many requests. Wait ${verdict.retryAfterSeconds}s and try again.`,
      code: "RATE_LIMITED",
      retryAfterSeconds: verdict.retryAfterSeconds,
    },
    {
      status: 429,
      headers: { "Retry-After": String(verdict.retryAfterSeconds) },
    },
  );
}
