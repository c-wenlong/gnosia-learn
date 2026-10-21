import { POSTER_CONTENT_TYPE } from "@gnosia/catalog/state";
import { NextResponse } from "next/server";

import {
  blobStoreProblem,
  openBlob,
  posterSource,
  webStreamFrom,
  type AssetFileProblem,
  type AssetStored,
} from "@/lib/asset-files";
import { assetBlobStore, SIGNED_URL_TTL_SECONDS } from "@/lib/blob-store";
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
export const POSTER_CSP = "default-src 'none'; script-src 'none'; sandbox";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  let target;
  try {
    target = await withLearnerStore((db) => posterSource(db, id));
  } catch (error) {
    // A read that cannot reach the database degrades and says so
    // (ARCHITECTURE.md rule 14). There is no degraded version of a picture, so
    // what it degrades to is an honest 503.
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`asset poster: catalog unreachable: ${message}`);
    return NextResponse.json(
      {
        error: "The catalog is unreachable.",
        code: "catalog-unreachable",
        detail: "Could not look this asset up.",
      },
      { status: 503 },
    );
  }

  if (target.ok === false) return problem(target);
  return serveStored(request, target);
}

function problem(p: AssetFileProblem): Response {
  return NextResponse.json({ error: p.error, code: p.code, detail: p.detail }, { status: p.status });
}

function posterHeaders(filename: string, etag: string): Record<string, string> {
  return {
    "Content-Type": POSTER_CONTENT_TYPE,
    "Content-Disposition": `inline; filename="${filename}"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": POSTER_CSP,
    "Cache-Control": "private, max-age=0, must-revalidate",
    ETag: etag,
  };
}

/**
 * The stored poster. Its tag is the object's sha256, so it changes exactly when
 * the upload stores a different picture, and a grid revalidating thirty of
 * them costs thirty 304s and no reads. A signed URL is a 302 with `no-store`,
 * as in the file route; otherwise the whole object is streamed, since a poster
 * is tens of kilobytes and there is nothing to seek in it.
 */
async function serveStored(request: Request, stored: AssetStored): Promise<Response> {
  const etag = `"${stored.sha256}"`;
  const headers = posterHeaders(stored.filename, etag);
  if (matchesEtag(request.headers.get("if-none-match"), etag)) {
    return new Response(null, { status: 304, headers });
  }
  try {
    const url = await assetBlobStore().signedUrl(stored.key, SIGNED_URL_TTL_SECONDS);
    if (url !== null) {
      return new Response(null, {
        status: 302,
        headers: { Location: url, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
      });
    }
    const read = await openBlob(stored.key);
    return new Response(webStreamFrom(read.body), {
      status: 200,
      headers: { ...headers, "Content-Length": String(read.size) },
    });
  } catch (error) {
    return problem(blobStoreProblem(error));
  }
}

/**
 * Does `If-None-Match` name this tag?
 *
 * The header is a comma-separated list, `*` matches anything, and a browser
 * that revalidates a response it received compressed sends the tag back with a
 * `W/` on it. Comparing the whole header against one tag would miss all three
 * and re-send a picture the client already has, every time.
 */
function matchesEtag(header: string | null, etag: string): boolean {
  if (header === null) return false;
  const strip = (tag: string) => (tag.startsWith("W/") ? tag.slice(2) : tag);
  return header
    .split(",")
    .map((tag) => strip(tag.trim()))
    .some((tag) => tag === "*" || tag === strip(etag));
}
