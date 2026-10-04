import { NextResponse } from "next/server";

import { enforceRateLimit } from "@/lib/agent/guard";
import { LEARNER_RATE_LIMIT, MAX_ID_CHARS } from "@/lib/learner-api";
import { readReviewSession } from "@/lib/review-queue";

/**
 * `GET /api/review/due[?concept=<slug>]`: the cards due now, as the review page
 * renders them, plus the next due instant.
 *
 * `{ ok: true, reachable, items, nextDue }`, where each item is a `ReviewItem`
 * from `@/lib/review-core`: the concept's title, summary and domain, how many
 * check blocks its note holds, the card built from the first one (a
 * multiple-choice check or a recall prompt), the SM-2 state, and the interval
 * each of the four ratings would give. `?concept=` puts that concept first,
 * due or not (a link such as `/review?concept=<slug>`; the concept page's
 * Review now button that made one was removed on 2026-10-05).
 *
 * A read, so it degrades rather than fails: an unreachable database is a 200
 * with `reachable: false` and no items, the same answer the page renders.
 * Rate-limited like the learner routes, since every call reads each due note
 * off disk. There is no same-origin check: a browser sends no `Origin` on a
 * same-origin GET, and a cross-origin page cannot read the answer anyway,
 * since nothing here sets a CORS header.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const limited = enforceRateLimit(req, "review:due", LEARNER_RATE_LIMIT);
  if (limited !== null) return limited;

  const focus = new URL(req.url).searchParams.get("concept");
  if (focus !== null && (focus === "" || focus.length > MAX_ID_CHARS)) {
    return NextResponse.json(
      { ok: false, error: `"concept" must be a concept id.`, code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  const session = await readReviewSession(focus);
  return NextResponse.json(
    { ok: true, ...session },
    { headers: { "Cache-Control": "no-store" } },
  );
}
