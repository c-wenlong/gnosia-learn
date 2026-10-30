import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The four asset routes, and the page's own pre-render check, with the
 * catalog down.
 *
 * Its own file because the pool is opened once per process, on first use, from
 * whatever `CATALOG_DB` says then: the suites beside this one point it at a
 * scratch database, and this one needs a file that cannot be opened (a
 * directory). The answer it pins is `catalog-unreachable`, which says the file
 * is probably fine and the database is the thing to look at, rather than a 404
 * that reads as "the video is gone". The request is signed in, so the 503 can
 * only have come from the database; a request with no owner is a 401, pinned
 * in `asset-file.test.ts` against a catalog that answers.
 */

// The handlers run outside the request scope Next sets up, where
// `connection()` throws; inside a real request it resolves at once.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => undefined,
}));

vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
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
  let routes: Array<[string, Handler]>;
  let library: typeof import("@/lib/asset-library");
  let home: string;

  beforeAll(async () => {
    // A directory where the file should be: SQLite cannot open it.
    home = await mkdtemp(path.join(tmpdir(), "asset-unreachable-"));
    process.env.CATALOG_DB = home;
    delete process.env.DATABASE_URL;
    // The connection attempt is expected, and its warning is noise here.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    routes = [
      ["file", ((await import("./[id]/file/route")) as { GET: Handler }).GET],
      ["poster", ((await import("./[id]/poster/route")) as { GET: Handler }).GET],
      ["pdf", ((await import("./[id]/pdf/route")) as { GET: Handler }).GET],
      ["status", ((await import("./[id]/status/route")) as { GET: Handler }).GET],
    ];
    library = await import("@/lib/asset-library");
  });

  afterAll(async () => {
    delete process.env.CATALOG_DB;
    await rm(home, { recursive: true, force: true });
  });

  it("says catalog-unreachable from every route, with a 503", async () => {
    for (const [name, handler] of routes) {
      const response = await handler(at(name), params);
      expect(response.status, name).toBe(503);
      expect(((await response.json()) as { code: string }).code, name).toBe("catalog-unreachable");
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
