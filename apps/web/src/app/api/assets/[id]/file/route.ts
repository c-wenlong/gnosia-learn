import { NextResponse } from "next/server";

import {
  assetFilesEnabled,
  openRange,
  parseRange,
  resolveAssetFile,
  type AssetFile,
} from "@/lib/asset-files";
import { withLearnerStore } from "@/lib/learner-store";

/**
 * `GET /api/assets/<encodeURIComponent(asset.id)>/file`: the bytes of one
 * indexed asset.
 *
 * The catalog has held rows for 30 videos, 69 sidecars and a pair of diagrams
 * with nothing able to play or show one: the videos are under manimkc's data
 * root, outside this repository, and the diagrams are in `learn/assets/`,
 * outside `apps/web/public/`. Next serves neither, so this is the one door
 * from a row to its file.
 *
 * **The URL carries an id, never a path.** Asset ids look like
 * `manimkc:out/algorithms/cs3230-assignment-1/cs3230_a1.mp4`, so they hold
 * colons and slashes and arrive percent-encoded in one dynamic segment; Next
 * decodes the segment into `params.id`. That string is used as a primary key
 * and nothing else. Every filesystem decision is made from the row that comes
 * back, and the reasoning for each of them is in `@/lib/asset-files`.
 *
 * **Headers, and why these.**
 *
 * | Header | Value | Why |
 * | --- | --- | --- |
 * | `Content-Type` | from a closed extension list | An unknown extension is refused, never guessed at as `application/octet-stream`. |
 * | `X-Content-Type-Options` | `nosniff` | The extension decides the type. Without it a `.json` transcript holding markup can be sniffed into a document in this origin. |
 * | `Content-Security-Policy` | `default-src 'none'; sandbox` | An SVG is a document, and one served from this origin could run script with this origin's storage. The sandbox drops it into an opaque origin with scripts off, which costs a video nothing. |
 * | `Content-Disposition` | `inline; filename="…"` | The point is a `<video>` and an `<img>`; `attachment` would break both. The filename is a sanitised basename so a saved file is named after itself. |
 * | `Accept-Ranges` | `bytes` | Without it a player will not offer a scrub bar at all. |
 * | `Cache-Control` | `private, no-store` | A re-render overwrites the same path, and the reason to open one of these is to look at the newest one. |
 *
 * `attachment` was the other way to make an SVG safe, and it is the wrong
 * trade here: browsers honour it on a navigation, which is the case that
 * matters, but it also turns the intended use into a download prompt in some
 * of them. The sandbox closes the same hole and leaves the embed working.
 *
 * **Off unless a machine opts in.** `ASSET_FILES_ENABLED`, the shape
 * `STUDIO_ENABLED` uses in decision D11 of docs/TLDRAWKC-INTEGRATION.md.
 * Production has none of these files, so every request there is a 404 rather
 * than a stat of a path that cannot exist.
 *
 * `HEAD` needs no handler: Next implements it by calling `GET` and dropping
 * the body, so a player probing for a size and a range unit gets the same
 * headers this returns.
 */

export const runtime = "nodejs";

/** The headers every successful answer carries, whole file or slice. */
function baseHeaders(file: AssetFile): Record<string, string> {
  return {
    "Content-Type": file.contentType,
    "Content-Disposition": `inline; filename="${file.filename}"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!assetFilesEnabled()) {
    // Not "forbidden": on a deployment this route does not exist, and saying
    // so twice in two different words would only invite someone to look for
    // the switch.
    return NextResponse.json(
      { error: "Not found.", detail: "Asset files are not served by this deployment." },
      { status: 404 },
    );
  }

  const { id } = await params;

  let resolved;
  try {
    resolved = await withLearnerStore((db) => resolveAssetFile(db, id));
  } catch (error) {
    // The lookup is a read, and a read that cannot reach the database
    // degrades and says so (ARCHITECTURE.md rule 14). There is no degraded
    // version of a video, so what it degrades to is an honest 503.
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`asset file: catalog unreachable: ${message}`);
    return NextResponse.json(
      { error: "The catalog is unreachable.", detail: "Could not look this asset up." },
      { status: 503 },
    );
  }

  if (resolved.ok === false) {
    return NextResponse.json(
      { error: resolved.error, detail: resolved.detail },
      { status: resolved.status },
    );
  }

  const headers = baseHeaders(resolved);
  const range = parseRange(request.headers.get("range"), resolved.bytes);

  if (range.kind === "unsatisfiable") {
    // 416 carries the file's real length so the player can correct itself and
    // ask again, which is the only thing that makes this recoverable.
    return new Response(null, {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${resolved.bytes}` },
    });
  }

  if (range.kind === "partial") {
    const { start, end } = range;
    return new Response(openRange(resolved.file, start, end), {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${resolved.bytes}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  return new Response(openRange(resolved.file), {
    status: 200,
    headers: { ...headers, "Content-Length": String(resolved.bytes) },
  });
}
