import { NextResponse } from "next/server";

import { tutorDeps, turnResponse } from "@/lib/agent/env";
import {
  enforcePayloadBounds,
  enforceRateLimit,
  enforceSameOrigin,
  SUMMARIZE_RATE_LIMIT,
} from "@/lib/agent/guard";
import { requestOwner } from "@/lib/learner-api";
import { summarizeTurn, type SummarizeBody } from "@gnosia/tutor/server/turns";

export const runtime = "nodejs";

/**
 * `POST /api/agent/summarize` with `{ courseSlug, moduleSlug, topicId,
 * messages }`: the topic transcript condensed into the recap the learner
 * keeps (docs/proposals/recall-in-chat.md's session end). It writes nothing;
 * the page saves what it returns through `POST /api/learner/recap`.
 *
 * The turn itself — the topic read, the recap prompt, the model chain and the
 * parsed knowledge — is `summarizeTurn` in `@gnosia/tutor/server`. This
 * file keeps the request-side guards (origin, payload bounds, the tighter
 * rate limit) and the validation that must answer before the limiter is
 * touched.
 */
export async function POST(req: Request) {
  // Cheapest first, so a refused request never costs a provider call.
  const crossOrigin = enforceSameOrigin(req);
  if (crossOrigin) return crossOrigin;
  const owner = await requestOwner();
  if (owner instanceof NextResponse) return owner;

  let body: SummarizeBody;
  try {
    body = (await req.json()) as SummarizeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { courseSlug, moduleSlug, topicId, messages } = body ?? {};
  if (!courseSlug || !moduleSlug || !topicId || !Array.isArray(messages)) {
    return NextResponse.json(
      { error: "courseSlug, moduleSlug, topicId, and messages are required" },
      { status: 400 },
    );
  }

  const tooLarge = enforcePayloadBounds(messages);
  if (tooLarge) return tooLarge;

  // Before the topic lookup on purpose: otherwise a caller could spin the
  // limiter for free by varying the slugs and collecting 404s.
  const rateLimited = enforceRateLimit(owner, "summarize", SUMMARIZE_RATE_LIMIT);
  if (rateLimited) return rateLimited;

  return turnResponse(await summarizeTurn(tutorDeps(owner), body));
}
