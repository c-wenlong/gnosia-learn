import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { readAuthConfig, SESSION_COOKIE, verifySession } from "./core";

/**
 * Single-owner sessions: the half that reads the request.
 *
 * `isSignedIn` is the one question every server component and route asks;
 * the proxy asks the same thing from `NextRequest` directly, since it has no
 * `cookies()`. Keep the two in step: both go through `verifySession`, and the
 * answer depends on nothing but the cookie, the secret and the clock.
 */

export function authConfig() {
  return readAuthConfig(process.env);
}

/** Whether a deployment can sign anyone in at all. */
export function authConfigured(): boolean {
  return authConfig().ok;
}

export async function isSignedIn(): Promise<boolean> {
  const config = authConfig();
  if (!config.ok) return false;
  const store = await cookies();
  return verifySession(config.config.secret, store.get(SESSION_COOKIE)?.value, Math.floor(Date.now() / 1000));
}

/**
 * For the `(app)` layout: the proxy already redirected an anonymous visitor,
 * so this is the second lock on the same door, the one that still holds if a
 * matcher change or a new route group ever lets a page through. It cannot
 * know the requested path (layouts see no URL), so the sign-in page lands on
 * home afterwards rather than back here.
 */
export async function requireSignedIn(): Promise<void> {
  if (!(await isSignedIn())) redirect("/sign-in");
}
