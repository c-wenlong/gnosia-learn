import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ownerScope } from "@gnosia/schema/shared";

/**
 * The course cover route and the course list's cover read with the catalog
 * down, and the route with a lookup that fails for any other reason.
 *
 * Its own file because the catalog is opened once per process, on first use,
 * from whatever `CATALOG_DB` says then, and this one needs a file that cannot
 * be opened: a path under a regular file, which no directory can be made at.
 * The route says `catalog-unreachable` with a 503; the list's read says
 * nothing at all and every card draws its placeholder, since a cover is
 * decoration and the page must not fail over one.
 */

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => undefined,
}));

// Signed in, so what fails is the database and not the session.
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));

type Handler = (request: Request, context: { params: Promise<{ slug: string }> }) => Promise<Response>;

const request = () =>
  [new Request("http://localhost:3000/api/courses/cs1000/cover"), { params: Promise.resolve({ slug: "cs1000" }) }] as const;

describe("course covers with no catalog", () => {
  let GET: Handler;
  let covers: typeof import("@/data/course-covers");
  let dir: string;
  const before = process.env.CATALOG_DB;

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "cover-unreachable-"));
    writeFileSync(path.join(dir, "not-a-directory"), "");
    process.env.CATALOG_DB = path.join(dir, "not-a-directory", "catalog.db");
    // The open attempts are expected, and their warnings are noise here.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    ({ GET } = (await import("./[slug]/cover/route")) as { GET: Handler });
    covers = await import("@/data/course-covers");
  });

  afterAll(() => {
    if (before === undefined) delete process.env.CATALOG_DB;
    else process.env.CATALOG_DB = before;
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("answers the route with 503 catalog-unreachable, not a 404 that reads as no cover", async () => {
    const response = await GET(...request());
    expect(response.status).toBe(503);
    expect(((await response.json()) as { code: string }).code).toBe("catalog-unreachable");
  });

  it("gives the course list no covers, so every card draws its placeholder", async () => {
    expect((await covers.readCourseCovers(ownerScope("local"))).size).toBe(0);
    expect((await covers.getCourseCovers()).size).toBe(0);
  });

  it("throws a lookup that failed for any other reason, so a bug is a 500 and not an outage", async () => {
    vi.resetModules();
    vi.doMock("@/lib/learner-store", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/learner-store")>()),
      withLearnerStore: async <T,>(fn: (db: never) => Promise<T>) => fn({} as never),
    }));
    vi.doMock("@gnosia/catalog/state", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@gnosia/catalog/state")>()),
      courseCoverBlob: async () => {
        throw new Error("no such column: cover_blob_key");
      },
    }));
    try {
      const { GET: fresh } = (await import("./[slug]/cover/route")) as { GET: Handler };
      await expect(fresh(...request())).rejects.toThrow("no such column");
    } finally {
      vi.doUnmock("@/lib/learner-store");
      vi.doUnmock("@gnosia/catalog/state");
    }
  });
});
