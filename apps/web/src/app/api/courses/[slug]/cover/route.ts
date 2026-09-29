import { courseCoverBlob, type CourseCoverBlob } from "@self-learn/catalog/state";
import { COURSE_COVER_TYPES } from "@self-learn/schema/shared";
import { NextResponse } from "next/server";

import { blobStoreProblem, isRangeRefusal, openBlob, parseRange, webStreamFrom, type AssetFileProblem } from "@/lib/asset-files";
import type { RouteProblemCode } from "@/lib/asset-problems";
import { assetBlobStore, SIGNED_URL_TTL_SECONDS } from "@/lib/blob-store";
import { COVER_VERSION_PARAM, coverVersion } from "@/lib/course-summary";
import { withLearnerStore } from "@/lib/learner-store";
import { currentScope, NoOwnerError, type OwnerScope } from "@/lib/owner";

/**
 * `GET /api/courses/<slug>/cover`: one course's cover photo, from the blob
 * store.
 *
 * The course row names the image by its blob key (`collection.cover_blob_key`,
 * written by `catalog course cover`), never by a URL, so this route is where
 * the URL comes from. The slug is looked up among the courses the signed-in
 * owner may read, and only the key that row names is ever opened: nothing
 * from the URL is joined onto a path. Another owner's course, a course with
 * no cover and a cover whose upload was never confirmed are all a 404, the
 * first one indistinguishable from a course that does not exist.
 *
 * **The path has no extension on purpose.** `proxy.ts` lets through, signed
 * out, any path ending in `.webp`, `.jpg` or `.png` (the public images), so a
 * `/cover.webp` would be served to anyone. This one goes through the session
 * check like every other API route, and a request with no owner is a 401
 * here as well.
 *
 * **Headers, and why these.**
 *
 * | Header | Value | Why |
 * | --- | --- | --- |
 * | `Content-Type` | from the key's extension, a closed list | `COURSE_COVER_TYPES`: WebP, JPEG, PNG, nothing else. |
 * | `X-Content-Type-Options` | `nosniff` | The type is decided, never guessed. |
 * | `Content-Security-Policy` | `default-src 'none'; script-src 'none'; sandbox` | An image runs nothing; this is the poster route's belt and braces. |
 * | `ETag` | the image's sha256 | It changes when and only when the cover does. |
 * | `Cache-Control` | `private, max-age=31536000, immutable` when `?v=` names this image, else `private, max-age=0, must-revalidate` | The key is content addressed, so a URL carrying the hash (what the course list links, `coverUrl`) names bytes that can never change and is cached for good; a replaced cover gets a new URL. A URL without it, or with an old hash, revalidates against the ETag instead, so it can never pin a stale photo. `private`, because it is served to a signed-in owner. |
 * | `Accept-Ranges` | `bytes` | The same Range answers as the asset routes, from the same parser. |
 *
 * A store that signs URLs (the cloud adapter, when there is one) is answered
 * with a 302 to it and `no-store`, as the asset routes do; the `fs` store
 * returns none, so the bytes are streamed. A database that does not answer is
 * a 503 `catalog-unreachable`; the course list has already fallen back to its
 * placeholder by then, since it reads covers the same way.
 */

export const runtime = "nodejs";

export const COVER_CSP = "default-src 'none'; script-src 'none'; sandbox";

const IMMUTABLE = "private, max-age=31536000, immutable";
const REVALIDATE = "private, max-age=0, must-revalidate";

interface CoverServed {
  key: string;
  bytes: number;
  sha256: string;
  contentType: string;
  filename: string;
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;

  let scope: OwnerScope;
  try {
    scope = await currentScope();
  } catch (error) {
    if (error instanceof NoOwnerError) {
      return NextResponse.json({ error: "UNAUTHENTICATED", signIn: "/sign-in" }, { status: 401 });
    }
    throw error;
  }

  let row: CourseCoverBlob | null;
  try {
    row = await withLearnerStore((db) => courseCoverBlob(db, slug, scope));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`course cover: catalog unreachable: ${message}`);
    return NextResponse.json(
      { error: "The catalog is unreachable.", code: "catalog-unreachable", detail: "Could not look this cover up." },
      { status: 503 },
    );
  }

  const resolved = await resolveCover(slug, row);
  if (resolved.ok === false) return problem(resolved);
  return serve(request, resolved.cover);
}

