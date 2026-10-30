import { NextResponse } from "next/server";

import {
  LOCAL_TOKEN_VAR,
  readAuthConfig,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  secretsEqual,
  signSession,
} from "@/lib/auth/core";
import { redirectTo, sessionCookie } from "../shared";

/**
 * `GET /api/auth/local?token=…`: how the desktop shell signs itself in.
 *
 * The shell mints a random `GNOSIA_LOCAL_TOKEN` for every server it spawns
 * and loads this route as the window's first URL; a matching token redeems
 * the same session cookie the password earns. A secret, not a flag — an
 * environment where the variable was never set refuses everyone, and the
 * token lives only in the child process's environment, so nothing in a
 * copied `.env` or deployment config can stand in for it.
 *
 * The check deliberately does *not* look at the request's apparent host:
 * `request.url` under `next start` says `localhost` whatever the visitor
 * typed, so a hostname check would let a leaked flag treat a remote
 * visitor as local — the token is the whole gate.
 *
 * - Token unset or wrong: 403. The shell is the only caller; a mistyped or
 *   absent secret is a configuration fault, not a sign-in attempt.
 * - Auth unconfigured: 303 to `/sign-in?error=unconfigured`, same as the
 *   form's failure — the page names the variables.
 * - Token right: the session cookie and a 303 to `/home`.
 */
export async function GET(request: Request) {
  const expected = process.env[LOCAL_TOKEN_VAR];
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!expected || !(await secretsEqual(token, expected))) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const config = readAuthConfig(process.env);
  if (!config.ok) return redirectTo("/sign-in?error=unconfigured");

  const session = await signSession(config.config.secret, Math.floor(Date.now() / 1000));
  const response = redirectTo("/home");
  response.cookies.set({
    ...sessionCookie(request),
    name: SESSION_COOKIE,
    value: session,
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
