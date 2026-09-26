import { NextResponse, type NextRequest } from "next/server";

import { requireStudio, studioOrigin } from "@/lib/studio";

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
 * What is forwarded: the method, the path under `/api`, the query string, and
 * the body. What is not: `Origin`, `Sec-Fetch-*`, `Cookie`, `Host` and the
 * app's own referer. The runner then sees what `curl` sends, which is what the
 * guard is looking for — a program rather than a page.
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

/** Everything a browser adds that says "a page sent this". */
const STRIPPED = new Set([
  "host",
  "origin",
  "referer",
  "cookie",
  "connection",
  "content-length",
  "sec-fetch-site",
  "sec-fetch-mode",
  "sec-fetch-dest",
  "sec-fetch-user",
  "upgrade-insecure-requests",
]);

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
 * 2. `Origin`, when present, must be this server's. A browser sends it on
 *    every request that is not a plain GET.
 * 3. A body-carrying method must be `application/json`, which is not a
 *    safelisted content type, so a cross-origin `fetch` has to preflight and
 *    Next answers no CORS headers for this route. Checking it here rather than
 *    only relabelling it upstream is the whole of the fix: relabelling turned
 *    a simple request into a trusted one.
 */
function check(request: NextRequest): string | null {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") {
    return `this request is ${site} according to the browser that sent it, and only same-origin is taken`;
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin !== null && origin !== "" && origin !== "null") {
    let sameHost = false;
    try {
      sameHost = new URL(origin).host === host;
    } catch {
      sameHost = false;
    }
    if (!sameHost) {
      return (
        `this request carries Origin "${origin}", so it came from another site. The studio starts ` +
        `paid agent sessions with filesystem access; a website does not get to do that, whatever ` +
        `the user happens to have open in another tab.`
      );
    }
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

  const search = request.nextUrl.search;
  const target = `${studioOrigin()}/api/${segments.map(encodeURIComponent).join("/")}${search}`;

  const headers = new Headers();
  for (const [name, value] of request.headers) {
    if (!STRIPPED.has(name.toLowerCase())) headers.set(name, value);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  // `check` has already refused anything that did not arrive as JSON, so this
  // normalises a charset parameter rather than relabelling a simple request as
  // a trusted one. Setting it without that check ahead of it was the bug.
  if (hasBody) headers.set("content-type", "application/json");

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      ...(hasBody ? { body: await request.text() } : {}),
      cache: "no-store",
      redirect: "manual",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "the studio runner is not answering",
        detail:
          `Nothing is listening on ${studioOrigin()}. Start it with \`npm run studio\`. ` +
          `(${(error as Error).message})`,
      },
      { status: 502 },
    );
  }

  const out = new Headers(upstream.headers);
  out.delete("content-encoding");
  out.delete("content-length");
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

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ segments: string[] }> },
): Promise<Response> {
  return proxy(request, (await context.params).segments);
}
