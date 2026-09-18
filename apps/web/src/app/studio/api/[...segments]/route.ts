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

async function proxy(request: NextRequest, segments: string[]): Promise<Response> {
  requireStudio();

  const search = request.nextUrl.search;
  const target = `${studioOrigin()}/api/${segments.map(encodeURIComponent).join("/")}${search}`;

  const headers = new Headers();
  for (const [name, value] of request.headers) {
    if (!STRIPPED.has(name.toLowerCase())) headers.set(name, value);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  // The guard requires `application/json` on a POST, which is the check that
  // forces a cross-origin caller into a preflight this server never answers.
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
