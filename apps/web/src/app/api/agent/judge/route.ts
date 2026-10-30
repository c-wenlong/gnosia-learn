import { NextResponse } from "next/server";

import { tutorDeps, turnResponse } from "@/lib/agent/env";
import { AGENT_BODY_LIMITS, CHAT_RATE_LIMIT, enforceRateLimit, enforceSameOrigin, readAgentBody } from "@/lib/agent/guard";
import { requestOwner } from "@/lib/learner-api";
import { judgeTurn, validateJudgeBody } from "@gnosia/tutor/server/turns";

export const runtime = "nodejs";

/**
 * `POST /api/agent/judge` with `{ conceptSlug, question, answer, commitment? }`:
 * the judge's verdict on one answer to a check the concept tutor asked in the
 * chat (R5 of docs/proposals/recall-in-chat.md). A recall check sends the
 * answer its tutor committed to as `commitment`, the judge's first reference
 * (docs/proposals/structured-checks.md, phase 2).
 *
 * The chat page calls it beside `POST /api/agent/chat` when the learner
 * replies to a turn that carried a `CHECK:` marker, so the tutor's reply and
 * the verdict arrive independently and neither waits on the other. It writes
 * nothing: only the learner's tap writes, through `POST /api/learner/observe`.
 *
 * The turn itself — the workspace read, the judge prompt, the model chain and
 * the reply shape — is `judgeTurn` in `@gnosia/tutor/server`. This file
 * keeps the request-side guards, and answers the turn's own validation
 * (`validateJudgeBody`) before the limiter is touched.
 */
export async function POST(req: Request) {
  const crossOrigin = enforceSameOrigin(req);
  if (crossOrigin) return crossOrigin;
  const owner = await requestOwner();
  if (owner instanceof NextResponse) return owner;

  const read = await readAgentBody(req, AGENT_BODY_LIMITS.judge);
  if (read instanceof NextResponse) return read;
  const { body } = read;
  // The turn's own rules, before the limiter: a malformed body spends no token.
  const refused = validateJudgeBody(body);
  if (refused) return turnResponse(refused);

  // Before the read, so an unknown slug is not a free way to spin the limiter.
  const limited = enforceRateLimit(owner, "judge", CHAT_RATE_LIMIT);
  if (limited) return limited;

  return turnResponse(await judgeTurn(tutorDeps(owner), body));
}
