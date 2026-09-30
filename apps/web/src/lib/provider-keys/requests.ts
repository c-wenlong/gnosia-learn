import "server-only";

import { NextResponse } from "next/server";
import { isProviderId, PROVIDER_IDS, type ProviderId } from "@self-learn/schema/shared";

import { enforceRateLimit, enforceSameOrigin, type RateLimitRule } from "@/lib/agent/guard";
import { requestOwner } from "@/lib/learner-api";

/**
 * The guards in front of `/api/learner/provider-key` and its `test`, the same
 * three every Settings write has (`handler` in `@/lib/learner-api`): same
 * origin, a rate limit, and the signed-in owner. Not `handler` itself,
 * because its failure path logs the driver's message, and for these routes
 * that message would carry the sealed key (docs/BYOK.md).
 */

/** A save and a remove: a person clicking, so a loop is the only thing this bounds. */
export const KEY_WRITE_RATE_LIMIT: RateLimitRule = { limit: 20, windowMs: 60_000 };

/** A Test spends a provider request, so fewer. */
export const KEY_TEST_RATE_LIMIT: RateLimitRule = { limit: 10, windowMs: 60_000 };

/** The largest body any of these routes reads: a provider id and a key of at most 512 characters, or a model id of at most 200. */
const MAX_BODY_BYTES = 4_096;

/** Every answer from these routes: nothing here may be cached anywhere. */
export function answer(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function refuse(error: string, code = "BAD_REQUEST", status = 400): NextResponse {
  return answer({ ok: false, error, code }, status);
}

/**
 * Origin, rate limit, owner. The owner, or the response to send instead.
 * `scope` names the family of routes the bucket belongs to; the model chain's
 * routes (docs/TUTOR-MODELS.md) pass their own, so they count apart from these.
 */
export async function guard(
  req: Request,
  bucket: string,
  rule: RateLimitRule,
  scope: "provider-key" | "tutor-model" = "provider-key",
): Promise<string | NextResponse> {
  const origin = enforceSameOrigin(req);
  if (origin !== null) return origin;
  const limited = enforceRateLimit(req, `${scope}:${bucket}`, rule);
  if (limited !== null) return limited;
  return requestOwner();
}

/** The body as an object, or the 400 to answer with. Never echoes what was sent. */
export async function readBody(req: Request): Promise<Record<string, unknown> | NextResponse> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return refuse("The request is too large.");
  let text: string;
  try {
    text = await req.text();
  } catch {
    return refuse("The request body could not be read.");
  }
  if (text.length > MAX_BODY_BYTES) return refuse("The request is too large.");
  try {
    const body: unknown = JSON.parse(text);
    if (body === null || typeof body !== "object" || Array.isArray(body)) return refuse("The body must be a JSON object.");
    return body as Record<string, unknown>;
  } catch {
    return refuse("The body is not valid JSON.");
  }
}

/** `body.provider` as a provider id, or the 400 to answer with. */
export function readProvider(body: Record<string, unknown>): ProviderId | NextResponse {
  return isProviderId(body.provider) ? body.provider : refuse(`"provider" must be one of ${PROVIDER_IDS.join(", ")}.`);
}
