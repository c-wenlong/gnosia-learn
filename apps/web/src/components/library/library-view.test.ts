import { describe, expect, it, vi } from "vitest";

/**
 * The Library view a page and its scroll share (`loadLibraryView`), kept for
 * a minute per owner and filters: what a search leaves in it.
 */
vi.mock("@/lib/asset-library", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/asset-library")>()),
  loadLibrary: async () => ({
    rows: [
      {
        id: "note:vectors",
        kind: "note",
        path: null,
        url: null,
        bytes: 100,
        title: "Vectors",
        sourceRepo: "gnosia",
        topics: [],
        createdAt: "2026-10-04T20:00:00Z",
        updatedAt: "2026-10-04T20:00:00Z",
        editedAt: null,
      },
    ],
    counts: [{ kind: "note", count: 1 }],
    reachable: true,
    truncated: false,
    titles: {},
    concepts: {},
    parents: {},
  }),
  loadFavorites: async () => new Set<string>(),
  loadAssetAccess: async () => ({ served: new Set<string>(), posters: new Set<string>() }),
  loadSearchText: async () => ({
    texts: new Map([["note:vectors", "a list of numbers with a direction"]]),
    sources: {},
    searchedText: true,
    skipped: 2,
  }),
}));
vi.mock("@/lib/learner-store", () => ({ loadKnowledgeBase: async () => ({ reachable: true, kb: { concepts: [] } }) }));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));
vi.mock("@/data/courses", () => ({ getCourses: async () => [] }));
vi.mock("@/data/topics", () => ({ getTopics: async () => [] }));
vi.mock("@/components/library/RowMenu", () => ({ RowMenu: () => null }));

const { loadLibraryView } = await import("./library-view");

describe("a searched Library view", () => {
  it("keeps what the page says about the search, and none of the words it searched", async () => {
    const view = await loadLibraryView({ q: "direction" });
    expect(view.matching.map((row) => row.id)).toEqual(["note:vectors"]);
    expect(view.search).toEqual({ searchedText: true, skipped: 2 });
    // The kept copy the scroll reuses is the same shape.
    expect((await loadLibraryView({ q: "direction" }, { reuse: true })).search).toEqual({ searchedText: true, skipped: 2 });
  });
});
