import { describe, expect, it, vi } from "vitest";

// A signed-in request, so the owner seam (`@/lib/owner`) resolves `local`.
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));

/**
 * The library's optional reads, and the property that they are optional.
 *
 * `readLibrary` and `readAssetDetail` each make one read the page cannot do
 * without and one or two it can. Topic titles and the wikilink index are the
 * second kind: the chips fall back to the slug and a wikilink falls back to
 * plain text, so both have a correct answer when the query fails.
 *
 * They were originally inside the same `try` as the rows, which meant a
 * failing lookup threw away assets that had already been read and rendered
 * the whole library unreachable. These tests exist because that bug was
 * invisible in every other way: the code compiled, the happy path was right,
 * and the comment above it claimed the behaviour it did not have.
 */

const rows = [
  {
    id: "manimkc:out/x/y.mp4",
    kind: "video",
    path: "out/x/y.mp4",
    url: null,
    bytes: 10,
    title: "A video",
    sourceRepo: "manimkc",
    topics: ["tomasulo"],
  },
];

vi.mock("@/lib/learner-store", () => ({ catalogDatabase: async () => ({}) }));

vi.mock("@self-learn/catalog/state", () => ({
  listAssets: async ({ ids }: { ids?: string[] } = {}) =>
    ids === undefined ? rows : rows.filter((r) => ids.includes(r.id)),
  assetCounts: async () => [{ kind: "video", count: 1 }],
  assetDerivations: async () => ({ sources: [], derived: [] }),
  // The one that fails. Everything else answers normally, which is the shape
  // of the real failure: one statement in a sequence, not a dead database.
  topicTitles: async () => {
    throw new Error("titles unavailable");
  },
  // Fails the same way, for the concept chips: a card with no concept is a
  // correct card, so this must not cost the rows either.
  conceptsForAssets: async () => {
    throw new Error("concept links unavailable");
  },
  // For search: a transcript row with nothing stored behind it.
  assetsByIds: async (_db: unknown, ids: string[]) =>
    ids.map((id) => ({ id, kind: "transcript", path: "out/x/y.transcript.json", sourceRepo: "manimkc" })),
  assetBlobs: async () => new Map(),
  derivationSources: async () => ({}),
}));

vi.mock("next/server", () => ({ connection: async () => undefined }));

const { readLibrary, readAssetDetail, readSearchText, searchableText } = await import(
  "@/lib/asset-library"
);

describe("a failing topic-title lookup", () => {
  it("still returns the rows, and reports the catalog as reachable", async () => {
    const snapshot = await readLibrary();
    expect(snapshot.reachable).toBe(true);
    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.counts).toHaveLength(1);
  });

  it("hands back no titles, which is what the chips fall back on", async () => {
    // `titles[slug] ?? slug` is the chip, so an empty record is a page of
    // slugs rather than a page of nothing.
    expect(await readLibrary().then((s) => s.titles)).toEqual({});
  });

  it("does not discard an asset the detail page had already resolved", async () => {
    const detail = await readAssetDetail("manimkc:out/x/y.mp4");
    expect(detail.asset?.id).toBe("manimkc:out/x/y.mp4");
    expect(detail.reachable).toBe(true);
    expect(detail.titles).toEqual({});
  });
});

describe("a failing concept-link lookup", () => {
  it("still returns the rows, with no concept chips", async () => {
    const snapshot = await readLibrary();
    expect(snapshot.reachable).toBe(true);
    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.concepts).toEqual({});
  });

  it("leaves the detail page its asset, explaining nothing", async () => {
    const detail = await readAssetDetail("manimkc:out/x/y.mp4");
    expect(detail.asset?.id).toBe("manimkc:out/x/y.mp4");
    expect(detail.concepts).toEqual([]);
  });
});

describe("the words search reads", () => {
  it("searches a transcript by what was said and its chapter titles, not its JSON", () => {
    const raw = JSON.stringify({
      chapters: [{ scene: "T1", title: "Weights", start: 0, end: 5 }],
      segments: [{ start: 0, end: 3, text: "Each weight is an AREA." }],
    });
    const text = searchableText("transcript", raw);
    expect(text).toContain("weights");
    expect(text).toContain("each weight is an area.");
    expect(text).not.toContain("segments");
  });

  it("searches a transcript that does not parse as it is written", () => {
    expect(searchableText("transcript", "not json at all")).toBe("not json at all");
  });

  it("reads a note as it is written, lowercased", () => {
    expect(searchableText("note", "# Dot Product\n\nA projection.")).toBe("# dot product\n\na projection.");
  });

  it("reads nothing, and says so, when no transcript here has a stored copy", async () => {
    const out = await readSearchText(
      [{ ...rows[0]!, id: "manimkc:out/x/y.transcript.json", kind: "transcript", path: "out/x/y.transcript.json", createdAt: "" }],
      ["dot"],
    );
    expect(out.searchedText).toBe(false);
    expect(out.skipped).toBe(1);
    expect(out.texts.size).toBe(0);
  });

  it("reads nothing for an empty query", async () => {
    const out = await readSearchText([], []);
    expect(out.searchedText).toBe(false);
  });
});