function problem(p: AssetFileProblem): Response {
  return NextResponse.json({ error: p.error, code: p.code, detail: p.detail }, { status: p.status });
}

const noCover = (code: RouteProblemCode, detail: string): AssetFileProblem => ({
  ok: false,
  status: 404,
  code,
  error: "No such course cover.",
  detail,
});

/** The row checked: present, of a served type, and still in the store. */
async function resolveCover(
  slug: string,
  row: CourseCoverBlob | null,
): Promise<{ ok: true; cover: CoverServed } | AssetFileProblem> {
  if (row === null) return noCover("not-in-catalog", `No course ${JSON.stringify(slug)} with a cover.`);
  if (row.state !== "present") {
    return noCover("not-uploaded", `The cover of ${row.courseId} is not confirmed in the blob store. Run \`catalog course cover\` again.`);
  }
  const ext = row.key.slice(row.key.lastIndexOf(".") + 1);
  const contentType = (COURSE_COVER_TYPES as Readonly<Record<string, string>>)[ext];
  if (contentType === undefined) {
    return noCover("unsupported-type", `The cover of ${row.courseId} is stored with a type this route will not serve.`);
  }
  let size: number;
  try {
    const stat = await assetBlobStore().stat(row.key);
    if (stat === null) {
      console.warn(`course cover: ${row.courseId} names ${row.key}, which the store does not hold; run catalog blob audit`);
      return noCover("not-uploaded", `The cover of ${row.courseId} is no longer in the blob store.`);
    }
    size = stat.bytes;
  } catch (error) {
    return blobStoreProblem(error);
  }
  return {
    ok: true,
    cover: {
      key: row.key,
      bytes: size,
      sha256: row.sha256,
      contentType,
      filename: `${row.slug.replace(/[^A-Za-z0-9._-]/g, "_")}.${ext}`,
    },
  };
}

async function serve(request: Request, cover: CoverServed): Promise<Response> {
  const etag = `"${cover.sha256}"`;
  const pinned = new URL(request.url).searchParams.get(COVER_VERSION_PARAM) === coverVersion(cover.sha256);
  const headers: Record<string, string> = {
    "Content-Type": cover.contentType,
    "Content-Disposition": `inline; filename="${cover.filename}"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": COVER_CSP,
    "Cache-Control": pinned ? IMMUTABLE : REVALIDATE,
    "Accept-Ranges": "bytes",
    ETag: etag,
  };
  if (matchesEtag(request.headers.get("if-none-match"), etag)) {
    return new Response(null, { status: 304, headers });
  }

  let url: string | null;
  try {
    url = await assetBlobStore().signedUrl(cover.key, SIGNED_URL_TTL_SECONDS);
  } catch (error) {
    return problem(blobStoreProblem(error));
  }
  if (url !== null) {
    return new Response(null, {
      status: 302,
      headers: { Location: url, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  }

  const range = parseRange(request.headers.get("range"), cover.bytes);
  if (range.kind === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${cover.bytes}` } });
  }
  try {
    if (range.kind === "partial") {
      const read = await openBlob(cover.key, { start: range.start, end: range.end });
      return new Response(webStreamFrom(read.body), {
        status: 206,
        headers: {
          ...headers,
          "Content-Range": `bytes ${read.start}-${read.end}/${read.size}`,
          "Content-Length": String(read.end - read.start + 1),
        },
      });
    }
    const read = await openBlob(cover.key);
    return new Response(webStreamFrom(read.body), {
      status: 200,
      headers: { ...headers, "Content-Length": String(read.size) },
    });
  } catch (error) {
    if (isRangeRefusal(error)) {
      return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${cover.bytes}` } });
    }
    return problem(blobStoreProblem(error));
  }
}

/** Does `If-None-Match` name this tag? A list, `*`, and weak tags, as the poster route reads it. */
function matchesEtag(header: string | null, etag: string): boolean {
  if (header === null) return false;
  const strip = (tag: string) => (tag.startsWith("W/") ? tag.slice(2) : tag);
  return header
    .split(",")
    .map((tag) => strip(tag.trim()))
    .some((tag) => tag === "*" || tag === strip(etag));
}
