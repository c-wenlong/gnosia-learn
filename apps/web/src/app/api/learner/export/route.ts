import { NextResponse } from "next/server";
import { readEvents, readLearnerSnapshot, readPreferences, readTutorModels } from "@self-learn/catalog/state";

import { enforceRateLimit } from "@/lib/agent/guard";
import { LEARNER_RATE_LIMIT, requestOwner } from "@/lib/learner-api";
import { withLearnerStore } from "@/lib/learner-store";

/**
 * `GET /api/learner/export`: everything the learner has recorded, as one JSON
 * file to keep. The snapshot (ticks, notes, recaps, and the preferences it
 * folds in), every preference row as stored (the snapshot only carries the
 * handful the old document had, so the daily target, the leeway and the
 * tutor style would otherwise be missing), and the whole event log, which is
 * the evidence mastery and the review schedule are replayed from. Settings
 * links here. The tutor's model chain comes too (docs/TUTOR-MODELS.md, T6):
 * owner configuration like the tutor style, and no secret. The provider keys
 * never do (docs/BYOK.md, D11).
 *
 * Unlike the page reads this does not degrade: an export that quietly came
 * back empty because the database was down would be a backup of nothing, so
 * an unreachable database is a 503 with the write routes' code.
 *
 * `Content-Disposition: attachment` makes the link a download rather than a
 * page of JSON. No same-origin check, for the reason `home/route.ts` gives:
 * the browser sends no `Origin` on a plain link, and a cross-site page cannot
 * read the response without CORS headers, which this route never sends.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const limited = enforceRateLimit(req, "learner:export", LEARNER_RATE_LIMIT);
  if (limited !== null) return limited;

  const owner = await requestOwner();
  if (owner instanceof NextResponse) return owner;

  const exportedAt = new Date();
  let body: {
    learner: unknown;
    preferences: Record<string, unknown>;
    tutorModels: { provider: string; model: string }[];
    events: unknown[];
  };
  try {
    body = await withLearnerStore(async (db) => {
      const [learner, preferences, chain, events] = await Promise.all([
        readLearnerSnapshot(db, owner),
        readPreferences(db, owner),
        readTutorModels(db, owner),
        readEvents(db, owner),
      ]);
      return { learner, preferences, tutorModels: chain.map(({ provider, model }) => ({ provider, model })), events };
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
