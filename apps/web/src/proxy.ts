import { NextResponse, type NextRequest } from "next/server";

import { HOME_PATH, isApiPath, isPublicPath, originFromHeaders, readAuthConfig, SESSION_COOKIE, verifySession } from "@/lib/auth/core";

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
 * routes have no second lock of their own.
 *
 * The matcher leaves out Next's own static output and the image files the
 * landing page and the social card need while signed out. Everything under
 * `/api/` is deliberately *in*: the learner routes write the only copy of the
 * study record.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const config = readAuthConfig(process.env);
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const signedIn = config.ok && (await verifySession(config.config.secret, token, Math.floor(Date.now() / 1000)));

  if (pathname === "/" || pathname === "/sign-in") {
    return signedIn ? redirect(request, HOME_PATH) : NextResponse.next();
  }
  if (isPublicPath(pathname) || signedIn) return NextResponse.next();

  if (isApiPath(pathname)) {
    return NextResponse.json({ error: "UNAUTHENTICATED", signIn: "/sign-in" }, { status: 401 });
  }
  return redirect(request, `/sign-in?${new URLSearchParams({ next: `${pathname}${search}` })}`);
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
