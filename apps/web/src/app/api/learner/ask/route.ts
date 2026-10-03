import { NextResponse } from "next/server";

import { enforceRateLimit } from "@/lib/agent/guard";
import { readAskEntries } from "@/lib/ask";
import { MAX_ASK_QUERY, rankAsk } from "@/lib/ask-core";
import { requestOwner } from "@/lib/learner-api";

/**
 * `GET /api/learner/ask?q=`: what Home's Ask box lists for a query, best first
 * (docs/proposals/home-page.md, part 1). Titles of the owner's concepts and
 * the commons', of courses and modules, and of library videos.
 *
 * A read, so it degrades: a source that cannot be read adds nothing rather
 * than failing the request. No same-origin check, for the reason
 * `home/route.ts` gives; the rate limit bounds a loop. It is four times the
 * learner routes' own, since the box asks as the owner types.
 */
const ASK_RATE_LIMIT = { limit: 240, windowMs: 60_000 };

export async function GET(req: Request): Promise<NextResponse> {
  const limited = enforceRateLimit(req, "learner:ask", ASK_RATE_LIMIT);
  if (limited !== null) return limited;
  const owner = await requestOwner();
  if (owner instanceof NextResponse) return owner;

  const query = (new URL(req.url).searchParams.get("q") ?? "").slice(0, MAX_ASK_QUERY);
  const results = query.trim().length < 2 ? [] : rankAsk(query, await readAskEntries());
  return NextResponse.json({ ok: true, results }, { headers: { "Cache-Control": "no-store" } });
}
