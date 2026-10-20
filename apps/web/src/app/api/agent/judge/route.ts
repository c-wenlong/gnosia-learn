import { NextResponse } from "next/server";

import { tutorDeps, turnResponse } from "@/lib/agent/env";
import { CHAT_RATE_LIMIT, enforceRateLimit, enforceSameOrigin } from "@/lib/agent/guard";
import { isConceptSlug } from "@/lib/concept-workspace-core";
import { requestOwner } from "@/lib/learner-api";
import { CHAT_ANSWER_LIMIT, CHECK_QUESTION_LIMIT } from "@/lib/tutor-check";
import { judgeTurn } from "@self-learn/tutor/server/turns";

export const runtime = "nodejs";

/**
 * `POST /api/agent/judge` with `{ conceptSlug, question, answer }`: the
 * judge's verdict on one answer to a check the concept tutor asked in the
 * chat (R5 of docs/proposals/recall-in-chat.md).
 *
 * The chat page calls it beside `POST /api/agent/chat` when the learner
 * replies to a turn that carried a `CHECK:` marker, so the tutor's reply and
 * the verdict arrive independently and neither waits on the other. It writes
 * nothing: only the learner's tap writes, through `POST /api/learner/observe`.
 *
 * The turn itself — the workspace read, the judge prompt, the model chain and
 * the reply shape — is `judgeTurn` in `@self-learn/tutor/server`. This file
 * keeps the request-side guards and the validation that must answer before
 * the limiter is touched.
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
  const { conceptSlug, question, answer } = body as Record<string, unknown>;
  if (!isConceptSlug(conceptSlug)) return bad("conceptSlug must be a concept id (lowercase letters, digits and hyphens)");
  if (typeof question !== "string" || question.trim() === "" || question.length > CHECK_QUESTION_LIMIT) {
    return bad(`question must be the check the tutor asked, 1 to ${CHECK_QUESTION_LIMIT} characters`);
  }
  if (typeof answer !== "string" || answer.trim() === "" || answer.length > CHAT_ANSWER_LIMIT) {
    return bad(`answer must be the learner's reply, 1 to ${CHAT_ANSWER_LIMIT} characters`);
  }

  // Before the read, so an unknown slug is not a free way to spin the limiter.
  const limited = enforceRateLimit(req, "judge", CHAT_RATE_LIMIT);
  if (limited) return limited;

  return turnResponse(await judgeTurn(tutorDeps(owner), body));
}

function bad(error: string) {
  return NextResponse.json({ error, code: "BAD_REQUEST" }, { status: 400 });
}
