import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The three asset routes, and the page's own pre-render check, with the
 * catalog down.
 *
 * Its own file because the pool is opened once per process, on first use, from
 * whatever `DATABASE_URL` says then: the suites beside this one point it at a
 * scratch database, and this one needs a port nothing is listening on. The
 * answer it pins is `catalog-unreachable`, which says the file is probably
 * fine and the database is the thing to look at, rather than a 404 that reads
 * as "the video is gone".
 */

// Signed in, so what is under test is the catalog being down. Without a
// session the routes answer 401 before reading anything.
const signedIn = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => signedIn.value,
}));

// The handlers run outside the request scope Next sets up, where
// `connection()` throws; inside a real request it resolves at once.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => undefined,
}));

type Handler = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;

const ID = "manimkc:out/algorithms/demo/demo.mp4";
const at = (suffix: string) =>
  new Request(`http://localhost:3000/api/assets/${encodeURIComponent(ID)}/${suffix}`);
const params = { params: Promise.resolve({ id: ID }) };

describe("the asset routes with no catalog", () => {
  let file: Handler;
  let poster: Handler;
  let status: Handler;
  let library: typeof import("@/lib/asset-library");

  beforeAll(async () => {
    process.env.DATABASE_URL = "postgres://localhost:59999/nothing";
    // The connection attempt is expected, and its warning is noise here.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    ({ GET: file } = (await import("./[id]/file/route")) as { GET: Handler });
    ({ GET: poster } = (await import("./[id]/poster/route")) as { GET: Handler });
    ({ GET: status } = (await import("./[id]/status/route")) as { GET: Handler });
    library = await import("@/lib/asset-library");
  });

  it("says catalog-unreachable from every route, with a 503", async () => {
    for (const [name, response] of [
      ["file", await file(at("file"), params)],
      ["poster", await poster(at("poster"), params)],
      ["status", await status(at("status"), params)],
    ] as const) {
      expect(response.status, name).toBe(503);
      expect(((await response.json()) as { code: string }).code, name).toBe("catalog-unreachable");
    }
  });

  it("answers 401 with no session, before the catalog is asked", async () => {
    signedIn.value = false;
    try {
      for (const [name, response] of [
        ["file", await file(at("file"), params)],
        ["poster", await poster(at("poster"), params)],
        ["status", await status(at("status"), params)],
      ] as const) {
        expect(response.status, name).toBe(401);
      }
    } finally {
      signedIn.value = true;
    }
  });

  it("says the same on the server before render, for the asset and its embeds", async () => {
    const problems = await library.readFileProblems([ID, "diagram:learn/assets/a.svg"]);
    expect([...problems.values()]).toEqual(["catalog-unreachable", "catalog-unreachable"]);
  });

  it("reads no note from anywhere else when the catalog cannot be asked", async () => {
    // The concept workspace's note: once a fall back to the files, now a reason.
    const { readConceptNote } = await import("@/lib/concept-note");
    const read = await readConceptNote("dot-product");
    expect(read.ok).toBe(false);
    expect(read.ok === false && read.code).toBe("unreachable");
    expect(read.ok === false && read.message).toContain("reads its content from the database only");
  });
});
