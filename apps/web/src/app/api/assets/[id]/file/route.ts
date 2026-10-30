import { NextResponse } from "next/server";

import {
  blobStoreProblem,
  isRangeRefusal,
  openBlob,
  parseRange,
  resolveAsset,
  webStreamFrom,
  type AssetFileProblem,
  type AssetRowText,
  type AssetSource,
  type AssetStored,
} from "@/lib/asset-files";
import { lookupFailed } from "@/lib/asset-response";
import { assetBlobStore, SIGNED_URL_TTL_SECONDS } from "@/lib/blob-store";
import { contentDisposition } from "@/lib/download-name";
import { withLearnerStore } from "@/lib/learner-store";

/**
 * `GET /api/assets/<encodeURIComponent(asset.id)>/file`: the bytes of one
 * indexed asset.
 *
 * The catalog holds rows for the videos, their sidecars and posters, the
 * diagrams, the notes and the session logs, and none of their bytes is under
 * `apps/web/public/`: they are objects in the blob store or text in the
 * database. So this is the one door from a row to its bytes.
 *
 * **The URL carries an id, never a path.** Asset ids look like
 * `manimkc:out/algorithms/cs3230-assignment-1/cs3230_a1.mp4`, so they hold
 * colons and slashes and arrive percent-encoded in one dynamic segment; Next
 * decodes the segment into `params.id`. That string is used as a primary key
 * and nothing else. Every decision is made from the row that comes back, and
 * the reasoning for each of them is in `@/lib/asset-files`.
 *
 * **Headers, and why these.**
 *
 * | Header | Value | Why |
 * | --- | --- | --- |
 * | `Content-Type` | from a closed extension list | An unknown extension is refused, never guessed at as `application/octet-stream`. |
 * | `X-Content-Type-Options` | `nosniff` | The extension decides the type. Without it a `.json` transcript holding markup can be sniffed into a document in this origin. |
 * | `Content-Security-Policy` | see `ASSET_CSP` below | An SVG is a document, and one served from this origin could run script with this origin's storage. The sandbox drops it into an opaque origin with scripts off, which costs a video nothing. Not sent for a PDF (`securityPolicy`). |
 * | `Content-Disposition` | `inline; filename="…"` | The point is a `<video>` and an `<img>`; `attachment` would break both. The filename is a sanitised basename so a saved file is named after itself. With `?download=1` (the Library row menu's Download) it is `attachment`, named after the asset's title (`contentDisposition` in `@/lib/download-name`). |
 * | `Accept-Ranges` | `bytes` | Without it a player will not offer a scrub bar at all. |
 * | `Cache-Control` | `private, no-store` | A re-render or a commit gives the same id new bytes, and the reason to open one of these is to look at the newest one. |
 *
 * `attachment` was the other way to make an SVG safe, and it is the wrong
 * trade here: browsers honour it on a navigation, which is the case that
 * matters, but it also turns the intended use into a download prompt in some
 * of them. The sandbox closes the same hole and leaves the embed working.
 *
 * **Two places the bytes can be, asked in order** (docs/CONTENT-MIGRATION.md,
 * Tracks C, D and E). An asset whose row names a `blob_key` is served from
 * the blob store: redirected to a signed URL when the store can mint one (a
 * cloud store, so a large video never streams through a function, edge case
 * 10), streamed through here with the same Range handling when it cannot (the
 * laptop's `fs` store). The redirect carries the store's URL and nothing of
 * the asset's path. A `pending` blob, or one the store has lost, is a 404
 * `not-uploaded`.
 *
 * **Then the row**: a note, a session log or a `.tldr` is served from the
 * database, with the same headers and Range handling. Nothing is read off
 * this server's disk: the legacy file branch and `ASSET_FILES_ENABLED`, which
 * gated it, went in phase 2, so a row with neither a blob nor row text is a
 * 404 `not-uploaded`, and a note whose type this database has not flipped is
 * a 503 `not-flipped`.
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

/**
 * A stored PDF is the one type served without that policy, as the sibling
 * `/pdf` route serves the same documents. A PDF is drawn by the browser's own
 * viewer, a plugin in WebKit (the desktop shell's engine), and a document
 * under `sandbox` may not load a plugin; the bytes are ours, made by
 * `catalog asset upload` or `catalog video put`, and carry nothing that runs
 * in this origin. Chromium draws one either way.
 */
