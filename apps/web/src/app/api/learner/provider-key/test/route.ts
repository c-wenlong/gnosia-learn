import { NextResponse } from "next/server";

import { tutorDeps, turnResponse } from "@/lib/agent/env";
import { guard, readBody } from "@/lib/provider-keys/requests";
import { KEY_TEST_RATE_LIMIT } from "@/lib/provider-keys/requests";
import { providerKeyTestTurn } from "@self-learn/tutor/server/turns";

export const runtime = "nodejs";

/**
 * `POST { provider }`: one minimal call to that provider with the key the
 * tutor would use for it (the owner's saved key, else the server's), and what
 * came back (docs/BYOK.md, decision 3). The model is the one the tutor would
 * call that key with first: the owner's first chain entry for the provider,
 * else its default (docs/TUTOR-MODELS.md).
 *
 * The call and its reply are `providerKeyTestTurn` in
 * `@self-learn/tutor/server`, which the native sidecar calls over the same
 * contract. This file keeps the request-side guards and a tighter rate
 * limit, since each test spends a provider request.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const owner = await guard(req, "test", KEY_TEST_RATE_LIMIT);
  if (owner instanceof NextResponse) return owner;
  const body = await readBody(req);
  if (body instanceof NextResponse) return body;

  return turnResponse(await providerKeyTestTurn(tutorDeps(owner), body));
}
