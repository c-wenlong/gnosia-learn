import { NextResponse } from "next/server";

import {
  LOCAL_TOKEN_VAR,
  MIN_SECRET_LENGTH,
  readAuthConfig,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  secretsEqual,
  signSession,
} from "@/lib/auth/core";
import { claimLocalToken, LOCAL_TOKEN_HEADER, localTokenRedeemed } from "../local-token";
import { redirectTo, sessionCookie, WRONG_PASSWORD_DELAY_MS } from "../shared";

/**
 * `GET /api/auth/local`: how the desktop shell signs itself in.
 *
 * The shell mints a random `GNOSIA_LOCAL_TOKEN` for every server it spawns
 * and loads this route as the window's first request, with the token in the
 * `x-gnosia-local-token` header (never the URL, which `next dev` can log); a
 * matching token redeems the same session cookie the password earns. A
 * secret, not a flag: an environment where the variable was never set
 * refuses everyone. Next also loads `apps/web/.env.local` into the
 * environment, so a short value typed there would be a second password; a
 * token shorter than `MIN_SECRET_LENGTH` counts as unset (S7-09).
 *
 * The token is single-use per server process. The shell redeems it once per
 * launch, and a second window shares the first one's cookies, so a second
 * presentation of the right token is sent to `/home` with no new cookie.
 *
 * The check deliberately does *not* look at the request's apparent host:
 * `request.url` under `next start` says `localhost` whatever the visitor
 * typed, so a hostname check would let a leaked flag treat a remote
 * visitor as local. The token is the whole gate.
 *
 * - Token unset, too short, absent or wrong: 403. A presented wrong token
 *   waits as a wrong password does first.
 * - Token right, already redeemed: 303 to `/home`, no cookie.
 * - Auth unconfigured: 303 to `/sign-in?error=unconfigured`, same as the
 *   form's failure; the page names the variables.
 * - Token right: the session cookie and a 303 to `/home`.
 */
export async function GET(request: Request) {
  const raw = process.env[LOCAL_TOKEN_VAR] ?? "";
  const expected = raw.length >= MIN_SECRET_LENGTH ? raw : "";
  const token = request.headers.get(LOCAL_TOKEN_HEADER) ?? "";
  if (!expected || !token) return forbidden();
  if (!(await secretsEqual(token, expected))) {
    await new Promise((resolve) => setTimeout(resolve, WRONG_PASSWORD_DELAY_MS));
    return forbidden();
  }
  if (localTokenRedeemed()) return redirectTo("/home");

  const config = readAuthConfig(process.env);
  if (!config.ok) return redirectTo("/sign-in?error=unconfigured");

  claimLocalToken();
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

function forbidden(): NextResponse {
  return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
}
