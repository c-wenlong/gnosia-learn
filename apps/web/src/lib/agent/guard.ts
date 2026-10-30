import { NextResponse } from "next/server";

import {
  checkRateLimit,
  storeFor,
  type RateLimitRule,
} from "@gnosia/tutor/guards";

import { requestIsSameOrigin } from "@/lib/auth/core";
import { BodyTooLarge, readBodyText } from "@/lib/learner-api";

export { CHAT_RATE_LIMIT, SUMMARIZE_RATE_LIMIT, type RateLimitRule } from "@gnosia/tutor/guards";

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

/**
 * The most bytes each agent route reads of a body. Each is well past the
 * largest body its page sends: check-options is two ids; a session question
 * adds at most four earlier prompts of 400 characters; a judge body is a
 * 400-character question, a 4,000-character answer and a commitment; chat and
 * summarize forward at most `PAYLOAD_LIMITS.maxTotalChars` (24,000) of
 * transcript, plus a note or prior knowledge, and UTF-8 can take up to four
 * bytes a character. Without a cap `req.json()` buffered whatever was sent,
 * and the three routes that validate before the limiter parsed it for free.
 */
export const AGENT_BODY_LIMITS = {
  checkOptions: 4_096,
  session: 16_384,
  judge: 64_000,
  chat: 256_000,
  summarize: 256_000,
} as const;

/**
 * The request body parsed as JSON, read no further than `maxBytes`, or the
 * response to answer with: 413 `PAYLOAD_TOO_LARGE` past the limit (before
 * anything is buffered when `Content-Length` says so), 400 `BAD_REQUEST` for
 * a body that is not JSON. Nothing is echoed back.
 */
export async function readAgentBody(req: Request, maxBytes: number): Promise<{ body: unknown } | NextResponse> {
  let text: string;
  try {
    text = await readBodyText(req, maxBytes);
  } catch (error) {
    if (error instanceof BodyTooLarge) {
      return NextResponse.json(
        { error: `The request body is too large (at most ${maxBytes} bytes).`, code: "PAYLOAD_TOO_LARGE" },
        { status: 413 },
      );
    }
    return NextResponse.json({ error: "Invalid JSON body", code: "BAD_REQUEST" }, { status: 400 });
  }
  try {
    return { body: JSON.parse(text) as unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", code: "BAD_REQUEST" }, { status: 400 });
  }
}
