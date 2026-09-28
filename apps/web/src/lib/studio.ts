import "server-only";

import { STUDIO_OWNER_HEADER } from "@self-learn/schema/shared";
import { notFound } from "next/navigation";

import { currentOwner } from "@/lib/owner";
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
 * actually there, which is why `studio-gate.test.ts` walks the route directory
 * and fails when a new file forgets.
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
      headline: string;
      detail: string;
    };

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
  const { timeoutMs = 30_000, ...rest } = init;
  const url = `${studioOrigin()}${path}`;
  const owner = await currentOwner();
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
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
      headline: "The studio runner is not answering.",
      detail:
        `Nothing is listening on ${studioOrigin()}. Start it with \`npm run studio\` from the ` +
        `repository root. (${(error as Error).message})`,
    };
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const envelope = body as { error?: unknown; detail?: unknown } | null;
    return {
      ok: false,
      reason: "refused",
      status: response.status,
      headline: typeof envelope?.error === "string" ? envelope.error : `the runner answered ${response.status}`,
      detail: typeof envelope?.detail === "string" ? envelope.detail : JSON.stringify(envelope?.detail ?? {}),
    };
  }
  return { ok: true, data: body as T };
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
