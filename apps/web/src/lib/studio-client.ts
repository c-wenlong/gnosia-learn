/**
 * The browser's one client for the runner's routes, and the refusal envelope
 * every route answers with. The draft calls (`studio-drafts.ts`), the BYOK
 * calls (`studio-byok.ts`) and the stream (`studio-events.ts`) all go
 * through here, so a refusal is read one way.
 *
 * Browser-side. Every path is `/studio/api/...`, which the studio's route
 * handler forwards to the runner after checking the request came from this
 * app's own page and adding the signed-in owner (AGENTS.md, the studio
 * proxy). The server's `studioApi` (`studio.ts`) reads the same envelope with
 * `asRefusal`. No React, and nothing here runs at import time.
 */

/**
 * What the app says when the runner does not answer: the studio proxy's 502
 * when nothing listens on the runner's port, and this file's own status 0
 * when the fetch itself fails. One string, so a caller can tell a runner
 * that is down from a runner that answered 502 about the request.
 */
export const RUNNER_DOWN = "the studio runner is not answering";

/** True for either way the runner can be down. */
export function runnerDown(status: number, refusal: Refusal): boolean {
  return status === 0 || (status === 502 && refusal.error === RUNNER_DOWN);
}

/** The runner's refusal envelope, on every route. */
export interface Refusal {
  error: string;
  /** A sentence, or an object with a `reason` and the facts behind it. */
  detail: unknown;
}

/** A call's answer, with the failure named rather than thrown. */
export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; refusal: Refusal };

/** Where the draft routes are, through the studio proxy. */
export const DRAFTS_BASE = "/studio/api/drafts";

/** One draft's route, `rest` appended. */
export function draftPath(draftId: string, rest = ""): string {
  return `${DRAFTS_BASE}/${encodeURIComponent(draftId)}${rest}`;
}

/** A key a retried POST can be recognised by. The runner answers 200 with the first result. */
export function idempotencyKey(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `studio-ui:${prefix}:${random}`;
}

/** The runner's `{ error, detail }` envelope from an answer's body, with `detail` kept as it came. */
export function asRefusal(status: number, body: unknown): Refusal {
  const envelope = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  return {
    error: typeof envelope.error === "string" ? envelope.error : `the runner answered ${status}`,
    detail: envelope.detail ?? null,
  };
}

/**
 * How long a call waits for the runner's answer. The proxy sets no limit of
 * its own, so without one a runner that took the connection and hung left a
 * button's busy state spinning until the browser gave up. Generous, since a
 * conversation opened on a concept reads its note first.
 */
export const CALL_TIMEOUT_MS = 60_000;

/** One call to the runner through the studio proxy, with the failure named rather than thrown. */
export async function call<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(CALL_TIMEOUT_MS),
      // The studio proxy refuses a body that is not JSON before it strips the
      // headers that say a page sent it, so this is not decoration.
      headers: init.body === undefined ? init.headers : { "content-type": "application/json", ...init.headers },
    });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      refusal: { error: RUNNER_DOWN, detail: (error as Error).message },
    };
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, status: response.status, refusal: asRefusal(response.status, body) };
  return { ok: true, status: response.status, data: body as T };
}

/* -------------------------------------------------------------------------- */
/* Reading a refusal                                                          */
/* -------------------------------------------------------------------------- */

/** The `reason` a refusal's detail names, when it names one. */
export function refusalReason(refusal: Refusal): string | null {
  const detail = refusal.detail;
  if (typeof detail !== "object" || detail === null) return null;
  const reason = (detail as { reason?: unknown }).reason;
  return typeof reason === "string" ? reason : null;
}

/** A field of a refusal's detail object, when it is a string. */
export function refusalString(refusal: Refusal, field: string): string | null {
  const detail = refusal.detail;
  if (typeof detail !== "object" || detail === null) return null;
  const value = (detail as Record<string, unknown>)[field];
  return typeof value === "string" ? value : null;
}

/** A field of a refusal's detail object, when it is a number. */
export function refusalNumber(refusal: Refusal, field: string): number | null {
  const detail = refusal.detail;
  if (typeof detail !== "object" || detail === null) return null;
  const value = (detail as Record<string, unknown>)[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
