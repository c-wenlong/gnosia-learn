import { stat } from "node:fs/promises";

import { NextResponse } from "next/server";

import { assetFilesEnabled, resolveAssetFile, type AssetFileResult } from "@/lib/asset-files";
import {
  freshPosterFailure,
  posterTarget,
  resolveFfmpeg,
  type PosterTargetResult,
} from "@/lib/asset-posters";
import type { RouteProblemCode } from "@/lib/asset-problems";
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
 * knowable before render (the switch, the manimkc index, a file that is
 * already gone) is decided by the server component, and only a failure that
 * nothing predicted costs this round trip.
 *
 * **Why not the file route itself.** `HEAD` there gets a status and loses the
 * body, so it loses the code. `GET` there downloads the whole file whenever
 * the first failure was transient. On the poster route either one can start an
 * ffmpeg. This route runs the same resolver the other two do, stops before any
 * byte is read, and answers with a few bytes of JSON.
 *
 * **The answer.** `{ ok: true }` with a 200, or `{ ok: false, code }` with the
 * status the real route would have used, so `curl -i` on either reads the
 * same. There is deliberately no `detail`: this route exists to feed a page,
 * and a page shows categories, never a stored path.
 *
 * `?for=poster` adds the poster route's own answers, read off the poster cache
 * rather than by running ffmpeg again:
 *
 * | Cache holds | Answer |
 * | --- | --- |
 * | the poster | `ok`, which the card reads as "served, but not shown" |
 * | a fresh failure marker | `poster-failed`: ffmpeg really found no frame |
 * | neither, no ffmpeg | `no-ffmpeg` |
 * | neither | `poster-not-made`, retryable |
 *
 * The last row is deliberately not `poster-failed`. An empty cache is also
 * what a first load cut short by a timeout, a pruned cache or a fresh temp
 * directory after a reboot looks like, and absence cannot tell those from a
 * video with no frame. Only a marker, written when every offset exited cleanly
 * with nothing, is evidence (`POSTER_FAILURE_EXTENSION` in `@/lib/asset-posters`).
 *
 * Same gate as the routes it describes: with `ASSET_FILES_ENABLED` off every
 * answer is `files-off`, which is exactly as much as the file route says.
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
  if (!assetFilesEnabled()) return answer(404, "files-off");

  const { id } = await params;
  const forPoster = new URL(request.url).searchParams.get("for") === "poster";

  let resolved: PosterTargetResult | AssetFileResult;
  try {
    resolved = await withLearnerStore<PosterTargetResult | AssetFileResult>((db) =>
      forPoster ? posterTarget(db, id) : resolveAssetFile(db, id),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`asset status: catalog unreachable: ${message}`);
    return answer(503, "catalog-unreachable");
  }

  if (resolved.ok === false) return answer(resolved.status, resolved.code);
  if ("cacheFile" in resolved) {
    const cached = await stat(resolved.cacheFile).then(
      (stats) => stats.size > 0,
      () => false,
    );
    if (!cached) {
      if (await freshPosterFailure(resolved.failureFile)) return answer(503, "poster-failed");
      if ((await resolveFfmpeg()) === null) return answer(503, "no-ffmpeg");
      return answer(503, "poster-not-made");
    }
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
