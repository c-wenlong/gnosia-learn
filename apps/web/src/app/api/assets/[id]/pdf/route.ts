import { PDF_CONTENT_TYPE } from "@self-learn/catalog/state";
import { NextResponse } from "next/server";

import {
  blobStoreProblem,
  openBlob,
  pdfSource,
  webStreamFrom,
  type AssetFileProblem,
  type AssetStored,
} from "@/lib/asset-files";
import { assetBlobStore, SIGNED_URL_TTL_SECONDS } from "@/lib/blob-store";
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
    // A read that cannot reach the database degrades and says so
    // (ARCHITECTURE.md rule 14). There is no degraded version of a document,
    // so what it degrades to is an honest 503.
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`asset pdf: catalog unreachable: ${message}`);
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

function pdfHeaders(filename: string, etag: string): Record<string, string> {
  return {
    "Content-Type": PDF_CONTENT_TYPE,
    "Content-Disposition": `inline; filename="${filename}"`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=0, must-revalidate",
    ETag: etag,
  };
}

/**
 * The stored PDF. Its tag is the object's sha256, so it changes exactly when
 * a new document is stored, and a revalidate costs a 304 and no reads. A
 * signed URL is a 302 with `no-store`, as in the file route; otherwise the
 * whole object is streamed — a PDF is sought through by the viewer, but the
 * store's range reads are for the file route's player, and a document of a
 * few megabytes is cheaper served whole than ranged.
 */
async function serveStored(request: Request, stored: AssetStored): Promise<Response> {
  const etag = `"${stored.sha256}"`;
  const headers = pdfHeaders(stored.filename, etag);
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

/** Does `If-None-Match` name this tag? (The poster route's rule, verbatim.) */
function matchesEtag(header: string | null, etag: string): boolean {
  if (header === null) return false;
  const strip = (tag: string) => (tag.startsWith("W/") ? tag.slice(2) : tag);
  return header
    .split(",")
    .map((tag) => strip(tag.trim()))
    .some((tag) => tag === "*" || tag === strip(etag));
}
