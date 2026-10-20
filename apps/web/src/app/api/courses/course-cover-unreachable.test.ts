import { beforeAll, describe, expect, it, vi } from "vitest";

import { ownerScope } from "@gnosia/schema/shared";

/**
 * The course cover route and the course list's cover read with the catalog
 * down.
 *
 * Its own file because the pool is opened once per process, on first use, from
 * whatever `DATABASE_URL` says then, and this one needs a port nothing is
 * listening on. The route says `catalog-unreachable` with a 503; the list's
 * read says nothing at all and every card draws its placeholder, since a
 * cover is decoration and the page must not fail over one.
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

describe("course covers with no catalog", () => {
  let GET: Handler;
  let covers: typeof import("@/data/course-covers");

  beforeAll(async () => {
    process.env.DATABASE_URL = "postgres://localhost:59999/nothing";
    // The connection attempts are expected, and their warnings are noise here.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    ({ GET } = (await import("./[slug]/cover/route")) as { GET: Handler });
    covers = await import("@/data/course-covers");
  });

  it("answers the route with 503 catalog-unreachable, not a 404 that reads as no cover", async () => {
    const response = await GET(new Request("http://localhost:3000/api/courses/cs1000/cover"), {
      params: Promise.resolve({ slug: "cs1000" }),
    });
    expect(response.status).toBe(503);
    expect(((await response.json()) as { code: string }).code).toBe("catalog-unreachable");
  });

  it("gives the course list no covers, so every card draws its placeholder", async () => {
    expect((await covers.readCourseCovers(ownerScope("local"))).size).toBe(0);
    expect((await covers.getCourseCovers()).size).toBe(0);
  });
});
