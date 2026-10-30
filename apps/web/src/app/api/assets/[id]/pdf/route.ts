import { PDF_CONTENT_TYPE } from "@gnosia/catalog/state";

import { pdfSource } from "@/lib/asset-files";
import { lookupFailed, problemResponse, serveStoredWhole } from "@/lib/asset-response";
import { withLearnerStore } from "@/lib/learner-store";

/**
 * `GET /api/assets/<encodeURIComponent(asset.id)>/pdf`: a video's pages as a
 * PDF — one page per narration beat, frame plus the line it plays under.
 *
 * **The PDF `catalog asset upload` or `catalog video put` stored, and
 * nothing else.** Made on the laptop with the recipe in
 * `services/catalog/src/pdf/recipe.ts` and stored as a blob, filed as a
 * `pdf` asset derived from the video. This route finds it by that derivation
 * (`pdfSource` in `@/lib/asset-files`) and serves it as the file route
 * serves a blob: a redirect to a signed URL, or streamed. A video with no
 * stored PDF is a 404 `not-uploaded`, and anything that is not a video is a
 * 404 `not-a-video`.
 *
 * Served `inline` so the browser's own viewer opens it rather than saving
 * it: the point is a page you read instead of watching, and the bytes are
 * ours — made by the upload or put commands, never uploaded by anyone.
 */

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  let target;
  try {
    target = await withLearnerStore((db) => pdfSource(db, id));
  } catch (error) {
    // No owner is a 401; a database that cannot be asked is a 503.
    return lookupFailed("asset pdf", error);
  }

  if (target.ok === false) return problemResponse(target);
  // No CSP: a PDF under `sandbox` is refused the browser's viewer (S6-04).
  return serveStoredWhole(request, target, { contentType: PDF_CONTENT_TYPE });
}
