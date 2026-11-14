import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { fsStore, key as blobKey, type BlobStore } from "@hermes/blob";
import { blobObject, collection, learner, ownerScope } from "@hermes/schema";

import {
  migratedScratchDatabase,
  probe,
  type Scratch,
} from "../../../../../../services/catalog/test/scratch-database";

/** Whether the request carries the owner's session, whether the store signs URLs, and whether its reads throw; each test sets what it needs. */
const flags = { signedIn: true, signing: false, statFails: false, signFails: false };

vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => flags.signedIn,
}));

// The `fs` store the catalog opens, with `signedUrl` answering a URL when a
// test asks for the cloud store's path (a redirect, never a stream).
vi.mock("@/lib/blob-store", async () => {
  const { fsStore: open } = await import("@hermes/blob");
  return {
    SIGNED_URL_TTL_SECONDS: 3600,
    assetBlobStore: (): BlobStore => {
      const inner = open(path.join(process.env.HERMES_HOME ?? "", "blobs"));
      return {
        ...inner,
        provider: inner.provider,
        stat: async (key) => {
          if (flags.statFails) throw new Error("store read refused");
          return inner.stat(key);
        },
        get: (key, range) => inner.get(key, range),
        signedUrl: async (key) => {
          if (flags.signFails) throw new Error("signing refused");
          return flags.signing ? `https://store.example/signed/${encodeURIComponent(key)}` : null;
        },
      };
    },
  };
});

/**
 * `GET /api/courses/<slug>/cover` (migration 0016): the cover photo a course
 * row names by its blob key, served to the signed-in owner from the blob
 * store, and the course list's read of which covers there are.
 *
 * The rows are written straight into a scratch database (courses are not
 * flipped here, so no guard is armed), and the bytes into a scratch store:
 * nothing on this machine's disk outside the OS temp directory is read.
 */

const reachable = await probe();

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
/** A WebP by its first bytes, which is all the route and the catalog look at. */
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0xf4, 0x0b, 0, 0]),
  Buffer.from("WEBPVP8 "),
  Buffer.from(Array.from({ length: 3_000 }, (_, i) => (i * 7) % 251)),
]);
const OTHER = Buffer.concat([WEBP, Buffer.from("another owner's photo")]);
const PENDING = Buffer.concat([WEBP, Buffer.from("an upload that never finished")]);
const LOST = Buffer.concat([WEBP, Buffer.from("bytes the store lost")]);
const COMMONS = Buffer.concat([WEBP, Buffer.from("a cover every owner may read")]);
const CREDIT = { photographer: "A Photographer", source: "https://example.com/photo", licence: "Unsplash License" };
const ORIGIN = "http://localhost:3000";

type Handler = (request: Request, context: { params: Promise<{ slug: string }> }) => Promise<Response>;

