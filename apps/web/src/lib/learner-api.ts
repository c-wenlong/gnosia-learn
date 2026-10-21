import { NextResponse } from "next/server";
import type { CatalogDatabase } from "@gnosia/catalog/state";

import { enforceRateLimit, enforceSameOrigin, type RateLimitRule } from "@/lib/agent/guard";
import { isBadRequest, withLearnerStore } from "@/lib/learner-store";
import { currentOwner, NoOwnerError } from "@/lib/owner";

/**
 * The shared shape of every `/api/learner/*` handler.
 *
 * These routes exist because learner state left the browser. They are not the
 * agent routes and they are not guarded for the same reason: the agent routes
 * spend provider quota, while these spend a row in a database the learner
 * owns. What they share is that the app has no accounts, so the only thing
 * either can check is that the request came from a page on this host.
 *
 * Three bounds, in order:
 *
 *   1. **Same origin.** `enforceSameOrigin` from `agent/guard.ts`, unchanged.
 *      Honest about what it buys: a `curl` with a forged `Origin` header walks
 *      through it. It stops a cross-site page from ticking someone's
 *      checkboxes, and nothing more.
 *   2. **A rate limit.** Generous — a fast typist writing a note fires one
 *      request per keystroke pause — and there to bound a loop, not a user.
 *   3. **Validation and clamping, server-side.** The browser clamps a recap
 *      too, but the browser is not the authority; the same constants and the
 *      same CHECK constraints apply on this side regardless of what arrived.
 *
 * The failure modes are kept distinct on purpose. A bad payload is a 400 and
 * the caller's fault. An unreachable database is a 503 with a code the UI
 * turns into "not saved: database unreachable", because an optimistic tick
 * that silently never persisted is worse than an error.
 *
 * **Whose row.** Every write is the signed-in owner's (`currentOwner()`,
 * phase 4 of docs/CONTENT-MIGRATION.md), resolved once per request before the
 * body is read and handed to the write, which passes it to the catalog as
 * `learnerId`. A request with no owner is a 401, the proxy's own answer, and
 * never reaches the database.
 */

/**
 * 60 writes a minute per IP. A note field posts on blur rather than per
 * keystroke, and a checklist is a handful of clicks, so this is well past
 * anything the UI produces and well short of a loop.
 */
export const LEARNER_RATE_LIMIT: RateLimitRule = { limit: 60, windowMs: 60_000 };

/** Bodies are small: a recap is the biggest and `KNOWLEDGE_LIMITS` bounds it. */
export const MAX_BODY_BYTES = 64_000;

/** The longest scratch note the checklist will store. */
export const MAX_NOTE_CHARS = 20_000;

/** Curriculum item ids are authored (`cs4263-m1-t1`), so they are short. */
export const MAX_ID_CHARS = 128;

export class BadRequest extends Error {}

/** The proxy's answer to a request with no session, for one that got past it. */
export function unauthenticated(): NextResponse {
  return NextResponse.json({ error: "UNAUTHENTICATED", signIn: "/sign-in" }, { status: 401 });
}

/** The signed-in owner, or the 401 to answer with when the request has none. */
export async function requestOwner(): Promise<string | NextResponse> {
  try {
    return await currentOwner();
  } catch (error) {
    if (error instanceof NoOwnerError) return unauthenticated();
    throw error;
  }
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ ok: false, error: message, code: "BAD_REQUEST" }, { status: 400 });
}

/**
 * The message is logged, not returned. It is the driver's, and the driver's
 * message is the failed SQL with its bind parameters — useful in a server log
 * and no use at all to a learner looking at a banner.
 */
export function unavailable(message: string): NextResponse {
  console.warn(`learner write failed: ${message}`);
  return NextResponse.json(
    { ok: false, error: "Not saved: the database is unreachable.", code: "STORE_UNAVAILABLE" },
    { status: 503 },
  );
}

async function readBody(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new BadRequest(`Body too large (${declared} bytes; limit ${MAX_BODY_BYTES}).`);
  }
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new BadRequest(`Body too large (${text.length} bytes; limit ${MAX_BODY_BYTES}).`);
  }
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new BadRequest("Body is not valid JSON.");
  }
}

/**
 * Wrap a handler with the guards, the body parse and the error mapping. Every
 * route under `/api/learner/` is one call to this and one function.
 */
export function handler<T>(
  bucket: string,
  parse: (body: Record<string, unknown>) => T,
  write: (db: CatalogDatabase, input: T, owner: string) => Promise<unknown>,
): (req: Request) => Promise<NextResponse> {
  return async (req: Request) => {
    const origin = enforceSameOrigin(req);
    if (origin !== null) return origin;
    const limited = enforceRateLimit(req, `learner:${bucket}`, LEARNER_RATE_LIMIT);
    if (limited !== null) return limited;

    const owner = await requestOwner();
    if (owner instanceof NextResponse) return owner;

    let input: T;
    try {
      const body = await readBody(req);
      if (body === null || typeof body !== "object" || Array.isArray(body)) {
        return badRequest("Body must be a JSON object.");
      }
      input = parse(body as Record<string, unknown>);
    } catch (error) {
      if (error instanceof BadRequest) return badRequest(error.message);
      throw error;
    }

    try {
      const result = await withLearnerStore((db) => write(db, input, owner));
      return NextResponse.json({ ok: true, result });
    } catch (error) {
      // A StateError is the payload naming something the catalog does not
      // have — a curriculum item id from a stale page, most likely. That is a
      // 400, not a 503, and the two must not be confused: the UI retries one
      // and gives up on the other.
      if (isBadRequest(error)) return badRequest((error as Error).message);
      return unavailable(error instanceof Error ? error.message : String(error));
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Field readers                                                              */
/* -------------------------------------------------------------------------- */

export function requireId(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequest(`"${field}" is required and must be a non-empty string.`);
  }
  if (value.length > MAX_ID_CHARS) {
    throw new BadRequest(`"${field}" is longer than ${MAX_ID_CHARS} characters.`);
  }
  return value;
}

export function requireBoolean(body: Record<string, unknown>, field: string): boolean {
  const value = body[field];
  if (typeof value !== "boolean") {
    throw new BadRequest(`"${field}" is required and must be a boolean.`);
  }
  return value;
}

export function optionalBoolean(
  body: Record<string, unknown>,
  field: string,
  fallback: boolean,
): boolean {
  const value = body[field];
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new BadRequest(`"${field}" must be a boolean.`);
  return value;
}

export function requireString(
  body: Record<string, unknown>,
  field: string,
  max: number,
): string {
  const value = body[field];
  if (typeof value !== "string") {
    throw new BadRequest(`"${field}" is required and must be a string.`);
  }
  if (value.length > max) {
    throw new BadRequest(`"${field}" is longer than ${max} characters.`);
  }
  return value;
}

export function requireIdList(body: Record<string, unknown>, field: string): string[] {
  const value = body[field];
  if (!Array.isArray(value)) throw new BadRequest(`"${field}" must be an array.`);
  if (value.length > 1000) throw new BadRequest(`"${field}" has more than 1000 entries.`);
  return value.map((entry, i) => {
    if (typeof entry !== "string" || entry.trim() === "" || entry.length > MAX_ID_CHARS) {
      throw new BadRequest(`"${field}[${i}]" must be a non-empty id.`);
    }
    return entry;
  });
}
