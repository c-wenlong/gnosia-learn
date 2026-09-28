import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
    process.env.ASSET_FILES_ENABLED = "1";
    // The connection attempt is expected, and its warning is noise here.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    ({ GET: file } = (await import("./[id]/file/route")) as { GET: Handler });
    ({ GET: poster } = (await import("./[id]/poster/route")) as { GET: Handler });
    ({ GET: status } = (await import("./[id]/status/route")) as { GET: Handler });
    library = await import("@/lib/asset-library");
  });

  afterAll(() => {
    delete process.env.ASSET_FILES_ENABLED;
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

  it("says the same on the server before render, for the asset and its embeds", async () => {
    const problems = await library.readFileProblems([ID, "diagram:learn/assets/a.svg"]);
    expect([...problems.values()]).toEqual(["catalog-unreachable", "catalog-unreachable"]);
  });

  // With the switch off there is no file branch, and with no catalog there is
  // no blob to find, so the answer is the one a deployment with neither gave
  // before the blob store existed.
  it("says files-off when the switch is off and the catalog cannot be asked", async () => {
    delete process.env.ASSET_FILES_ENABLED;
    const problems = await library.readFileProblems([ID]);
    expect(problems.get(ID)).toBe("files-off");
    process.env.ASSET_FILES_ENABLED = "1";
  });
});