function securityPolicy(contentType: string): Record<string, string> {
  return contentType === "application/pdf" ? {} : { "Content-Security-Policy": ASSET_CSP };
}

/**
 * `?download=1`: save the file rather than show it. Anything else, or no
 * parameter, is the inline answer every embed relies on.
 */
function wantsDownload(request: Request): boolean {
  return new URL(request.url).searchParams.get("download") === "1";
}

/** The headers every successful answer carries, whole file or slice. */
function baseHeaders(request: Request, file: AssetSource): Record<string, string> {
  return {
    "Content-Type": file.contentType,
    "Content-Disposition": wantsDownload(request)
      ? contentDisposition("attachment", file.filename, file.title)
      : contentDisposition("inline", file.filename),
    "X-Content-Type-Options": "nosniff",
    ...securityPolicy(file.contentType),
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  let resolved;
  try {
    resolved = await withLearnerStore((db) => resolveAsset(db, id));
  } catch (error) {
    // No owner is a 401; a database that cannot be asked is a 503.
    return lookupFailed("asset file", error);
  }

  if (resolved.ok === false) return problem(resolved);
  if (resolved.source === "blob") return serveBlob(request, resolved);
  return serveRow(request, resolved);
}

function problem(p: AssetFileProblem): Response {
  return NextResponse.json({ error: p.error, code: p.code, detail: p.detail }, { status: p.status });
}

/**
 * A stored object: a redirect when the store signs URLs, else the bytes, with
 * the Range answers `parseRange` decides.
 *
 * The redirect is a 302 with `no-store`, so every play asks this route again
 * and gets a URL with a fresh hour on it, and the browser sends its Range
 * requests straight to the store. The stream is the `fs` adapter's path: the
 * size comes from `stat` in the resolver, the slice from `get`, which reports
 * the range it actually holds, and that is what `Content-Range` says.
 *
 * A `?download=1` that redirects is saved under whatever the store's URL
 * says, since a redirect cannot carry this route's `Content-Disposition`. The
 * `fs` store, the only one deployed, signs nothing and streams through here,
 * so its downloads are named after the title; a cloud adapter that signs
 * would need to sign the disposition into its URL.
 */
async function serveBlob(request: Request, stored: AssetStored): Promise<Response> {
  let url: string | null;
  try {
    url = await assetBlobStore().signedUrl(stored.key, SIGNED_URL_TTL_SECONDS);
  } catch (error) {
    return problem(blobStoreProblem(error));
  }
  if (url !== null) {
    return new Response(null, {
      status: 302,
      headers: { Location: url, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  }

  const headers = baseHeaders(request, stored);
  const range = parseRange(request.headers.get("range"), stored.bytes);
  if (range.kind === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${stored.bytes}` },
    });
  }

  try {
    if (range.kind === "partial") {
      const read = await openBlob(stored.key, { start: range.start, end: range.end });
      return new Response(webStreamFrom(read.body), {
        status: 206,
        headers: {
          ...headers,
          "Content-Range": `bytes ${read.start}-${read.end}/${read.size}`,
          "Content-Length": String(read.end - read.start + 1),
        },
      });
    }
    const read = await openBlob(stored.key);
    return new Response(webStreamFrom(read.body), {
      status: 200,
      headers: { ...headers, "Content-Length": String(read.size) },
    });
  } catch (error) {
    if (isRangeRefusal(error)) {
      return new Response(null, {
        status: 416,
        headers: { ...headers, "Content-Range": `bytes */${stored.bytes}` },
      });
    }
    return problem(blobStoreProblem(error));
  }
}

/**
 * Row text, held whole: the same headers and Range answers as a blob, sliced
 * from the buffer. A note or a log is a few kilobytes and a `.tldr` tens, so
 * nothing is gained by streaming what the database already handed over.
 */
function serveRow(request: Request, text: AssetRowText): Response {
  const headers = baseHeaders(request, text);
  const range = parseRange(request.headers.get("range"), text.bytes);
  if (range.kind === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${text.bytes}` },
    });
  }
  if (range.kind === "partial") {
    const { start, end } = range;
    return new Response(new Uint8Array(text.body.subarray(start, end + 1)), {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${text.bytes}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }
  return new Response(new Uint8Array(text.body), {
    status: 200,
    headers: { ...headers, "Content-Length": String(text.bytes) },
  });
}
