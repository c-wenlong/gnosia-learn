import { NextResponse } from "next/server";
import { readEvents, readLearnerSnapshot } from "@self-learn/catalog/state";

import { enforceRateLimit } from "@/lib/agent/guard";
import { LEARNER_RATE_LIMIT } from "@/lib/learner-api";
import { withLearnerStore } from "@/lib/learner-store";

/**
 * `GET /api/learner/export`: everything the learner has recorded, as one JSON
 * file to keep. The snapshot (ticks, notes, recaps, preferences as the app
 * reads them) plus the whole event log, which is the evidence mastery and the
 * review schedule are replayed from. Settings links here.
 *
 * Unlike the page reads this does not degrade: an export that quietly came
 * back empty because the database was down would be a backup of nothing, so
 * an unreachable database is a 503 with the write routes' code.
 *
 * `Content-Disposition: attachment` makes the link a download rather than a
 * page of JSON. No same-origin check, for the reason `today/route.ts` gives:
 * the browser sends no `Origin` on a plain link, and a cross-site page cannot
 * read the response without CORS headers, which this route never sends.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const limited = enforceRateLimit(req, "learner:export", LEARNER_RATE_LIMIT);
  if (limited !== null) return limited;

  const exportedAt = new Date();
  let body: { learner: unknown; events: unknown[] };
  try {
    body = await withLearnerStore(async (db) => {
      const [learner, events] = await Promise.all([readLearnerSnapshot(db), readEvents(db)]);
      return { learner, events };
    });
  } catch (error) {
    // The driver's message is logged, not returned: it is the failed SQL.
    console.warn(`learner export failed: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { ok: false, error: "Not exported: the database is unreachable.", code: "STORE_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const stamp = exportedAt.toISOString().slice(0, 10);
  return NextResponse.json(
    { format: "self-learn-export", version: 1, exportedAt: exportedAt.toISOString(), ...body },
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="self-learn-${stamp}.json"`,
      },
    },
  );
}
