import { NextResponse } from "next/server";
import type { CatalogDatabase } from "@gnosia/catalog/state";
import { ownerScope } from "@gnosia/schema/shared";
import type { TutorDeps } from "@gnosia/tutor/server/deps";
import { BadRequest, MAX_ID_CHARS, MAX_NOTE_CHARS } from "@gnosia/tutor/server/learner-writes";
import { failureCode } from "@gnosia/tutor/server/provider-keys";
import type { TurnReply } from "@gnosia/tutor/server/turns";

import { contentSource } from "@/data/source";
import { enforceRateLimit, enforceSameOrigin, type RateLimitRule } from "@/lib/agent/guard";
import { assetBlobStore } from "@/lib/blob-store";
import { catalogDatabase, isBadRequest, withLearnerStore } from "@/lib/learner-store";
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
 *   2. **The owner, then a rate limit keyed by them.** Generous — a fast typist writing a note fires one
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
 * 60 writes a minute per owner. A note field posts on blur rather than per
 * keystroke, and a checklist is a handful of clicks, so this is well past
 * anything the UI produces and well short of a loop.
 */
export const LEARNER_RATE_LIMIT: RateLimitRule = { limit: 60, windowMs: 60_000 };

/** Bodies are small: a recap is the biggest and `KNOWLEDGE_LIMITS` bounds it. */
export const MAX_BODY_BYTES = 64_000;

/**
 * The longest scratch note, and the longest curriculum item id (authored,
 * `cs4263-m1-t1`, so short). One copy, in the learner writes the sidecar
 * shares.
 */
export { MAX_ID_CHARS, MAX_NOTE_CHARS };

/** A payload's fault: a 400. The learner writes' own class, so a shared validator's refusal is caught here too. */
export { BadRequest };

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

/**
 * The 401 for a request with no session, or null when it has one. For a route
 * whose reader resolves the owner itself: deciding it here first means a
 * request that got past the proxy is a 401, not the reader's `NoOwnerError`
 * surfacing as a 500 or as "the catalog is unreachable".
 */
export async function refuseWithoutOwner(): Promise<NextResponse | null> {
  const owner = await requestOwner();
  return owner instanceof NextResponse ? owner : null;
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ ok: false, error: message, code: "BAD_REQUEST" }, { status: 400 });
}

/**
 * A write the database did not take: logged by its code only (`failureCode`,
 * the driver's code down drizzle's `cause` chain), never by message. A
 * drizzle message is the failed SQL with its bind parameters, which here are
 * the learner's notes, recaps and answers.
 */
export function unavailable(error: unknown): NextResponse {
  console.warn(`learner write failed (${failureCode(error)})`);
  return NextResponse.json(
    { ok: false, error: "Not saved: the database is unreachable.", code: "STORE_UNAVAILABLE" },
    { status: 503 },
  );
}

/** A body past the reader's byte limit. */
export class BodyTooLarge extends Error {
  constructor(readonly limit: number) {
    super(`Body too large (limit ${limit} bytes).`);
    this.name = "BodyTooLarge";
  }
}

/**
 * The request body as text, read no further than `maxBytes` UTF-8 bytes.
 *
 * A declared `Content-Length` past the limit is refused before anything is
 * read. A chunked body declares none, so the stream itself is counted and
 * cancelled as soon as it passes the limit, rather than buffered whole and
 * measured after (S7-15 of the 2026-10 audit). The limit is bytes, not
 * UTF-16 units: 64,000 characters of CJK is three times the bytes.
 *
 * Throws `BodyTooLarge`; a body that cannot be read throws whatever the
 * stream threw.
 */
export async function readBodyText(req: Request, maxBytes: number): Promise<string> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLarge(maxBytes);
  if (req.body === null) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLarge(maxBytes);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function readBody(req: Request, maxBytes: number): Promise<unknown> {
  let text: string;
  try {
    text = await readBodyText(req, maxBytes);
  } catch (error) {
    if (error instanceof BodyTooLarge) throw new BadRequest(`Body too large (limit ${maxBytes} bytes).`);
    throw error;
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
 * `maxBodyBytes` defaults to `MAX_BODY_BYTES`; the legacy import is the one
 * route whose body is a whole study record.
 */
export function handler<T>(
  bucket: string,
  parse: (body: Record<string, unknown>) => T,
  write: (db: CatalogDatabase, input: T, owner: string) => Promise<unknown>,
  { maxBodyBytes = MAX_BODY_BYTES }: { maxBodyBytes?: number } = {},
): (req: Request) => Promise<NextResponse> {
  return async (req: Request) => {
    const origin = enforceSameOrigin(req);
    if (origin !== null) return origin;
    const owner = await requestOwner();
    if (owner instanceof NextResponse) return owner;
    const limited = enforceRateLimit(owner, `learner:${bucket}`, LEARNER_RATE_LIMIT);
    if (limited !== null) return limited;

    let input: T;
    try {
      const body = await readBody(req, maxBodyBytes);
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
      return unavailable(error);
    }
  };
}

/**
 * The seams a learner write reads, for one owner. Lazy on purpose: a write
 * uses the database, the scope and the time zone, and a body refused before
 * the write must not open the database (a rejected promise nobody awaits) or
 * build a content source and a blob store it never reads.
 */
function learnerDeps(owner: string): TutorDeps {
  return {
    owner,
    scope: ownerScope(owner),
    env: process.env,
    get db() {
      return catalogDatabase();
    },
    get source() {
      return contentSource();
    },
    get blobStore() {
      return assetBlobStore();
    },
  };
}

/**
 * A route that is one of the shared learner writes
 * (`@gnosia/tutor/server/learner-writes`, the sidecar's too), with this app's
 * guards in front: same origin, the session's owner, a rate limit on
 * `learner:<bucket>`, and the bounded body read. The parse, the write and the
 * answer are the turn's, so the web and the native app speak one protocol.
 */
export function turnRoute(
  bucket: string,
  turn: (deps: TutorDeps, body: unknown) => Promise<TurnReply>,
): (req: Request) => Promise<NextResponse> {
  return async (req: Request) => {
    const origin = enforceSameOrigin(req);
    if (origin !== null) return origin;
    const owner = await requestOwner();
    if (owner instanceof NextResponse) return owner;
    const limited = enforceRateLimit(owner, `learner:${bucket}`, LEARNER_RATE_LIMIT);
    if (limited !== null) return limited;
    let body: unknown;
    try {
      body = await readBody(req, MAX_BODY_BYTES);
    } catch (error) {
      if (error instanceof BadRequest) return badRequest(error.message);
      throw error;
    }
    const { status, body: answer, headers } = await turn(learnerDeps(owner), body);
    return NextResponse.json(answer, { status, headers });
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
