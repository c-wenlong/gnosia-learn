import { NextResponse, type NextRequest } from "next/server";

import { HOME_PATH, isApiPath, isPublicPath, readAuthConfig, SESSION_COOKIE, verifySession } from "@/lib/auth/core";

/**
 * The front door. Runs before every route the matcher lets through and asks
 * one question: is this the owner?
 *
 * | visitor   | `/` or `/sign-in`      | `/api/auth/*` | anything else                          |
 * | --------- | ---------------------- | ------------- | -------------------------------------- |
 * | anonymous | the page               | the route     | API: 401 JSON. Page: 307 to `/sign-in?next=` |
 * | owner     | 307 to `/today`        | the route     | the page or route                      |
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
    return signedIn ? NextResponse.redirect(new URL(HOME_PATH, request.url)) : NextResponse.next();
  }
  if (isPublicPath(pathname) || signedIn) return NextResponse.next();

  if (isApiPath(pathname)) {
    return NextResponse.json({ error: "UNAUTHENTICATED", signIn: "/sign-in" }, { status: 401 });
  }
  const to = new URL("/sign-in", request.url);
  to.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(to);
}

export const config = {
  matcher: [
    // Everything except Next's static output and the files a signed-out
    // visitor still needs: the icons, the social card and public/ images.
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.png|apple-icon\\.png|opengraph-image\\.png|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml|woff2?)$).*)",
  ],
};
