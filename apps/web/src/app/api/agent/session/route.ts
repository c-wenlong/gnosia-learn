import { NextResponse } from "next/server";

import { tutorDeps, turnResponse } from "@/lib/agent/env";
import { CHAT_RATE_LIMIT, enforceRateLimit, enforceSameOrigin } from "@/lib/agent/guard";
import { isConceptSlug } from "@/lib/concept-workspace-core";
import { requestOwner } from "@/lib/learner-api";
import { sessionQuestionTurn } from "@gnosia/tutor/server/turns";

export const runtime = "nodejs";

/** The most questions a caller may ask the generator to avoid repeating. */
const MAX_AVOID = 12;

/**
 * `POST /api/agent/session` with `{ conceptSlug, step, avoid? }`: one
 * structured question for the concept workspace's session flow — `probe` the
 * opener, `check` the retention check — generated on the server so the
 * workspace's own notes and checks shape it.
 *
 * The turn itself — the workspace read, the prompt, the model chain and the
 * parsed question — is `sessionQuestionTurn` in `@gnosia/tutor/server`.
 * This file keeps the request-side guards and the validation that must
 * answer before the limiter is touched.
 */
export async function POST(req: Request) {
  const crossOrigin = enforceSameOrigin(req);
  if (crossOrigin) return crossOrigin;
  const owner = await requestOwner();
  if (owner instanceof NextResponse) return owner;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) return bad("The body must be a JSON object");
  const { conceptSlug, step, avoid } = body as Record<string, unknown>;
  if (!isConceptSlug(conceptSlug)) return bad("conceptSlug must be a concept id (lowercase letters, digits and hyphens)");
  if (step !== "probe" && step !== "check") return bad('step must be "probe" or "check"');
  if (avoid !== undefined && (!Array.isArray(avoid) || avoid.length > MAX_AVOID || avoid.some((q) => typeof q !== "string"))) {
    return bad(`avoid must be a list of at most ${MAX_AVOID} questions`);
  }

  // Before the read, so an unknown slug is not a free way to spin the limiter.
  const limited = enforceRateLimit(owner, "session", CHAT_RATE_LIMIT);
  if (limited) return limited;

  return turnResponse(await sessionQuestionTurn(tutorDeps(owner), body));
}

function bad(error: string) {
  return NextResponse.json({ error, code: "BAD_REQUEST" }, { status: 400 });
}
