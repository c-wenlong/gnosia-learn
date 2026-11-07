import "server-only";

import { NextResponse } from "next/server";

import {
  blobStoreProblem,
  isRangeRefusal,
  openBlob,
  parseRange,
  webStreamFrom,
  type AssetFileProblem,
  type AssetStored,
} from "@/lib/asset-files";
import { assetBlobStore, SIGNED_URL_TTL_SECONDS } from "@/lib/blob-store";
import { unauthenticated } from "@/lib/learner-api";
import { NoOwnerError } from "@/lib/owner";
import { failureCode } from "@gnosia/tutor/server/provider-keys";

/*
 * What the asset routes share (S6-09 of the library audit): the answer for a
 * lookup that threw, the JSON body for a problem the resolver named, the tag
 * rule for `If-None-Match`, the signed-URL redirect, and the whole-object
 * responder the poster and PDF routes are, and the ranged responder the file
 * and cover routes both stream a stored object through.
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
  logLookupFailure(route, error);
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
 * The server log line for a lookup that could not reach the catalog: the
 * failure's code (`SQLITE_CANTOPEN`, `SQLITE_BUSY`), never its message. A
 * drizzle error's message is the failed SQL with its bind parameters (the
 * asset id, the owner scope) and says nothing about why it failed (AGENTS.md,
 * "A drizzle error's message never says why the database failed").
 */
export function logLookupFailure(route: string, error: unknown): void {
  console.warn(`${route}: catalog unreachable (${failureCode(error)})`);
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

/**
 * A stored object streamed with the Range answers `parseRange` decides, the
 * one body the file and cover routes share. The caller has already done what
 * differs between them (the auth check, the 304, the signed-URL redirect, and
 * which Range header to honour, so an `If-Range` that names other bytes is
 * dropped to `null` before it gets here) and passes the headers every answer
 * carries.
 *
 * - no, malformed, non-`bytes` or multi-range header: 200, the whole object
 * - a satisfiable range: 206 with `Content-Range` and `Content-Length` as
 *   the store reports the slice it holds
 * - a range past the end, or one the store refuses: 416 with a
 *   `Content-Range` of `bytes`, a star, a slash and the size
 * - any other store failure: the problem response `blobStoreProblem` names
 *
 * `bytes` is the size the resolver measured, used to judge the range before
 * the object is opened.
 */
export async function serveBlobRange(
  key: string,
  bytes: number,
  headers: Record<string, string>,
  rangeHeader: string | null,
): Promise<Response> {
  const unsatisfiable = () =>
    new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${bytes}` } });
  const range = parseRange(rangeHeader, bytes);
  if (range.kind === "unsatisfiable") return unsatisfiable();
  try {
    if (range.kind === "partial") {
      const read = await openBlob(key, { start: range.start, end: range.end });
      return new Response(webStreamFrom(read.body), {
        status: 206,
        headers: {
          ...headers,
          "Content-Range": `bytes ${read.start}-${read.end}/${read.size}`,
          "Content-Length": String(read.end - read.start + 1),
        },
      });
    }
    const read = await openBlob(key);
    return new Response(webStreamFrom(read.body), {
      status: 200,
      headers: { ...headers, "Content-Length": String(read.size) },
    });
  } catch (error) {
    if (isRangeRefusal(error)) return unsatisfiable();
    return problemResponse(blobStoreProblem(error));
  }
}
