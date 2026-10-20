import { NextResponse } from "next/server";

import { tutorDeps, turnResponse } from "@/lib/agent/env";
import { guard, readBody } from "@/lib/provider-keys/requests";
import { CHAIN_TEST_RATE_LIMIT } from "@/lib/tutor-models/requests";
import { tutorModelTestTurn } from "@self-learn/tutor/server/turns";

export const runtime = "nodejs";

/**
 * `POST { provider, model }`: one minimal call to exactly that chain entry,
 * its provider's endpoint with its model id and the key the tutor would use
 * (docs/TUTOR-MODELS.md, T2), and what came back.
 *
 * The call and its reply are `tutorModelTestTurn` in
 * `@self-learn/tutor/server`, which the native sidecar calls over the same
 * contract. This file keeps the request-side guards and the key Test's rate
 * limit, in a bucket of its own.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const owner = await guard(req, "test", CHAIN_TEST_RATE_LIMIT, "tutor-model");
  if (owner instanceof NextResponse) return owner;
  const body = await readBody(req);
  if (body instanceof NextResponse) return body;

  return turnResponse(await tutorModelTestTurn(tutorDeps(owner), body));
}
