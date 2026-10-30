import { clientIp } from "@gnosia/tutor/guards";
import { NextResponse } from "next/server";

import { passwordMatches, readAuthConfig, safeNextPath, SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/auth/core";
import { admitSignIn, releaseSignIn } from "@/lib/auth/sign-in-limit";
import { redirectTo, sameOrigin, sessionCookie, WRONG_PASSWORD_DELAY_MS } from "../shared";

/**
 * `POST /api/auth/sign-in`: the sign-in form's target. A plain form post, so
 * the page needs no JavaScript to work; every outcome is a 303 back to a page.
 *
 * - Too many attempts: 303 to `/sign-in?error=throttled&retry=<seconds>`,
 *   before the body is read, keeping the `next` the form's action carries in
 *   its query so the owner still lands where they were going. `@/lib/auth/sign-in-limit` has the two limits
 *   (per client, and wrong passwords from everyone together) and why.
 * - Wrong password: 303 to `/sign-in?error=password`, after a fixed delay,
 *   keeping the slot it took in everyone's window. The delay is a floor under each
 *   guess; the limits are what bound them.
 * - Not configured: 303 to `/sign-in?error=unconfigured`, and the page names
 *   the variables. Nothing is compared, since there is nothing to compare to.
 * - Right password: the session cookie and a 303 to `next`, vetted by
 *   `safeNextPath` so a crafted link cannot bounce the owner off the origin.
 *
 * Cross-site posts are refused by `sameOrigin` before the body is read: a
 * page elsewhere must not be able to sign this browser in to a session it
 * chose (login CSRF), even though the cookie's `SameSite=Lax` already keeps
 * it off cross-site requests.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "CROSS_ORIGIN" }, { status: 403 });
  }
  const queryNext = safeNextPath(new URL(request.url).searchParams.get("next"));
  const admitted = admitSignIn(clientIp(request.headers));
  if (!admitted.allowed) {
    const params = new URLSearchParams({ error: "throttled", retry: String(admitted.retryAfterSeconds) });
    if (queryNext !== safeNextPath(null)) params.set("next", queryNext);
    const response = redirectTo(`/sign-in?${params}`);
    response.headers.set("Retry-After", String(admitted.retryAfterSeconds));
    return response;
  }

  const form = await request.formData();
  const next = typeof form.get("next") === "string" ? safeNextPath(form.get("next") as string) : queryNext;
  const back = (error: string) => {
    const params = new URLSearchParams({ error });
    if (next !== safeNextPath(null)) params.set("next", next);
    return redirectTo(`/sign-in?${params}`);
  };

  const config = readAuthConfig(process.env);
  if (!config.ok) {
    releaseSignIn();
    return back("unconfigured");
  }

  const password = form.get("password");
  if (typeof password !== "string" || !(await passwordMatches(password, config.config.password))) {
    await new Promise((resolve) => setTimeout(resolve, WRONG_PASSWORD_DELAY_MS));
    return back("password");
  }
  releaseSignIn();
  const token = await signSession(config.config, Math.floor(Date.now() / 1000));
  const response = redirectTo(next);
  response.cookies.set({
    ...sessionCookie(request),
    name: SESSION_COOKIE,
    value: token,
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
