import { STUDIO_OWNER_HEADER } from "@gnosia/schema/shared";
import { NextResponse, type NextRequest } from "next/server";

import { requestIsSameOrigin } from "@/lib/auth/core";
import { BodyTooLarge, readBodyText } from "@/lib/learner-api";
import { currentOwner, NoOwnerError } from "@/lib/owner";
import { requireStudio, studioOrigin } from "@/lib/studio";
import { RUNNER_DOWN } from "@/lib/studio-client";

/**
 * `/studio/api/*` → `127.0.0.1:7250/api/*`.
 *
 * **Why a route handler and not a `rewrites()` entry in `next.config.ts`.**
 * Two reasons, and the first is the one that decides it.
 *
 * A config rewrite proxies the browser's request with its headers, `Origin` and
 * `Sec-Fetch-Site` included. The runner's `guard` refuses a request carrying a
 * cross-origin `Origin`, and `http://localhost:3000` is a different origin from
 * `http://127.0.0.1:7250` — same machine, different authority — so every POST
 * through a config rewrite would come back 403 with a message about websites
 * not getting to start agent sessions. The guard would be doing exactly its
 * job: it cannot tell the app's own proxy from a page the user happens to have
 * open, because a transparent proxy makes them byte-identical. Stripping the
 * two headers is the difference, and a config rewrite cannot strip a header.
 *
 * The second reason is D11. `STUDIO_ENABLED` has to be read at request time so
 * one build can be the deployed encyclopedia and a local studio; `rewrites()`
 * is evaluated when the config is loaded. A route handler calls the same
 * `requireStudio()` every page calls, which is also what makes the gate test a
 * real test — it walks this directory and would fail if this file forgot.
 *
 * What is forwarded: the method, the path under `/api`, the query string, the
 * body (at most `MAX_BODY_BYTES`, the runner's own limit) and the few request
 * headers in `FORWARDED`. Everything else the browser or a client sent is
 * dropped, `Origin`, `Sec-Fetch-*`, `Cookie`, `Host`, `Authorization`, the
 * forwarded chain and hop-by-hop headers included: an allow list, so a header
 * nobody thought of does not reach the runner. What is added: the signed-in
 * owner, in `STUDIO_OWNER_HEADER`, from the session (phase 4). A page cannot
 * name an owner; the runner serves only the owner it was started for and
 * refuses anyone else. The runner then sees what `curl` sends, which is what
 * the guard is looking for — a program rather than a page.
 *
 * What comes back: the runner's status, body and headers, minus a `Location`
 * (it would name `127.0.0.1:7250`, which the browser cannot follow), a
 * `Set-Cookie` (the runner has no business setting one on this origin) and
 * the hop-by-hop headers, plus `RESPONSE_CSP`: a picture the runner serves
 * (an agent-drawn SVG) opened directly is then a sandboxed document with
 * scripts off, the same rule as the asset file route's `ASSET_CSP`.
 *
 * **And that is exactly why this route has to make the same judgement itself,
 * first.** Stripping the headers the runner reasons about moves the decision
 * here; it does not remove it. Without `check` below, a page on any other site
 * could `fetch` this path with a `text/plain` body — one of the three content
 * types that need no preflight, so no CORS answer is required and the side
 * effect lands whether or not the reply can be read — and this handler would
 * have relabelled it `application/json`, dropped the `Origin` that gave it
 * away, and handed it to the runner as a program. A website would have been
 * able to start a paid agent session with filesystem access on the user's
 * machine. So the three checks `guard` makes are made here too, against *this*
 * origin rather than the runner's, before anything is stripped. Caught in
 * review on the phase 2 PR; the hole was real.
 *
 * Streaming is left intact. `/api/jobs/{id}/events` is an SSE stream phase 3
 * consumes, and `response.body` passed straight through keeps it one.
 */

export const dynamic = "force-dynamic";

/**
 * The request headers the runner reads, and nothing else: the body's type,
 * the conditional and range headers a picture or a video uses, and the
 * reconnect position an event stream sends (`services/studio/src/api.ts`).
 */
const FORWARDED = [
  "accept",
  "accept-language",
  "content-type",
  "if-none-match",
  "if-modified-since",
  "last-event-id",
  "range",
];

/** The runner's own body limit (`BODY_LIMIT` in `services/studio/src/api.ts`). */
const MAX_BODY_BYTES = 1_000_000;

/** Response headers that describe the hop to the runner, or that the browser must not get from it. */
const DROPPED_RESPONSE = [
  "content-encoding",
  "content-length",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "location",
  "set-cookie",
];

