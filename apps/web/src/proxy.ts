import { NextResponse, type NextRequest } from "next/server";

import { HOME_PATH, isApiPath, isPublicPath, originFromHeaders, readAuthConfig, SESSION_COOKIE, verifySession } from "@/lib/auth/core";
import { contentSecurityPolicy, makeNonce, NONCE_HEADER } from "@/lib/auth/csp";

/**
 * The front door. Runs before every route the matcher lets through and asks
 * one question: is this the owner?
 *
 * | visitor   | `/` or `/sign-in`      | `/api/auth/*` | anything else                          |
 * | --------- | ---------------------- | ------------- | -------------------------------------- |
 * | anonymous | the page               | the route     | API: 401 JSON. Page: 307 to `/sign-in?next=` |
 * | owner     | 307 to `/home`         | the route     | the page or route                      |
 *
 * Either variable unset means nobody is the owner, an existing cookie
 * included: every protected path sends the visitor to the sign-in page, which
 * says which variable is missing. Failing closed is the point; a deployment
 * that forgot a variable must not be a deployment with no door, and removing
 * `OWNER_PASSWORD` has to end the sessions it once opened, since the API
 * routes have no second lock of their own. Changing it, or `SESSION_EPOCH`,
 * ends them too: the session key is derived from both (`sessionKey`).
 *
 * The matcher leaves out Next's own static output and the image files the
 * landing page and the social card need while signed out. Everything under
 * `/api/` is deliberately *in*: the learner routes write the only copy of the
 * study record.
 *
 * Every page it lets through leaves with a Content-Security-Policy carrying a
 * fresh nonce (`pass`, and `src/lib/auth/csp.ts` for the policy).
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const config = readAuthConfig(process.env);
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const signedIn = config.ok && (await verifySession(config.config, token, Math.floor(Date.now() / 1000)));

  if (pathname === "/" || pathname === "/sign-in") {
    return signedIn ? redirect(request, HOME_PATH) : pass(request);
  }
  if (isPublicPath(pathname) || signedIn) return pass(request);

  if (isApiPath(pathname)) {
    return NextResponse.json({ error: "UNAUTHENTICATED", signIn: "/sign-in" }, { status: 401 });
  }
  return redirect(request, `/sign-in?${new URLSearchParams({ next: `${pathname}${search}` })}`);
}

/**
 * Let the request through, with a nonce policy when it is for a page.
 *
 * The policy goes on the request as well as the response: Next reads the
 * nonce out of the request's `Content-Security-Policy` header while rendering
 * and stamps it on every script it writes, and the layouts read
 * `NONCE_HEADER` for their own two inline scripts. An API path gets neither: a
 * route handler that serves a document sets its own policy, and JSON needs
 * none.
 */
function pass(request: NextRequest): NextResponse {
  if (isApiPath(request.nextUrl.pathname)) return NextResponse.next();
  const nonce = makeNonce();
  const policy = contentSecurityPolicy({ nonce, dev: process.env.NODE_ENV !== "production" });
  const headers = new Headers(request.headers);
  headers.set(NONCE_HEADER, nonce);
  headers.set("content-security-policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", policy);
  return response;
}

/**
 * A 307 to a path on the host the browser actually asked for.
 *
 * `request.url` under `next start` names `localhost` whatever address the
 * browser used, so a redirect built from it sends a LAN or tunnelled visitor
 * to a host they cannot reach. The route handlers answer with a relative
 * `Location` for the same reason; the proxy runtime refuses one (it parses
 * the header as a URL and throws `Invalid URL`), so here the origin comes
 * from `originFromHeaders`: `Host`, the forwarded scheme, never a forwarded
 * host, and `request.url` when the headers do not form a valid origin.
 */
function redirect(request: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, originFromHeaders(request.headers, request.url)), 307);
}

export const config = {
  matcher: [
    // Everything except Next's static output and the files a signed-out
    // visitor still needs: the icons, the social card and public/ images.
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.png|apple-icon\\.png|opengraph-image\\.png|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml|woff2?)$).*)",
  ],
};
