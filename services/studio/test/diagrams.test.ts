import { mkdir, rm, utimes, writeFile } from "node:fs/promises";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureDocument } from "./fixture-document";

/**
 * The corpus reader: the one fact it adds to `canvas list --json`, and the one
 * refusal that keeps a request inside `learn/assets`.
 *
 * `list` reports `svg: { path, exists }` and no modified time, so "is the
 * picture older than the document" — the only question the freshness pill asks
 * — cannot be answered from its output. These tests are about the `stat` that
 * closes that, so the CLI itself is mocked: launching it would be testing
 * tldrawkc, which has its own suite.
 */

const canvasMock = vi.hoisted(() => ({ canvas: vi.fn() }));
vi.mock("../src/canvas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/canvas")>();
  return { ...actual, canvas: canvasMock.canvas };
});

const { isDiagramName, listDiagrams, svgStateFor } = await import("../src/diagrams");
const { absolute, targetPath, targetSvgPath } = await import("../src/paths");

const NAME = "studio-diagrams-fixture";

function listing(name: string) {
  return {
    code: 0,
    signal: null,
    stdout: "",
    stderr: "",
    timedOut: false,
    json: {
      dir: absolute("learn/assets"),
      diagrams: [
        {
          path: absolute(targetPath(name)),
          relative: `${name}.tldr`,
          name,
          meta: {
            title: "A fixture",
            topic: "vector-and-linear-algebra-basics",
            concepts: ["a", "b"],
            source: "",
            created: "2026-09-12T23:51:55.236Z",
          },
          shapes: 43,
          svg: { path: absolute(targetSvgPath(name)), exists: true },
          png: { path: "", exists: false },
          modified: "2026-09-13T02:09:26.975Z",
        },
      ],
      errors: [{ path: absolute("learn/assets/broken.tldr"), relative: "broken.tldr", message: "not JSON" }],
      ms: 4,
    },
  };
}

beforeEach(async () => {
  await mkdir(absolute("learn/assets"), { recursive: true });
  canvasMock.canvas.mockResolvedValue(listing(NAME));
});

afterEach(async () => {
  await rm(absolute(targetPath(NAME)), { force: true });
  await rm(absolute(targetSvgPath(NAME)), { force: true });
  vi.restoreAllMocks();
});

describe("what makes an SVG stale", () => {
  it("is missing when there is no file beside the document", () => {
    expect(svgStateFor("2026-09-13T00:00:00.000Z", null)).toBe("missing");
  });

  it("is stale when the SVG is strictly older than the document", () => {
    expect(svgStateFor("2026-09-13T02:00:00.000Z", "2026-09-13T01:00:00.000Z")).toBe("stale");
  });

  it("is current when the two were written in the same millisecond", () => {
    // `export` writes both seconds apart and a coarse filesystem can stamp them
    // identically. Calling that stale would leave the pill amber on every
    // diagram the tool had just finished making.
    const at = "2026-09-13T02:00:00.000Z";
    expect(svgStateFor(at, at)).toBe("current");
  });

  it("is current when the SVG is newer, which is the normal case", () => {
    expect(svgStateFor("2026-09-13T01:00:00.000Z", "2026-09-13T02:00:00.000Z")).toBe("current");
  });
});

describe("what counts as a diagram name", () => {
  it.each(["dot-product", "a", "vector-as-a-list-of-numbers", "m3r1"])("takes %j", (name) => {
    expect(isDiagramName(name)).toBe(true);
  });

  it.each(["../secrets", "a/b", "", ".hidden", "with space", "a%2Fb"])("refuses %j", (name) => {
    // The route builds a path from this, so a name that is not one path segment
    // is refused rather than sanitised: there is no correct file for it.
    expect(isDiagramName(name)).toBe(false);
  });
});

describe("reading the directory", () => {
  it("adds the SVG's own modified time, which list does not report", async () => {
    await writeFile(absolute(targetPath(NAME)), fixtureDocument());
    await writeFile(absolute(targetSvgPath(NAME)), "<svg/>");
    const old = new Date("2026-01-01T00:00:00.000Z");
    await utimes(absolute(targetSvgPath(NAME)), old, old);

    const result = await listDiagrams();
    const entry = result.diagrams[0];
    expect(entry?.svg.modified).toBe(old.toISOString());
    expect(entry?.svgState).toBe("stale");
    expect(entry?.svg.bytes).toBe(6);
  });

  it("reports a file that will not parse rather than throwing past it", async () => {
    await writeFile(absolute(targetPath(NAME)), fixtureDocument());
    const result = await listDiagrams();
    expect(result.errors).toEqual([
      { name: "broken", path: "learn/assets/broken.tldr", message: "not JSON" },
    ]);
    expect(result.counts.unreadable).toBe(1);
  });

  it("counts the topiced ones apart, because the indexer refuses the others", async () => {
    await writeFile(absolute(targetPath(NAME)), fixtureDocument());
    const result = await listDiagrams();
    expect(result.counts).toMatchObject({ total: 1, withTopic: 1 });
  });

  it("says so plainly when the CLI printed no JSON at all", async () => {
    canvasMock.canvas.mockResolvedValue({
      code: 1,
      signal: null,
      stdout: "",
      stderr: "learn/assets does not exist.",
      timedOut: false,
      json: null,
    });
    await expect(listDiagrams()).rejects.toThrow(/does not exist/);
  });
});
