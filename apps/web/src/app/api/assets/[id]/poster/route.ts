import { NextResponse } from "next/server";

import { assetFilesEnabled } from "@/lib/asset-files";
import { POSTER_CONTENT_TYPE, posterBody, posterTarget } from "@/lib/asset-posters";
import { withLearnerStore } from "@/lib/learner-store";

/**
 * `GET /api/assets/<encodeURIComponent(asset.id)>/poster`: one still frame from
 * a video asset, as a JPEG.
 *
 * Thirty video cards in `/library` show a grey "No poster" placeholder because
 * no poster exists anywhere: manimkc does not write one, so the catalog has no
 * row to point at, and adding one there would be a commit in a submodule and a
 * second pull request. The frame is made here instead, from the `.mp4` the
 * sibling file route already knows how to find.
 *
 * **This route decides nothing about paths.** The id is a primary key, handed
 * to `resolveAssetFile` in `@/lib/asset-files` exactly as the file route hands
 * it: same lookup, same root selection, same containment checks on both sides
 * of `realpath`, same closed content-type list, same refusals with the same
 * status codes. The frame rule, the cache and the ffmpeg invocation are in
 * `@/lib/asset-posters`, with the reasoning for each choice.
 *
 * **Only a video.** A note, a caption track, a transcript, a diagram or a link
 * is a 404 before ffmpeg is looked for, let alone run.
 *
 * **Headers, and how they differ from the file route's.**
 *
 * | Header | Value | Why |
 * | --- | --- | --- |
 * | `Content-Type` | `image/jpeg` | The only thing this route ever produces. |
 * | `X-Content-Type-Options` | `nosniff` | The bytes come out of an encoder, but saying so twice costs nothing and the rule is the same one the file route keeps. |
 * | `Content-Security-Policy` | `default-src 'none'; sandbox` | A JPEG is not a document and runs nothing, so this is belt and braces rather than the load-bearing header it is beside an SVG. |
 * | `Content-Disposition` | `inline; filename="…"` | The point is an `<img>`. The name is the video's, with a `.jpg` on it, so a saved poster says which video it came from. |
 * | `ETag` | the cache key | The key covers the file, its size, its modification time and the recipe version, so it changes when and only when the picture would. |
 * | `Cache-Control` | `private, max-age=0, must-revalidate` | Unlike the file route, a poster *can* be revalidated cheaply, and a grid of thirty of them is the case worth it. A re-render still busts it, because the tag moves. |
 *
 * `Accept-Ranges` is absent on purpose: a poster is tens of kilobytes and there
 * is nothing to seek in it.
 *
 * **Off unless a machine opts in**, on the same `ASSET_FILES_ENABLED` switch as
 * the file route. A deployment with no videos to read has no frames to extract,
 * and one gate for one class of request is easier to reason about than two.
 *
 * **A failure here is ordinary.** No ffmpeg, an unreadable file, a video that
 * is somehow all seek errors: each is a 503 that names its reason, never a 500
 * and never a hung request. The card's placeholder is the correct fallback, and
 * it is what a browser shows for an image that did not load.
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
  if (!assetFilesEnabled()) {
    // Worded exactly as the file route words it: on a deployment this route
    // does not exist, and a second phrasing would only advertise the switch.
    return NextResponse.json(
      { error: "Not found.", code: "files-off", detail: "Asset files are not served by this deployment." },
      { status: 404 },
    );
  }

  const { id } = await params;

  let target;
  try {
    target = await withLearnerStore((db) => posterTarget(db, id));
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

  if (target.ok === false) {
    return NextResponse.json(
      { error: target.error, code: target.code, detail: target.detail },
      { status: target.status },
    );
  }

  const etag = `"${target.key}"`;
  const headers: Record<string, string> = {
    "Content-Type": POSTER_CONTENT_TYPE,
    "Content-Disposition": `inline; filename="${target.filename}"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": POSTER_CSP,
    "Cache-Control": "private, max-age=0, must-revalidate",
    ETag: etag,
  };

  // Answered before the cache is read and long before ffmpeg is looked for: a
  // browser that sends this tag back already has the picture, and the tag only
  // matches if the video has not changed since.
  if (matchesEtag(request.headers.get("if-none-match"), etag)) {
    return new Response(null, { status: 304, headers });
  }

  const poster = await posterBody(target);
  if (poster.ok === false) {
    return NextResponse.json(
      { error: poster.error, code: poster.code, detail: poster.detail },
      { status: poster.status },
    );
  }

  return new Response(new Uint8Array(poster.body), {
    status: 200,
    headers: { ...headers, "Content-Length": String(poster.body.length) },
  });
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
