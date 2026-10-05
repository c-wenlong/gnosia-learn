import { beforeEach, describe, expect, it, vi } from "vitest";

// A signed-in request, so the owner seam (`@/lib/owner`) resolves `local`.
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));

/**
 * The Library's one read and its safety limit (L9 of
 * docs/proposals/library-by-type-and-day.md, 2026-10-05).
 *
 * The read used to stop at 1,000 rows, from the days when every row was drawn
 * at once; the owner's catalog passed that with 1,023, and the header counted
 * files the list never held. The catalog here honours `limit` the way
 * `listAssets` does, so these hold the read to the whole catalog well past the
 * old figure and to a visible stop past the new one.
 */
const catalog = vi.hoisted(() => ({ size: 0 }));
const listAssets = vi.hoisted(() =>
  vi.fn(async (_db: unknown, options: { limit?: number }, _scope: unknown) => {
    const size = Math.min(catalog.size, options.limit ?? Infinity);
    return Array.from({ length: size }, (_, i) => ({
      id: `note:n${String(i).padStart(6, "0")}`,
      kind: "note",
      path: null,
      url: null,
      bytes: 1,
      title: `Note ${i}`,
      sourceRepo: "self-learn",
      topics: [],
      createdAt: "2026-10-05T00:00:00.000Z",
      updatedAt: "2026-10-05T00:00:00.000Z",
      editedAt: null,
    }));
  }),
);

vi.mock("@/lib/learner-store", () => ({ catalogDatabase: async () => ({}) }));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@self-learn/catalog/state", () => ({
  listAssets,
  assetCounts: async () => [{ kind: "note", count: catalog.size }],
  assetParents: async () => ({}),
  topicTitles: async () => ({}),
}));

const { LIBRARY_ROW_CAP, readLibrary } = await import("@/lib/asset-library");
const { MAX_ORDER } = await import("@/lib/library-pages");

describe("the Library's read", () => {
  beforeEach(() => {
    listAssets.mockClear();
  });

  it.each([1_023, 1_200, 10_230])("takes every one of %i rows, matching the header's count", async (size) => {
    catalog.size = size;
    const snapshot = await readLibrary();
    expect(snapshot.truncated).toBe(false);
    expect(snapshot.rows).toHaveLength(size);
    expect(new Set(snapshot.rows.map((row) => row.id)).size).toBe(size);
    expect(snapshot.counts.reduce((sum, c) => sum + c.count, 0)).toBe(snapshot.rows.length);
  });

  it("is the owner's", async () => {
    catalog.size = 3;
    await readLibrary();
    const [, , scope] = listAssets.mock.calls.at(-1) as unknown as [unknown, unknown, { owner: string }];
    expect(scope.owner).toBe("local");
  });

  it("is whole at exactly the limit, and says it stopped one row past it", async () => {
    catalog.size = LIBRARY_ROW_CAP;
    const whole = await readLibrary();
    expect(whole.truncated).toBe(false);
    expect(whole.rows).toHaveLength(LIBRARY_ROW_CAP);

    catalog.size = LIBRARY_ROW_CAP + 1;
    const cut = await readLibrary();
    expect(cut.truncated).toBe(true);
    expect(cut.rows).toHaveLength(LIBRARY_ROW_CAP);
  });

  it("keeps a limit far above the old 1,000, under Postgres's bind limit, and no lower than the pages' group order", () => {
    expect(LIBRARY_ROW_CAP).toBeGreaterThanOrEqual(10_000);
    // `assetParents` and the stored-blob checks bind one parameter per row.
    expect(LIBRARY_ROW_CAP).toBeLessThan(65_535);
    // Every group holds a row, so an order can be as long as the rows read.
    expect(MAX_ORDER).toBeGreaterThanOrEqual(LIBRARY_ROW_CAP);
  });
});
