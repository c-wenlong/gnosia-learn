import "server-only";

import { STUDIO_OWNER_HEADER } from "@gnosia/schema/shared";
import { notFound } from "next/navigation";

import { currentOwner } from "@/lib/owner";
import { asRefusal, type Refusal } from "@/lib/studio-client";
import type { Comparison } from "@/lib/studio-compare";

/**
 * The studio's gate, and the one way the app talks to the runner.
 *
 * **The gate (D11).** The studio is an agent runner with a UI: it spawns
 * headless Claude Code sessions that write files, and it drives a headless
 * Chromium. None of that belongs in the deployed encyclopedia, and D7 in the
 * tool's own decisions keeps the Vercel app free of it. Rather than a second
 * Next app duplicating `AppShell`, `Sidebar` and `globals.css`, every studio
 * route calls `requireStudio()` first and production — where `STUDIO_ENABLED`
 * is unset — serves a 404 for all of them. That is only true if the call is
 * actually there, which is why the `gnosia/studio-gate` lint rule reads every
 * entry point under the route directory and fails when a new file forgets.
 *
 * `notFound()` rather than a 403 or an explanatory page: an unset variable
 * means this deployment has no studio, and "there is a studio here and you may
 * not have it" is a different and untrue statement.
 *
 * **Its own variable, and the only one the studio needs.** It starts paid
 * agent sessions, so nothing else turning on may turn it on. The studio never
 * borrows the library's `/api/assets/{id}/file` either: that route serves an
 * asset row's blob, and a diagram the studio is drawing has no row until it is
 * accepted. Studio thumbnails come from the runner instead, through
 * `/studio/api/diagrams/{name}/svg`, behind this one gate.
 */

export const STUDIO_ENV = "STUDIO_ENABLED";

/** Values that mean "set, but no". Anything else non-empty enables the studio. */
const DISABLED_VALUES = new Set(["", "0", "false", "off", "no"]);

export function studioEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return !DISABLED_VALUES.has((env[STUDIO_ENV] ?? "").trim().toLowerCase());
}

/**
 * The first line of every studio route, server action and route handler.
 *
 * It throws — `notFound()` throws a `NEXT_NOT_FOUND` — so there is no way to
 * call it and carry on past a disabled studio by mistake.
 */
export function requireStudio(): void {
  if (!studioEnabled()) notFound();
}

/**
 * Where the runner is. `STUDIO_PORT` mirrors the service's own variable, so a
 * runner moved off 7250 does not need the app told twice.
 */
export function studioOrigin(env: Record<string, string | undefined> = process.env): string {
  const raw = Number.parseInt((env.STUDIO_PORT ?? "").trim(), 10);
  const port = Number.isFinite(raw) && raw >= 1024 && raw <= 65535 ? raw : 7250;
  return `http://127.0.0.1:${port}`;
}

export type StudioResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      /** `down` is nothing listening; `refused` is the runner answering no. */
      reason: "down" | "refused";
      status: number | null;
      /**
       * On `down`: true only when the request certainly never reached the
       * runner (connection refused, the name did not resolve, no route to it).
       * A timeout, a reset or a caller's abort is false, since the runner may
       * have received the request and still be acting on it, so a caller that
       * repeats a write by another road must not do so then.
       */
      undelivered?: boolean;
      headline: string;
      /** The detail as text a page prints: the runner's sentence, or its detail object as JSON. */
      detail: string;
      /**
       * On `refused`: the runner's envelope as it came, its `detail` not turned
       * into text, so a caller reads `reason` with `refusalReason` the way the
       * browser's callers do.
       */
      refusal?: Refusal;
    };

/** Socket error codes that mean no request was delivered. */
const UNDELIVERED_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH"]);

/** Walks `error.cause` for a socket error code: fetch wraps it in a `TypeError: fetch failed`. */
function undelivered(error: unknown): boolean {
  for (let link: unknown = error, depth = 0; link instanceof Error && depth < 5; depth += 1) {
    const code = (link as { code?: unknown }).code;
    if (typeof code === "string" && UNDELIVERED_CODES.has(code)) return true;
    // An AggregateError (a refused `localhost`, tried on both addresses) holds them one level down.
    const inner = (link as { errors?: unknown }).errors;
    if (Array.isArray(inner) && inner.length > 0 && inner.every(undelivered)) return true;
    link = link.cause;
  }
  return false;
}

