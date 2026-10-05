import { NextResponse } from "next/server";
import { conversationMade } from "@self-learn/catalog/state";

import { enforceRateLimit } from "@/lib/agent/guard";
import { isDraftId } from "@/lib/conversation-made";
import { LEARNER_RATE_LIMIT, requestOwner } from "@/lib/learner-api";
import { catalogDatabase } from "@/lib/learner-store";
import { ownerScope } from "@/lib/owner";
import { requireStudio } from "@/lib/studio";

/**
 * `GET /studio/made/<draft>`: the assets a studio conversation made, newest
 * first, for its deliverable cards and its "Everything made in this
 * conversation" list (D89 of docs/STUDIO-CHAT-FIRST.md).
 *
 * A read of the catalog, not of the runner: the runner holds the jobs, but an
 * asset is what landed in the database, and a conversation reopened next
 * month still shows its cards. So it is the app's own route, beside the
 * runner's proxy rather than through it, and it reads as the signed-in owner
 * (`conversationMade` scopes every hop to them and the commons).
 *
 * It degrades as `GET /api/learner/recent` does: a database that cannot be
 * reached is a 200 with `reachable: false` and no items, so the panel draws
 * the conversation without its cards rather than an error.
 */
export async function GET(req: Request, { params }: { params: Promise<{ draft: string }> }): Promise<NextResponse> {
  requireStudio();
  const limited = enforceRateLimit(req, "studio:made", LEARNER_RATE_LIMIT);
  if (limited !== null) return limited;
  const owner = await requestOwner();
  if (owner instanceof NextResponse) return owner;
  const { draft } = await params;
  if (!isDraftId(draft)) {
    return NextResponse.json({ ok: false, error: "Not a conversation id.", code: "BAD_REQUEST" }, { status: 400 });
  }
  const headers = { "Cache-Control": "no-store" };
  try {
    const made = await conversationMade(await catalogDatabase(), draft, ownerScope(owner));
    return NextResponse.json({ ok: true, reachable: true, made }, { headers });
  } catch (error) {
    // Logged by code only: a drizzle error's message carries the statement and its parameters.
    console.warn(`studio made: the catalog read failed (${failureCode(error)})`);
    return NextResponse.json({ ok: true, reachable: false, made: [] }, { headers });
  }
}

/** The driver's code down the `cause` chain, or the error's name. */
function failureCode(error: unknown): string {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && typeof current === "object"; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && code !== "") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return error instanceof Error ? error.name : "unknown";
}
