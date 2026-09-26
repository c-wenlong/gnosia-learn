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
  return origin === new URL(request.url).origin;
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
    secure: new URL(request.url).protocol === "https:",
    path: "/",
  };
}