/** Every proxied answer is, as a document, sandboxed with scripts off. */
const RESPONSE_CSP = "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; sandbox";

/**
 * `guard`'s three checks, made here against this app's own origin.
 *
 * The runner's copy asks whether the request came from a program or from a
 * page. This copy asks whether it came from *this* page or from someone
 * else's, which is the question that still has an answer once the proxy has
 * stripped the evidence.
 *
 * 1. `Sec-Fetch-Site`, which every current browser sends and no program does,
 *    must say same-origin. `none` is a direct navigation — the address bar —
 *    and is taken for the same reason the runner takes it.
 * 2. `Origin`, when present, must be this server's, and the literal `null`
 *    (a sandboxed frame, a `data:` page) is refused. A browser sends it on
 *    every request that is not a plain GET. 1 and 2 are
 *    `requestIsSameOrigin` in `@/lib/auth/core`.
 * 3. A body-carrying method must be `application/json`, which is not a
 *    safelisted content type, so a cross-origin `fetch` has to preflight and
 *    Next answers no CORS headers for this route. Checking it here rather than
 *    only relabelling it upstream is the whole of the fix: relabelling turned
 *    a simple request into a trusted one.
 */
function check(request: NextRequest): string | null {
  // Sec-Fetch-Site, then Origin against this server's host (`null` refused),
  // with a request carrying neither let through: that is a program, which is
  // who the runner already takes. One rule for every guarded route.
  if (!requestIsSameOrigin(request, { allowMissing: true })) {
    const origin = request.headers.get("origin");
    const site = request.headers.get("sec-fetch-site");
    if (site !== null && site !== "same-origin" && site !== "none") {
      return `this request is ${site} according to the browser that sent it, and only same-origin is taken`;
    }
    return (
      `this request carries Origin "${origin}", so it came from another site. The studio starts ` +
      `paid agent sessions with filesystem access; a website does not get to do that, whatever ` +
      `the user happens to have open in another tab.`
    );
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    const type = (request.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
    if (type !== "application/json") {
      return (
        `bodies here must be sent as application/json, and this one is "${type || "nothing"}". The ` +
        `three content types a browser can send without asking permission first are exactly the ` +
        `ones this refuses, which is the point.`
      );
    }
  }
  return null;
}

async function proxy(request: NextRequest, segments: string[]): Promise<Response> {
  requireStudio();

  const refused = check(request);
  if (refused !== null) {
    return NextResponse.json({ error: refused, detail: null }, { status: 403 });
  }

  let owner: string;
  try {
    owner = await currentOwner();
  } catch (error) {
    if (error instanceof NoOwnerError) {
      return NextResponse.json({ error: "sign in first", detail: null }, { status: 401 });
    }
    throw error;
  }

  const search = request.nextUrl.search;
  const target = `${studioOrigin()}/api/${segments.map(encodeURIComponent).join("/")}${search}`;

  const headers = new Headers();
  for (const name of FORWARDED) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  headers.set(STUDIO_OWNER_HEADER, owner);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  // `check` has already refused anything that did not arrive as JSON, so this
  // normalises a charset parameter rather than relabelling a simple request as
  // a trusted one. Setting it without that check ahead of it was the bug.
  if (hasBody) headers.set("content-type", "application/json");

  let body: string | undefined;
  if (hasBody) {
    try {
      body = await readBodyText(request, MAX_BODY_BYTES);
    } catch (error) {
      if (error instanceof BodyTooLarge) {
        return NextResponse.json({ error: `bodies here are at most ${MAX_BODY_BYTES} bytes`, detail: null }, { status: 413 });
      }
      throw error;
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      ...(body !== undefined ? { body } : {}),
      cache: "no-store",
      redirect: "manual",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: RUNNER_DOWN,
        detail:
          `Nothing is listening on ${studioOrigin()}. Start it with \`npm run studio\`. ` +
          `(${(error as Error).message})`,
      },
      { status: 502 },
    );
  }

  const out = new Headers(upstream.headers);
  for (const name of DROPPED_RESPONSE) out.delete(name);
  out.set("content-security-policy", RESPONSE_CSP);
  out.set("x-content-type-options", "nosniff");
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ segments: string[] }> },
): Promise<Response> {
  return proxy(request, (await context.params).segments);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ segments: string[] }> },
): Promise<Response> {
  return proxy(request, (await context.params).segments);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ segments: string[] }> },
): Promise<Response> {
  return proxy(request, (await context.params).segments);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ segments: string[] }> },
): Promise<Response> {
  return proxy(request, (await context.params).segments);
}
