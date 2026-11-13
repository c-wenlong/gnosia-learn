import "server-only";

import { NextResponse } from "next/server";
import { isProviderName, PROVIDER_IDS, type ProviderName } from "@hermes/schema/shared";
import type { TutorDeps } from "@hermes/tutor/server/deps";
import type { TurnReply } from "@hermes/tutor/server/turns";

import { enforceRateLimit, enforceSameOrigin, type RateLimitRule } from "@/lib/agent/guard";
import { BodyTooLarge, learnerDeps, readBodyText, requestOwner } from "@/lib/learner-api";

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

function refuse(error: string, code = "BAD_REQUEST", status = 400): NextResponse {
  return answer({ ok: false, error, code }, status);
}

/**
 * Origin, owner, then the owner's rate limit. The owner, or the response to send instead.
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
  const owner = await requestOwner();
  if (owner instanceof NextResponse) return owner;
  return enforceRateLimit(owner, `${scope}:${bucket}`, rule) ?? owner;
}

/** The body as an object, or the 400 to answer with. Never echoes what was sent. */
export async function readBody(req: Request): Promise<Record<string, unknown> | NextResponse> {
  let text: string;
  try {
    text = await readBodyText(req, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLarge) return refuse("The request is too large.");
    return refuse("The request body could not be read.");
  }
  try {
    const body: unknown = JSON.parse(text);
    if (body === null || typeof body !== "object" || Array.isArray(body)) return refuse("The body must be a JSON object.");
    return body as Record<string, unknown>;
  } catch {
    return refuse("The body is not valid JSON.");
  }
}

/** `body.provider` as a provider id, or the 400 to answer with. */
export function readProvider(body: Record<string, unknown>): ProviderName | NextResponse {
  return isProviderName(body.provider)
    ? body.provider
    : refuse(`"provider" must be one of ${PROVIDER_IDS.join(", ")}, or one of your own providers' ids (custom-…).`);
}

/**
 * A Settings write answered by its turn in `@hermes/tutor/server/turns`,
 * behind this file's guards: same origin,
 * the owner, the owner's rate limit under `scope`, then the body, read
 * within the 4 KB this file allows. So a fix to a write's rules lands once,
 * in the turn.
 *
 * `after` is a step only the web app has, run on a 200 with the body the
 * turn took and its answer; what it returns joins the answer (the studio's
 * provider list, D95, as `byok`). The turn sees the request's URL, so a
 * custom provider pointed at this app's own port is refused by that port.
 * The deps are the learner writes' lazy ones: the database and the blob
 * store open only when the turn reads them, so a refused body touches
 * neither, and these writes never need the blob store at all.
 */
export function settingsRoute(
  scope: "provider-key" | "tutor-model",
  rule: RateLimitRule,
  turn: (deps: TutorDeps, body: unknown) => Promise<TurnReply>,
  after?: (body: Record<string, unknown>, answered: Record<string, unknown>) => Promise<Record<string, unknown>>,
): (req: Request) => Promise<NextResponse> {
  return async (req: Request) => {
    const owner = await guard(req, "write", rule, scope);
    if (owner instanceof NextResponse) return owner;
    const body = await readBody(req);
    if (body instanceof NextResponse) return body;
    const { status, body: answered } = await turn(learnerDeps(owner, req.url), body);
    const record = answered as Record<string, unknown>;
    const extra = status === 200 && after !== undefined ? await after(body, record) : {};
    return answer({ ...record, ...extra }, status);
  };
}

/** What `after` adds for the studio's provider list: `byok` when the runner was asked, nothing when it was not. */
export function byokField(byok: boolean | undefined): Record<string, unknown> {
  return byok === undefined ? {} : { byok };
}
