import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The corpus reader over the catalog (Track D of docs/CONTENT-MIGRATION.md):
 * `catalog diagram list` into the views the screen draws, the cached copy that
 * answers with Postgres down (D13), and the checkout every verb runs on.
 *
 * The catalog is mocked: its own suite holds the list to `tldrawkc list` and
 * the checkout to its base check. These are about the studio's reading of it.
 */

const catalogMock = vi.hoisted(() => ({
  diagramList: vi.fn(),
  diagramShow: vi.fn(),
  diagramCheckout: vi.fn(),
}));
vi.mock("../src/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/catalog")>();
  return { ...actual, ...catalogMock };
});

const { checkoutOf, ensureCheckout, isDiagramName, listDiagrams, readDiagram, svgKeyOf } = await import(
  "../src/diagrams"
);
const { workPath } = await import("../src/paths");

const summary = {
  slug: "dot-product",
  path: "learn/assets/dot-product.tldr",
  svgPath: "learn/assets/dot-product.svg",
  title: "The dot product",
  topic: "vector-and-linear-algebra-basics",
  concepts: ["dot-product"],
  source: null,
  created: "2026-09-12T23:51:55.236Z",
  shapes: 44,
  documentBytes: 25636,
  svg: { key: `local/${"a".repeat(64)}.svg`, bytes: 313282, sha256: "a".repeat(64) },
  svgState: "stale",
  revision: 7,
  updatedAt: "2026-09-28T01:00:00.000Z",
  svgUpdatedAt: "2026-09-27T01:00:00.000Z",
};

const answer = (json: unknown) => ({ ok: true, json, error: null, offline: false });
const unreachable = { ok: false, json: null, error: "connect ECONNREFUSED", offline: true };

let home = "";

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "studio-diagrams-"));
  process.env.STUDIO_HOME = home;
  catalogMock.diagramList.mockReset().mockResolvedValue(answer({ ok: true, diagrams: [summary] }));
  catalogMock.diagramShow.mockReset();
  catalogMock.diagramCheckout.mockReset();
});

afterEach(async () => {
  if (home !== "") await rm(home, { recursive: true, force: true });
  home = "";
  delete process.env.STUDIO_HOME;
});

describe("a diagram name", () => {
  it.each(["dot-product", "a", "vector-as-a-list-of-numbers", "m3r1"])("takes %j", (name) => {
    expect(isDiagramName(name)).toBe(true);
  });

  it.each(["../secrets", "a/b", "", ".hidden", "with space", "a%2Fb"])("refuses %j", (name) => {
    // The route builds a checkout path from this, so a name that is not one
    // path segment is refused rather than sanitised.
    expect(isDiagramName(name)).toBe(false);
  });
});

describe("reading the catalog", () => {
  it("draws each row as the view the grid reads, freshness from the two hashes", async () => {
    const result = await listDiagrams();
    expect(result.stale).toBe(false);
    expect(result.counts).toEqual({ total: 1, withTopic: 1, unreadable: 0 });
    expect(result.diagrams[0]).toEqual({
      name: "dot-product",
      tldr: { path: "learn/assets/dot-product.tldr", exists: true, modified: summary.updatedAt, bytes: 25636 },
      svg: { path: "learn/assets/dot-product.svg", exists: true, modified: summary.svgUpdatedAt, bytes: 313282 },
      title: "The dot product",
      topic: "vector-and-linear-algebra-basics",
      concepts: ["dot-product"],
      source: null,
      shapes: 44,
      created: summary.created,
      svgState: "stale",
      revision: 7,
    });
  });

  it("answers from the last copy, marked stale, when the database is down", async () => {
    await listDiagrams();
    catalogMock.diagramList.mockResolvedValue(unreachable);
    const result = await listDiagrams();
    expect(result.stale).toBe(true);
    expect(result.error).toMatch(/ECONNREFUSED/);
    expect(result.diagrams.map((d) => d.name)).toEqual(["dot-product"]);
    // The thumbnail's key comes from the same copy, so tiles still draw.
    expect(await svgKeyOf("dot-product")).toEqual({ key: summary.svg.key, stale: true });
  });

  it("says so rather than inventing an empty list when there is no copy either", async () => {
    catalogMock.diagramList.mockResolvedValue(unreachable);
    await expect(listDiagrams()).rejects.toThrow(/ECONNREFUSED/);
  });

  it("reads one diagram with where its checkout stands", async () => {
    catalogMock.diagramShow.mockResolvedValue(
      answer({ ok: true, diagram: summary, checkout: { record: { revision: 6 }, dirty: true, behind: true } }),
    );
    const one = await readDiagram("dot-product");
    expect(one?.checkout).toEqual({ path: workPath("dot-product"), revision: 6, dirty: true, behind: true });
    expect(await readDiagram("no-such-diagram")).toBeNull();
  });
});

describe("the checkout", () => {
  it("is where every verb runs, brought up to date by the catalog", async () => {
    catalogMock.diagramCheckout.mockResolvedValue(
      answer({ ok: true, exists: true, revision: 7, note: "checked out dot-product at revision 7" }),
    );
    const checkout = await ensureCheckout("dot-product");
    expect(checkout).toMatchObject({ path: workPath("dot-product"), exists: true, revision: 7, offline: false });
    expect(catalogMock.diagramCheckout).toHaveBeenCalledWith("dot-product", path.join(home, "work"));
  });

  it("is left alone, and still used, when it holds edits nobody committed", async () => {
    await mkdir(path.join(home, "work"), { recursive: true });
    await writeFile(workPath("dot-product"), "{}");
    catalogMock.diagramCheckout.mockResolvedValue({
      ok: false,
      json: { ok: false, code: "dirty-checkout", error: "holds edits" },
      error: "holds edits",
      offline: false,
    });
    const checkout = await ensureCheckout("dot-product");
    expect(checkout).toMatchObject({ exists: true, offline: false });
    expect(checkout.note).toMatch(/never committed/);
  });

  it("falls back to the file on disk with the database down (D16)", async () => {
    catalogMock.diagramCheckout.mockResolvedValue(unreachable);
    expect(await ensureCheckout("dot-product")).toMatchObject({ exists: false, offline: true });
    await mkdir(path.join(home, "work"), { recursive: true });
    await writeFile(workPath("dot-product"), "{}");
    expect(await ensureCheckout("dot-product")).toMatchObject({ exists: true, offline: true });
    catalogMock.diagramShow.mockResolvedValue(unreachable);
    expect(await checkoutOf("dot-product")).toMatchObject({ path: workPath("dot-product"), dirty: false });
  });
});
