import { NextResponse } from "next/server";

import { enforceRateLimit } from "@/lib/agent/guard";
import { LEARNER_RATE_LIMIT, requestOwner } from "@/lib/learner-api";
import { readToday } from "@/lib/today";

/**
 * `GET /api/learner/today`: the Today dashboard as JSON (DESIGN.md, "API
 * changes"): the next concept, the first reviews due with the queue's size,
 * the recent activity rows, the streak and target, and the courses in
 * progress. The same `TodayModel` the page renders, from the same read.
 *
 * A read, so it degrades rather than fails: an unreachable database is a 200
 * with `reachable: false` and every list empty, exactly what the page shows.
 * There is no same-origin check, because a browser sends no `Origin` on a
 * same-origin `GET` and every page already renders this data into its HTML;
 * the rate limit bounds a loop.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const limited = enforceRateLimit(req, "learner:today", LEARNER_RATE_LIMIT);
  if (limited !== null) return limited;
  // A 401 for a request with no owner, before the read that would need one.
  const owner = await requestOwner();
  if (owner instanceof NextResponse) return owner;
  const today = await readToday();
  return NextResponse.json({ ok: true, today }, { headers: { "Cache-Control": "no-store" } });
}