describe.skipIf(!reachable.ok)("the course cover route", () => {
  let scratch: Scratch;
  let home: string;
  let GET: Handler;
  let covers: typeof import("@/data/course-covers");
  let summary: typeof import("@/lib/course-summary");
  const saved: Record<string, string | undefined> = {};

  const call = (slug: string, { query = "", headers = {} }: { query?: string; headers?: Record<string, string> } = {}) =>
    GET(new Request(`${ORIGIN}/api/courses/${encodeURIComponent(slug)}/cover${query}`, { headers }), {
      params: Promise.resolve({ slug }),
    });
  const codeOf = async (response: Response) => ((await response.clone().json()) as { code?: string }).code;

  /** The bytes in the store (unless `put` is false) and their `blob_object` row. */
  const stored = async (owner: string, bytes: Buffer, state: "present" | "pending" = "present", put = true) => {
    const key = blobKey(owner, sha256(bytes), "webp");
    if (put) {
      const file = path.join(home, `upload-${sha256(bytes)}.webp`);
      await writeFile(file, bytes);
      await fsStore(path.join(home, "blobs")).put(key, createReadStream(file), {
        sha256: sha256(bytes),
        bytes: bytes.length,
        mime: "image/webp",
      });
    }
    await scratch.db.insert(blobObject).values({
      key,
      ownerId: owner,
      sha256: sha256(bytes),
      bytes: bytes.length,
      mime: "image/webp",
      provider: "fs",
      state,
      confirmedAt: state === "present" ? new Date() : null,
    });
    return key;
  };
  const course = (id: string, position: number, owner: string, key: string | null) => ({
    id,
    kind: "course",
    slug: id,
    title: `Course ${id}`,
    position,
    ownerId: owner,
    coverBlobKey: key,
    metadata: key === null ? { code: id.toUpperCase() } : { code: id.toUpperCase(), coverCredit: CREDIT },
  });

  beforeAll(async () => {
    for (const key of ["DATABASE_URL", "HERMES_HOME"]) saved[key] = process.env[key];
    scratch = await migratedScratchDatabase();
    home = await mkdtemp(path.join(tmpdir(), "course-cover-route-"));
    process.env.DATABASE_URL = scratch.url;
    process.env.HERMES_HOME = home;

    await scratch.db.insert(learner).values([{ id: "other" }, { id: "commons" }]).onConflictDoNothing();
    // A cover the closed type list refuses: `.gif` is not in
    // `COURSE_COVER_TYPES`, so the route never reaches for its bytes.
    await scratch.db.insert(blobObject).values({
      key: `local/${sha256(WEBP)}.gif`,
      ownerId: "local",
      sha256: sha256(WEBP),
      bytes: WEBP.length,
      mime: "image/gif",
      provider: "fs",
      state: "present",
      confirmedAt: new Date(),
    });
    await scratch.db.insert(collection).values([
      course("cs1000", 1, "local", await stored("local", WEBP)),
      course("cs2000", 2, "local", null),
      course("cs3000", 3, "other", await stored("other", OTHER)),
      course("cs4000", 4, "local", await stored("local", PENDING, "pending", false)),
      course("cs5000", 5, "local", await stored("local", LOST, "present", false)),
      // A commons course (the seed's own are commons rows): every owner reads it.
      course("cs6000", 6, "commons", await stored("commons", COMMONS)),
      course("cs7000", 7, "local", `local/${sha256(WEBP)}.gif`),
    ]);

    ({ GET } = (await import("./[slug]/cover/route")) as { GET: Handler });
    covers = await import("@/data/course-covers");
    summary = await import("@/lib/course-summary");
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
    if (home !== undefined) await rm(home, { recursive: true, force: true });
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("streams the cover whole, typed by its key and tagged by its hash", async () => {
    const response = await call("cs1000");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("content-length")).toBe(String(WEBP.length));
    expect(response.headers.get("etag")).toBe(`"${sha256(WEBP)}"`);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; script-src 'none'; sandbox");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="cs1000.webp"');
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    // No version in the URL: revalidated every time, so it can never pin an old photo.
    expect(response.headers.get("cache-control")).toBe("private, max-age=0, must-revalidate");
    expect(Buffer.from(await response.arrayBuffer()).equals(WEBP)).toBe(true);
  });

  it("caches for good only a URL whose version names this image", async () => {
    const pinned = await call("cs1000", { query: `?v=${summary.coverVersion(sha256(WEBP))}` });
    expect(pinned.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    const stale = await call("cs1000", { query: "?v=0123456789abcdef" });
    expect(stale.status).toBe(200);
    expect(stale.headers.get("cache-control")).toBe("private, max-age=0, must-revalidate");
  });

  it("answers a revalidation with 304 and no body", async () => {
    const response = await call("cs1000", { headers: { "if-none-match": `W/"${sha256(WEBP)}"` } });
    expect(response.status).toBe(304);
    expect(response.headers.get("etag")).toBe(`"${sha256(WEBP)}"`);
    expect(response.body).toBeNull();
  });

  it("answers a Range request with 206 and the slice, and one past the end with 416", async () => {
    const part = await call("cs1000", { headers: { range: "bytes=10-19" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe(`bytes 10-19/${WEBP.length}`);
    expect(part.headers.get("content-length")).toBe("10");
    expect(Buffer.from(await part.arrayBuffer()).equals(WEBP.subarray(10, 20))).toBe(true);

    const past = await call("cs1000", { headers: { range: `bytes=${WEBP.length + 10}-` } });
    expect(past.status).toBe(416);
    expect(past.headers.get("content-range")).toBe(`bytes */${WEBP.length}`);
  });

  it("serves only the owner's courses and the commons': another owner's cover is a 404 like no course at all", async () => {
    // The commons' cover answers for this owner too, so a scope that dropped
    // it would fail here rather than pass.
    const shared = await call("cs6000");
    expect(shared.status).toBe(200);
    expect(Buffer.from(await shared.arrayBuffer()).equals(COMMONS)).toBe(true);

    const theirs = await call("cs3000");
    expect(theirs.status).toBe(404);
    expect(await codeOf(theirs)).toBe("not-in-catalog");
    const none = await call("no-such-course");
    expect(none.status).toBe(404);
    expect(await codeOf(none)).toBe("not-in-catalog");
    // The same sentence, so the answer says nothing about whose course it is.
    expect(((await theirs.json()) as { detail: string }).detail.replace("cs3000", "x")).toBe(
      ((await none.json()) as { detail: string }).detail.replace("no-such-course", "x"),
    );
  });

  it("answers a course with no cover, and a cover not confirmed or lost from the store, with a 404", async () => {
    const bare = await call("cs2000");
    expect(bare.status).toBe(404);
    expect(await codeOf(bare)).toBe("not-in-catalog");
    for (const slug of ["cs4000", "cs5000"]) {
      const response = await call(slug);
      expect(response.status, slug).toBe(404);
      expect(await codeOf(response), slug).toBe("not-uploaded");
    }
  });

  it("refuses a cover stored under a type the route will not serve, with a 404 unsupported-type", async () => {
    // cs7000's key ends `.gif`: present and confirmed, and still refused.
    const response = await call("cs7000");
    expect(response.status).toBe(404);
    expect(await codeOf(response)).toBe("unsupported-type");
  });

  it("redirects to the store's signed URL when it offers one, and streams nothing", async () => {
    flags.signing = true;
    try {
      const response = await call("cs1000");
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        `https://store.example/signed/${encodeURIComponent(`local/${sha256(WEBP)}.webp`)}`,
      );
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    } finally {
      flags.signing = false;
    }
  });

  it("answers 503 blob-store-unavailable, not a 500, when the store's read or its signing throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      flags.statFails = true;
      const unread = await call("cs1000");
      expect(unread.status).toBe(503);
      expect(await codeOf(unread)).toBe("blob-store-unavailable");
      flags.statFails = false;

      flags.signFails = true;
      const unsigned = await call("cs1000");
      expect(unsigned.status).toBe(503);
      expect(await codeOf(unsigned)).toBe("blob-store-unavailable");
    } finally {
      flags.statFails = false;
      flags.signFails = false;
      warn.mockRestore();
    }
  });

  it("refuses a request with no session with 401, whatever the slug", async () => {
    flags.signedIn = false;
    try {
      const response = await call("cs1000");
      expect(response.status).toBe(401);
    } finally {
      flags.signedIn = true;
    }
  });

  it("gives the course list the confirmed covers the owner may read, and the URL it links serves them for good", async () => {
    const found = await covers.readCourseCovers(ownerScope("local"));
    // cs4000's upload is pending; cs3000 is another owner's; cs2000 has none;
    // cs7000's is a type the route will not serve; cs6000 is the commons'.
    expect([...found.keys()].sort()).toEqual(["cs1000", "cs5000", "cs6000", "cs7000"]);
    expect(found.get("cs1000")).toBe(sha256(WEBP));

    const url = new URL(summary.coverUrl("cs1000", found.get("cs1000") as string), ORIGIN);
    const response = await GET(new Request(url), { params: Promise.resolve({ slug: "cs1000" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");

    // The other owner sees theirs and the commons', and not these.
    expect([...(await covers.readCourseCovers(ownerScope("other"))).keys()]).toEqual(["cs3000", "cs6000"]);
  });

  it("gives the course list no covers rather than a failure when the read cannot be answered", async () => {
    // The read degrades to no covers: a card draws its placeholder and the log
    // says why. `catalogDatabase` is the one open connection, so the read is
    // failed where it runs, by a table it joins being gone.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await scratch.pool.query("alter table blob_object rename to blob_object_away");
    try {
      expect((await covers.readCourseCovers(ownerScope("local"))).size).toBe(0);
      expect(warn).toHaveBeenCalled();
    } finally {
      await scratch.pool.query("alter table blob_object_away rename to blob_object");
      warn.mockRestore();
    }
    // Restored whole: the reads above answer again.
    expect((await covers.readCourseCovers(ownerScope("local"))).get("cs1000")).toBe(sha256(WEBP));
  });
});
