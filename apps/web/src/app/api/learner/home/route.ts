import { NextResponse } from "next/server";

import { ContentUnavailableError } from "@/data/source";
import { enforceRateLimit } from "@/lib/agent/guard";
import { LEARNER_RATE_LIMIT, requestOwner } from "@/lib/learner-api";
import { readHome } from "@/lib/home";

/**
 * `GET /api/learner/home`: Home as JSON (docs/proposals/home-page.md): the
 * threads to pick up, the next concept, the first reviews with the queue's
 * size, and the courses in progress. The same `HomeModel` the page renders,
 * from the same read. It was `GET /api/learner/today`; nothing outside this
 * repository called it.
 *
 * A read, so it degrades rather than fails: an unreachable database is a 200
 * with `reachable: false` and every list empty, exactly what the page shows.
 * Courses that are not flipped are not an outage, and the page shows its
 * error panel for them, so this answers a 503 naming the flip instead.
 * There is no same-origin check, because a browser sends no `Origin` on a
 * same-origin `GET` and every page already renders this data into its HTML;
 * the rate limit bounds a loop.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const limited = enforceRateLimit(req, "learner:home", LEARNER_RATE_LIMIT);
  if (limited !== null) return limited;
  // A 401 for a request with no owner, before the read that would need one.
  const owner = await requestOwner();
  if (owner instanceof NextResponse) return owner;
  let home;
  try {
    home = await readHome();
  } catch (error) {
    if (!(error instanceof ContentUnavailableError)) throw error;
    return NextResponse.json(
      { ok: false, error: error.message, code: "CONTENT_NOT_FLIPPED" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json({ ok: true, home }, { headers: { "Cache-Control": "no-store" } });
}
