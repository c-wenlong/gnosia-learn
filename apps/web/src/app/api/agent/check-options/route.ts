import { NextResponse } from "next/server";

import { tutorDeps, turnResponse } from "@/lib/agent/env";
import { AGENT_BODY_LIMITS, CHAT_RATE_LIMIT, enforceRateLimit, enforceSameOrigin, readAgentBody } from "@/lib/agent/guard";
import { requestOwner } from "@/lib/learner-api";
import { checkOptionsTurn, validateCheckOptionsBody } from "@gnosia/tutor/server/turns";

export const runtime = "nodejs";

/**
 * `POST /api/agent/check-options` with `{ conceptSlug, checkId }`: the three
 * wrong options the tutor model writes for one of a note's own checks, once
 * per check and stored per owner (docs/LEARN.md, "Wrong options"). The
 * session and the week check ask for them when a question's options are
 * still the ones made from the notes, and keep those when this refuses.
 *
 * The turn itself (the stored row, the prompt, the model chain, the parser,
 * the one generation per check at a time) is `checkOptionsTurn` in
 * `@gnosia/tutor/server`. This file keeps the request-side guards, as the
 * session question's route does, and answers the turn's own validation
 * before the limiter is touched.
 */
export async function POST(req: Request) {
  const crossOrigin = enforceSameOrigin(req);
  if (crossOrigin) return crossOrigin;
  const owner = await requestOwner();
  if (owner instanceof NextResponse) return owner;

  const read = await readAgentBody(req, AGENT_BODY_LIMITS.checkOptions);
  if (read instanceof NextResponse) return read;
  const { body } = read;
  const refused = validateCheckOptionsBody(body);
  if (refused) return turnResponse(refused);

  // Before the read, so an unknown slug is not a free way to spin the limiter.
  const limited = enforceRateLimit(owner, "check-options", CHAT_RATE_LIMIT);
  if (limited) return limited;

  return turnResponse(await checkOptionsTurn(tutorDeps(owner), body));
}
