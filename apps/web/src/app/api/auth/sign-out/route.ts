import { NextResponse } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/core";
import { redirectTo, sameOrigin, sessionCookie } from "../shared";

/**
 * `POST /api/auth/sign-out`: clears the session cookie and lands on the
 * landing page. A POST, from the avatar menu's form, so a prefetched link or
 * an image tag on another site cannot sign the owner out. There is no
 * server-side session to revoke; a token that is no longer in any browser is
 * simply a token nobody presents.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "CROSS_ORIGIN" }, { status: 403 });
  }
  const response = redirectTo("/");
  response.cookies.set({ ...sessionCookie(request), name: SESSION_COOKIE, value: "", maxAge: 0 });
  return response;
}
