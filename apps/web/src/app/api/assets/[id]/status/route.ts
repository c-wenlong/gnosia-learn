import { NextResponse } from "next/server";

import { posterSource, resolveAsset, type AssetSourceResult } from "@/lib/asset-files";
import type { RouteProblemCode } from "@/lib/asset-problems";
import { refuseWithoutOwner } from "@/lib/learner-api";
import { withLearnerStore } from "@/lib/learner-store";

/**
 * `GET /api/assets/<encodeURIComponent(asset.id)>/status[?for=poster]`: why the
 * file route (or the poster route) would refuse this asset, without sending
 * the asset.
 *
 * **Who asks.** A video, a diagram, a card thumbnail or a note embed whose
 * element fired `onError`. That event carries no status and no body, so the
 * component asks here and maps the `code` it gets back to a sentence and a fix
 * (`@/lib/asset-problems`). The page never asks before a failure: anything
 * knowable before render (an asset that was never uploaded, a type that is
 * not flipped) is decided by the server component, and only a failure that
 * nothing predicted costs this round trip.
 *
 * **Why not the file route itself.** `HEAD` there gets a status and loses the
 * body, so it loses the code. `GET` there downloads the whole file whenever
 * the first failure was transient. This route runs the same resolver the
 * other two do, stops before any byte is read, and answers with a few bytes
 * of JSON.
 *
 * **The answer.** `{ ok: true }` with a 200, or `{ ok: false, code }` with the
 * status the real route would have used, so `curl -i` on either reads the
 * same. There is deliberately no `detail`: this route exists to feed a page,
 * and a page shows categories, never a stored path. `?for=poster` asks the
 * poster route's resolver (`posterSource`) instead.
 */

export const runtime = "nodejs";

function answer(status: number, code: RouteProblemCode): Response {
  return NextResponse.json(
    { ok: false, code },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const anonymous = await refuseWithoutOwner();
  if (anonymous !== null) return anonymous;
  const { id } = await params;
  const forPoster = new URL(request.url).searchParams.get("for") === "poster";

  let resolved: AssetSourceResult;
  try {
    resolved = await withLearnerStore<AssetSourceResult>((db) =>
      forPoster ? posterSource(db, id) : resolveAsset(db, id),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`asset status: catalog unreachable: ${message}`);
    return answer(503, "catalog-unreachable");
  }

  if (resolved.ok === false) return answer(resolved.status, resolved.code);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
