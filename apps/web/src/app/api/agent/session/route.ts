import { NextResponse } from "next/server";

import { tutorDeps, turnResponse } from "@/lib/agent/env";
import { CHAT_RATE_LIMIT, enforceRateLimit, enforceSameOrigin } from "@/lib/agent/guard";
import { AGENT_BODY_LIMITS, readAgentBody } from "@/lib/agent/body";
import { requestOwner } from "@/lib/learner-api";
import { sessionQuestionTurn, validateSessionBody } from "@gnosia/tutor/server/turns";

export const runtime = "nodejs";

/**
 * `POST /api/agent/session` with `{ conceptSlug, step, avoid? }`: one
 * structured question for the concept workspace's session flow — `probe` the
 * opener, `check` the retention check — generated on the server so the
 * workspace's own notes and checks shape it.
 *
 * The turn itself — the workspace read, the prompt, the model chain and the
 * parsed question — is `sessionQuestionTurn` in `@gnosia/tutor/server`.
 * This file keeps the request-side guards, and answers the turn's own
 * validation (`validateSessionBody`) before the limiter is touched.
 */
export async function POST(req: Request) {
  const crossOrigin = enforceSameOrigin(req);
  if (crossOrigin) return crossOrigin;
  const owner = await requestOwner();
  if (owner instanceof NextResponse) return owner;

  const read = await readAgentBody(req, AGENT_BODY_LIMITS.session);
  if (read instanceof NextResponse) return read;
  const { body } = read;
  // The turn's own rules, before the limiter: a body the turn would refuse spends no token.
  const refused = validateSessionBody(body);
  if (refused) return turnResponse(refused);

  // Before the read, so an unknown slug is not a free way to spin the limiter.
  const limited = enforceRateLimit(owner, "session", CHAT_RATE_LIMIT);
  if (limited) return limited;

  return turnResponse(await sessionQuestionTurn(tutorDeps(owner), body));
}
