import { NextResponse } from "next/server";

import { tutorDeps, turnResponse } from "@/lib/agent/env";
import { guard, readBody } from "@/lib/provider-keys/requests";
import { MODEL_LIST_RATE_LIMIT } from "@/lib/tutor-models/requests";
import { modelListTurn } from "@gnosia/tutor/server/turns";

export const runtime = "nodejs";

/**
 * `POST { provider }`: the models that provider lists, for Settings' Add a
 * model (docs/TUTOR-MODELS.md, T2). Fetched on the server from the provider's
 * configured base URL, which no request can change, with the key the tutor
 * would use; the key never reaches the browser.
 *
 * The call and its reply are `modelListTurn` in `@gnosia/tutor/server`,
 * which the native sidecar calls over the same contract. A POST rather than a
 * GET so the same-origin check applies: a browser sends no `Origin` on a
 * same-origin GET.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const owner = await guard(req, "models", MODEL_LIST_RATE_LIMIT, "tutor-model");
  if (owner instanceof NextResponse) return owner;
  const body = await readBody(req);
  if (body instanceof NextResponse) return body;

  return turnResponse(await modelListTurn(tutorDeps(owner), body));
}
