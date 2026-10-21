import { NextResponse } from "next/server";
import {
  CHAT_RATE_LIMIT,
  enforcePayloadBounds,
  enforceRateLimit,
  enforceSameOrigin,
} from "@/lib/agent/guard";
import { tutorDeps, turnResponse } from "@/lib/agent/env";
import { chatTurn, type ChatBody } from "@gnosia/tutor/server/turns";
import { requestOwner } from "@/lib/learner-api";

export const runtime = "nodejs";

/**
 * `POST /api/agent/chat`. One of four shapes, dispatched on the body: the
 * topic tutor sends `courseSlug`, `moduleSlug` and `topicId`; the concept
 * tutor sends `conceptSlug`; the open tutor sends `subject`; Ask on a library
 * asset sends `assetId`. The turn itself — validation, prompt, the model
 * chain, the response shape — is `chatTurn` in `@gnosia/tutor/server`,
 * which the native sidecar calls over the same contract. This file keeps the
 * request-side guards (origin, rate limit, the owner the session resolves)
 * and maps the plain reply onto `NextResponse`.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const refused = enforceSameOrigin(req) ?? enforceRateLimit(req, "agent:chat", CHAT_RATE_LIMIT);
  if (refused) return refused;
  const owner = await requestOwner();
  if (owner instanceof NextResponse) return owner;

  const body = (await req.json().catch(() => null)) as ChatBody | null;
  if (body === null || typeof body !== "object" || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: "The body must be a JSON object with a messages array" }, { status: 400 });
  }
  const tooLarge = enforcePayloadBounds(body.messages, typeof body.learnerNote === "string" ? body.learnerNote : undefined);
  if (tooLarge) return tooLarge;

  return turnResponse(await chatTurn(tutorDeps(owner), body));
}
