import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Library view a page and its scroll share (`loadLibraryView`), kept for
 * a minute per owner and filters: what a search leaves in it, and when the
 * kept copy is reused and when the catalog is read again.
 */
const loadLibrary = vi.hoisted(() => vi.fn());
const currentOwner = vi.hoisted(() => vi.fn(async () => "a"));

function library(reachable = true) {
  return {
    rows: reachable
      ? [
          {
            id: "note:vectors",
            kind: "note",
            path: null,
            url: null,
            bytes: 100,
            title: "Vectors",
            sourceRepo: "hermes",
            topics: [],
            createdAt: "2026-10-04T20:00:00Z",
            updatedAt: "2026-10-04T20:00:00Z",
            editedAt: null,
          },
        ]
      : [],
    counts: reachable ? [{ kind: "note", count: 1 }] : [],
    reachable,
    truncated: false,
    titles: {},
    concepts: {},
    parents: {},
  };
}

vi.mock("@/lib/asset-library", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/asset-library")>()),
  loadLibrary,
  loadFavorites: async () => new Set<string>(),
  loadAssetAccess: async () => ({ served: new Set<string>(), posters: new Set<string>() }),
  loadSearchText: async () => ({
    texts: new Map([["note:vectors", "a list of numbers with a direction"]]),
    sources: {},
    searchedText: true,
    skipped: 2,
  }),
}));
vi.mock("@/lib/owner", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/owner")>()),
  currentOwner,
}));
vi.mock("@/lib/learner-store", () => ({ loadKnowledgeBase: async () => ({ reachable: true, kb: { concepts: [] } }) }));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));
vi.mock("@/data/courses", () => ({ getCourses: async () => [] }));
vi.mock("@/data/topics", () => ({ getTopics: async () => [] }));
vi.mock("@/components/library/RowMenu", () => ({ RowMenu: () => null }));

/** A fresh copy of the module each test, so no test sees another's kept views. */
async function load() {
  return (await import("./library-view")).loadLibraryView;
}

beforeEach(() => {
  vi.resetModules();
  loadLibrary.mockReset();
  loadLibrary.mockResolvedValue(library());
  currentOwner.mockReset();
  currentOwner.mockResolvedValue("a");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a searched Library view", () => {
  it("keeps what the page says about the search, and none of the words it searched", async () => {
    const loadLibraryView = await load();
    const view = await loadLibraryView({ q: "direction" });
    expect(view.matching.map((row) => row.id)).toEqual(["note:vectors"]);
    expect(view.search).toEqual({ searchedText: true, skipped: 2 });
    // The kept copy the scroll reuses is the same view, not a second read.
    const kept = await loadLibraryView({ q: "direction" }, { reuse: true });
    expect(kept).toBe(view);
    expect(kept.search).toEqual({ searchedText: true, skipped: 2 });
    expect(loadLibrary).toHaveBeenCalledTimes(1);
  });
});

describe("the kept Library view", () => {
  it("is never handed to another owner", async () => {
    const loadLibraryView = await load();
    const forA = await loadLibraryView({}, { reuse: true });
    currentOwner.mockResolvedValue("b");
    const forB = await loadLibraryView({}, { reuse: true });
    expect(loadLibrary).toHaveBeenCalledTimes(2);
    expect(forB).not.toBe(forA);
    // Owner a's own copy is still theirs.
    currentOwner.mockResolvedValue("a");
    expect(await loadLibraryView({}, { reuse: true })).toBe(forA);
    expect(loadLibrary).toHaveBeenCalledTimes(2);
  });

  it("is reused within the minute and read again after it", async () => {
    const loadLibraryView = await load();
    const view = await loadLibraryView({});
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 59_000 });
    expect(await loadLibraryView({}, { reuse: true })).toBe(view);
    expect(loadLibrary).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 2_000);
    const again = await loadLibraryView({}, { reuse: true });
    expect(again).not.toBe(view);
    expect(loadLibrary).toHaveBeenCalledTimes(2);
  });

  it("is never taken without reuse: the page always reads", async () => {
    const loadLibraryView = await load();
    const one = await loadLibraryView({});
    const two = await loadLibraryView({});
    expect(two).not.toBe(one);
    expect(loadLibrary).toHaveBeenCalledTimes(2);
  });

  it("is not kept when the catalog did not answer", async () => {
    const loadLibraryView = await load();
    loadLibrary.mockResolvedValueOnce(library(false));
    expect((await loadLibraryView({})).library.reachable).toBe(false);
    const after = await loadLibraryView({}, { reuse: true });
    expect(after.library.reachable).toBe(true);
    expect(loadLibrary).toHaveBeenCalledTimes(2);
  });
});
