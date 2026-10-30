import "server-only";

import { NextResponse } from "next/server";

import { blobStoreProblem, openBlob, webStreamFrom, type AssetFileProblem, type AssetStored } from "@/lib/asset-files";
import { assetBlobStore, SIGNED_URL_TTL_SECONDS } from "@/lib/blob-store";
import { unauthenticated } from "@/lib/learner-api";
import { NoOwnerError } from "@/lib/owner";

/*
 * What the asset routes share (S6-09 of the library audit): the answer for a
 * lookup that threw, the JSON body for a problem the resolver named, the tag
 * rule for `If-None-Match`, the signed-URL redirect, and the whole-object
 * responder the poster and PDF routes are. The file route keeps its own
 * ranged responder beside these, since only it serves a player.
 */

/**
 * What an asset route answers when its lookup threw instead of resolving.
 *
 * Two different failures land in the same `catch`. A request with no
 * signed-in owner throws `NoOwnerError` out of the owner seam before the
 * database is asked anything, and that is the proxy's own 401, which a
 * request that got past it still gets here. Anything else is a read that
 * could not reach the database, which degrades and says so (ARCHITECTURE.md
 * rule 14): there is no degraded version of a file, so it is an honest 503
 * `catalog-unreachable`, which says the file is probably fine and the
 * database is the thing to look at.
 *
 * `route` names the route in the server log ("asset file", "asset poster").
 */
export function lookupFailed(route: string, error: unknown): Response {
  if (error instanceof NoOwnerError) return unauthenticated();
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`${route}: catalog unreachable: ${message}`);
  return NextResponse.json(
    {
      error: "The catalog is unreachable.",
      code: "catalog-unreachable",
      detail: "Could not look this asset up.",
    },
    { status: 503 },
  );
}

/**
 * Does `If-None-Match` name this tag? A weak tag (`W/"…"`) matches its strong
 * twin, since these are compared for a 304 and never for a range, and `*`
 * matches anything.
 */
export function matchesEtag(header: string | null, etag: string): boolean {
  if (header === null) return false;
  const strip = (tag: string) => (tag.startsWith("W/") ? tag.slice(2) : tag);
  return header
    .split(",")
    .map((tag) => strip(tag.trim()))
    .some((tag) => tag === "*" || tag === strip(etag));
}

/** A problem the resolver named (`not-in-catalog`, `not-uploaded`, …), as its status and JSON body. */
export function problemResponse(p: AssetFileProblem): Response {
  return NextResponse.json({ error: p.error, code: p.code, detail: p.detail }, { status: p.status });
}

/**
 * A 302 to the stored object when the store signs URLs, `null` when it does
 * not (the `fs` store, which streams through the route). `no-store`, so every
 * use asks the route again and gets a URL with a fresh hour on it. Throws
 * what the store throws, for the caller's `blobStoreProblem`.
 */
export async function signedRedirect(key: string): Promise<Response | null> {
  const url = await assetBlobStore().signedUrl(key, SIGNED_URL_TTL_SECONDS);
  if (url === null) return null;
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

/**
 * A stored object served whole, the poster and PDF routes' answer. Its tag is
 * the object's sha256, so it changes exactly when a different object is
 * stored, and a revalidation is a 304 with no read; `max-age=0,
 * must-revalidate` asks for exactly that. Then the signed-URL redirect, or
 * the whole object streamed: a poster is tens of kilobytes and a PDF a few
 * megabytes, cheaper served whole than ranged. `inline`, under the stored
 * file's name. `csp`, when given, is sent as `Content-Security-Policy`.
 */
export async function serveStoredWhole(
  request: Request,
  stored: AssetStored,
  { contentType, csp }: { contentType: string; csp?: string },
): Promise<Response> {
  const etag = `"${stored.sha256}"`;
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Content-Disposition": `inline; filename="${stored.filename}"`,
    "X-Content-Type-Options": "nosniff",
    ...(csp === undefined ? {} : { "Content-Security-Policy": csp }),
    "Cache-Control": "private, max-age=0, must-revalidate",
    ETag: etag,
  };
  if (matchesEtag(request.headers.get("if-none-match"), etag)) {
    return new Response(null, { status: 304, headers });
  }
  try {
    const redirect = await signedRedirect(stored.key);
    if (redirect !== null) return redirect;
    const read = await openBlob(stored.key);
    return new Response(webStreamFrom(read.body), {
      status: 200,
      headers: { ...headers, "Content-Length": String(read.size) },
    });
  } catch (error) {
    return problemResponse(blobStoreProblem(error));
  }
}
