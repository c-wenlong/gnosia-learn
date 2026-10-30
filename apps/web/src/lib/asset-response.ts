import "server-only";

import { NextResponse } from "next/server";

import { unauthenticated } from "@/lib/learner-api";
import { NoOwnerError } from "@/lib/owner";

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
