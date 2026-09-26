import { NextResponse } from "next/server";

/**
 * What the two auth routes share: the same-origin check and the cookie
 * attributes, so sign-in and sign-out cannot drift into setting and clearing
 * two different cookies.
 */

/** How long a wrong password waits before the redirect. */
export const WRONG_PASSWORD_DELAY_MS = 600;

/**
 * True when the browser says the request came from this site. Modern browsers
 * send `Sec-Fetch-Site`; older ones send `Origin` on a form post. A request
 * with neither header is a non-browser client (curl, a test) and is allowed
 * through: the check is against cross-site *browsers*, which always send at
 * least one of the two.
 */
export function sameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin" || site === "none";
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  // Compare against the `Host` the browser addressed, never `request.url`:
  // under `next start` that URL says `localhost` whatever the page was opened
  // on, so a sign-in from a phone on the LAN (`192.168.x.x:3000`) would be
  // refused as cross-site.
  const host = request.headers.get("host");
  if (host === null) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * A 303 to a same-origin path, with a *relative* `Location`. The absolute
 * form would need an origin, and the only one a route handler has is
 * `request.url`, which `next start` always reports as `localhost`; a browser
 * that opened the app on a LAN address or through a tunnel would be sent to
 * a host it cannot reach. A relative Location is resolved by the browser
 * against the page it posted from, which is the one origin that is always
 * right.
 */
export function redirectTo(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

/**
 * The cookie's fixed attributes. `Secure` follows the request's scheme rather
 * than `NODE_ENV`, because the documented way to look at this app locally is a
 * production build over plain http, where a Secure cookie is silently dropped
 * and every sign-in looks like it did nothing.
 */
export function sessionCookie(request: Request) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: request.headers.get("x-forwarded-proto") === "https" || new URL(request.url).protocol === "https:",
    path: "/",
  };
}
