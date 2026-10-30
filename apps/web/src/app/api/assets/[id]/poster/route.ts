import { POSTER_CONTENT_TYPE } from "@gnosia/catalog/state";

import { posterSource } from "@/lib/asset-files";
import { lookupFailed, problemResponse, serveStoredWhole } from "@/lib/asset-response";
import { withLearnerStore } from "@/lib/learner-store";

/**
 * `GET /api/assets/<encodeURIComponent(asset.id)>/poster`: one still frame from
 * a video asset, as a JPEG.
 *
 * **The poster `catalog asset upload` stored, and nothing else**
 * (docs/CONTENT-MIGRATION.md, Track E). The upload cuts one frame per video on
 * the laptop with the recipe in `services/catalog/src/poster/recipe.ts` and
 * stores it as a blob, filed as a `poster` asset derived from the video. This
 * route finds it by that derivation (`posterSource` in `@/lib/asset-files`)
 * and serves it as the file route serves a blob: a redirect to a signed URL,
 * or streamed. A video with no stored poster is a 404 `not-uploaded`, and
 * anything that is not a video is a 404 `not-a-video`.
 *
 * Until phase 2 this route could also cut a frame itself with ffmpeg from the
 * video's file on this machine's disk, behind `ASSET_FILES_ENABLED`. That was
 * the legacy file branch, and it went with it: the server reads no files, and
 * the stored poster is the same picture.
 *
 * **Headers, and how they differ from the file route's.**
 *
 * | Header | Value | Why |
 * | --- | --- | --- |
 * | `Content-Type` | `image/jpeg` | The only thing this route ever produces. |
 * | `X-Content-Type-Options` | `nosniff` | The bytes come out of an encoder, but saying so twice costs nothing and the rule is the same one the file route keeps. |
 * | `Content-Security-Policy` | `default-src 'none'; sandbox` | A JPEG is not a document and runs nothing, so this is belt and braces rather than the load-bearing header it is beside an SVG. |
 * | `Content-Disposition` | `inline; filename="…"` | The point is an `<img>`. The name is the video's, with a `.jpg` on it, so a saved poster says which video it came from. |
 * | `ETag` | the object's sha256 | It changes when and only when the upload stores a different picture. |
 * | `Cache-Control` | `private, max-age=0, must-revalidate` | Unlike the file route, a poster *can* be revalidated cheaply, and a grid of thirty of them is the case worth it. |
 *
 * `Accept-Ranges` is absent on purpose: a poster is tens of kilobytes and there
 * is nothing to seek in it.
 */

export const runtime = "nodejs";

/**
 * Belt and braces for a format that carries no script. `sandbox` still drops a
 * direct navigation into an opaque origin, which costs an `<img>` embed nothing
 * because an image never consults this header at all.
 */
const POSTER_CSP = "default-src 'none'; script-src 'none'; sandbox";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  let target;
  try {
    target = await withLearnerStore((db) => posterSource(db, id));
  } catch (error) {
    // No owner is a 401; a database that cannot be asked is a 503.
    return lookupFailed("asset poster", error);
  }

  if (target.ok === false) return problemResponse(target);
  return serveStoredWhole(request, target, { contentType: POSTER_CONTENT_TYPE, csp: POSTER_CSP });
}