/**
 * One call to the runner, from the server, with the failure named rather than
 * thrown.
 *
 * Every blocked screen in the UI section is one of these two failures plus what
 * `/api/health` said, so a helper that threw would push that decision into a
 * `try` in every route. `down` and `refused` are kept apart because they need
 * different words: nothing listening means "start the studio", and an answer of
 * no means the runner has an opinion worth printing.
 *
 * **Why this is a server-side fetch and not a browser one.** The runner's
 * `guard` refuses any request carrying a cross-origin `Origin` or a
 * `Sec-Fetch-Site` that is not `same-origin`, which is what stops a page the
 * user happens to have open from starting a paid agent session on their
 * machine. Node's `fetch` sends neither header, and the `Host` it sends is the
 * runner's own authority, so these calls pass the guard by being what the guard
 * is looking for: a program, not a page.
 *
 * Every call names the signed-in owner (`STUDIO_OWNER_HEADER`), which the
 * runner checks against the owner it serves (phase 4), so a second account's
 * render is refused rather than shown this owner's diagrams and jobs.
 */
export async function studioApi<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<StudioResult<T>> {
  const { timeoutMs = 30_000, signal: caller, ...rest } = init;
  const url = `${studioOrigin()}${path}`;
  const owner = await currentOwner();
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      cache: "no-store",
      // The timeout, and the caller's own signal when it gave one (the page
      // aborts its reads when a blocked screen makes them moot).
      signal: caller == null ? AbortSignal.timeout(timeoutMs) : AbortSignal.any([caller, AbortSignal.timeout(timeoutMs)]),
      headers: {
        ...(rest.body === undefined ? {} : { "content-type": "application/json" }),
        ...rest.headers,
        [STUDIO_OWNER_HEADER]: owner,
      },
    });
  } catch (error) {
    return {
      ok: false,
      reason: "down",
      status: null,
      undelivered: undelivered(error),
      headline: "The studio runner is not answering.",
      detail:
        `Nothing is listening on ${studioOrigin()}. Start it with \`npm run studio\` from the ` +
        `repository root. (${(error as Error).message})`,
    };
  }

  // The deadline covers the body too. A body cut off mid-read is a runner
  // that stopped answering, and a 2xx that is not JSON is not a success with
  // nothing in it: either read as `ok: true, data: null` and threw on the
  // first field a page read (R2-1-05). The browser's `call` already says so.
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    return {
      ok: false,
      reason: "down",
      status: response.status,
      undelivered: false,
      headline: "The studio runner stopped answering.",
      detail: `It began to answer and did not finish. (${(error as Error).message})`,
    };
  }
  const body = parsedJson(text);
  if (response.ok && body === undefined) {
    return {
      ok: false,
      reason: "refused",
      status: response.status,
      headline: "The studio runner answered with something that is not JSON.",
      detail: text.slice(0, 200),
    };
  }
  if (!response.ok) {
    const refusal = asRefusal(response.status, body);
    return {
      ok: false,
      reason: "refused",
      status: response.status,
      headline: refusal.error,
      detail: typeof refusal.detail === "string" ? refusal.detail : JSON.stringify(refusal.detail ?? {}),
      refusal,
    };
  }
  return { ok: true, data: body as T };
}

/** A body as JSON, or `undefined` when it is not JSON (`null` is JSON). */
function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * The one job a full-width picture is about, fetched only when one is open.
 *
 * `GET /api/jobs` carries neither the brief nor the comparison, and
 * `ShotView` needs both: without them it linked to the other side whether or
 * not that side exists, so a `new` job's "Show before" put a broken image
 * across the main area while the thumbnail beside it correctly said there was
 * no before. One extra call, made only on the render that shows a picture.
 *
 * A failure is `null` and the view falls back to showing the image and letting
 * the 404 speak, which is the honest order: a runner that did not answer is not
 * evidence that a picture is missing.
 */
export async function openShot(
  jobId: string,
): Promise<{ comparison: Comparison | null; brief?: { mode?: string } } | null> {
  const result = await studioApi<{ comparison?: Comparison | null; brief?: { mode?: string } }>(
    `/api/jobs/${encodeURIComponent(jobId)}`,
  );
  if (!result.ok) return null;
  return { comparison: result.data.comparison ?? null, brief: result.data.brief };
}
