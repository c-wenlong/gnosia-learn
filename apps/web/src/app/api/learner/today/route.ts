import { NextResponse } from "next/server";

import { ContentUnavailableError } from "@/data/source";
import { enforceRateLimit } from "@/lib/agent/guard";
import { LEARNER_RATE_LIMIT } from "@/lib/learner-api";
import { readToday } from "@/lib/today";

/**
 * `GET /api/learner/today`: the Today dashboard as JSON (DESIGN.md, "API
 * changes"): the next concept, the first reviews due with the queue's size,
 * the recent activity rows, the streak and target, and the courses in
 * progress. The same `TodayModel` the page renders, from the same read.
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
  const limited = enforceRateLimit(req, "learner:today", LEARNER_RATE_LIMIT);
  if (limited !== null) return limited;
  let today;
  try {
    today = await readToday();
  } catch (error) {
    if (!(error instanceof ContentUnavailableError)) throw error;
    return NextResponse.json(
      { ok: false, error: error.message, code: "CONTENT_NOT_FLIPPED" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json({ ok: true, today }, { headers: { "Cache-Control": "no-store" } });
}
