import { NextResponse } from "next/server";

import {
  checkRateLimit,
  measurePayload,
  PAYLOAD_LIMITS,
  storeFor,
  type RateLimitRule,
} from "@gnosia/tutor/guards";

import { requestIsSameOrigin } from "@/lib/auth/core";

export {
  CHAT_RATE_LIMIT,
  checkRateLimit,
  clientIp,
  MAX_TRACKED_CLIENTS,
  measurePayload,
  PAYLOAD_LIMITS,
  resetRateLimits,
  SUMMARIZE_RATE_LIMIT,
  type RateLimitRule,
  type RateLimitStore,
  type RateLimitVerdict,
} from "@gnosia/tutor/guards";

/**
 * Abuse prevention for the `/api/agent/*` routes. Payload measurement and
 * the fixed-window limiter live in `@gnosia/tutor/guards`, which the native
 * sidecar calls directly; the same-origin rule is `requestIsSameOrigin` in
 * `@/lib/auth/core`. This file keeps only the `NextResponse` wrappers.
 */

/**
 * 403 when the request did not come from a page on this host. A request with
 * neither `Origin` nor `Sec-Fetch-Site: same-origin` is refused: every POST a
 * browser sends carries `Origin`.
 */
export function enforceSameOrigin(req: Request): NextResponse | null {
  if (requestIsSameOrigin(req)) return null;
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

/**
 * 429 with a correct `Retry-After` when this owner has used up the bucket's
 * window. Keyed by the signed-in owner, which the route resolves first (a
 * request with none is a 401 before it reaches a limiter), and never by a
 * header the client sends: a limit keyed on `X-Forwarded-For` was one a
 * caller escaped by sending a new value each time.
 */
export function enforceRateLimit(
  owner: string,
  bucket: string,
  rule: RateLimitRule,
  now: number = Date.now(),
): NextResponse | null {
  const verdict = checkRateLimit(storeFor(bucket), `owner:${owner}`, rule, now);
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
