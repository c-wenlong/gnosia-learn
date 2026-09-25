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
 * | `Content-Security-Policy` | see `ASSET_CSP` below | An SVG is a document, and one served from this origin could run script with this origin's storage. The sandbox drops it into an opaque origin with scripts off, which costs a video nothing. |
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
 * **Every refusal carries a `code`** from `@/lib/asset-problems` beside its
 * prose `detail`. The detail is for a person reading the raw response and may
 * name a stored path; the code is what a page switches on to say why a video
 * or a diagram did not load, and the sibling status route reports the same
 * code without sending the file.
 *
 * `HEAD` needs no handler: Next implements it by calling `GET` and dropping
 * the body, so a player probing for a size and a range unit gets the same
 * headers this returns.
 */

export const runtime = "nodejs";

/**
 * The policy every asset is served under, and each source is there for a
 * reason a diagram would otherwise lose.
 *
 * `sandbox` is the load-bearing one: with no tokens it puts the document in an
 * opaque origin with scripts, forms and plugins off, which is what makes an
 * `image/svg+xml` from this origin harmless when someone opens the URL in a
 * tab. `default-src 'none'` closes everything else, `connect-src` included, so
 * the document reaches no network at all.
 *
 * `script-src 'none'` is written out rather than left to that fallback, so
 * that widening any other directive can never quietly widen this one. It is
 * the property this header exists for and it should be readable at a glance.
 *
 * The three exceptions are what a tldrawkc export is made of.
 * `learn/assets/dot-product.svg` carries 118 inline `style` attributes, two
 * `<style>` blocks that both open with `@font-face`, 70 `foreignObject`
 * elements and two fonts embedded as base64 `data:` URLs, on purpose, so the
 * file is self-contained (ARCHITECTURE.md, "the knowledge base on disk"). It
 * has no `<script>` at all. Under a bare `default-src 'none'` every one of
 * those is blocked and the diagram still returns 200, rendering as unstyled
 * fallback text in its `foreignObject` boxes: a broken diagram that looks like
 * an ugly one, which is worse than an error. `style-src`, `font-src` and
 * `img-src` each fall back to `default-src`, so each has to be named.
 *
 * Widening them costs nothing here. `'unsafe-inline'` is a script risk only
 * where script can run, and `sandbox` plus `script-src 'none'` have already
 * taken that away; `data:` is bytes already inside the file being served, not
 * a fetch. An `<img src>` embed never consults this header at all, because an
 * image has no document context for a policy to apply to and runs no script in
 * an SVG whatever the policy says. Direct navigation to the URL is the case
 * this protects, and `sandbox` is the directive that protects it.
 */
export const ASSET_CSP =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; " +
  "font-src data:; img-src data:; sandbox";

/** The headers every successful answer carries, whole file or slice. */
function baseHeaders(file: AssetFile): Record<string, string> {
  return {
    "Content-Type": file.contentType,
    "Content-Disposition": `inline; filename="${file.filename}"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": ASSET_CSP,
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
      { error: "Not found.", code: "files-off", detail: "Asset files are not served by this deployment." },
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
      {
        error: "The catalog is unreachable.",
        code: "catalog-unreachable",
        detail: "Could not look this asset up.",
      },
      { status: 503 },
    );
  }

  if (resolved.ok === false) {
    return NextResponse.json(
      { error: resolved.error, code: resolved.code, detail: resolved.detail },
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
