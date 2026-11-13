import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Library view a page and its scroll share (`loadLibraryView`), kept for
 * a minute per owner and filters: what a search leaves in it, and when a
 * kept view is served rather than read again.
 */
const mocks = vi.hoisted(() => ({
  loadLibrary: vi.fn(),
  currentOwner: vi.fn(),
}));

const library = (reachable = true) => ({
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
});

vi.mock("@/lib/asset-library", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/asset-library")>()),
  loadLibrary: mocks.loadLibrary,
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
  currentOwner: mocks.currentOwner,
}));
vi.mock("@/lib/learner-store", () => ({ loadKnowledgeBase: async () => ({ reachable: true, kb: { concepts: [] } }) }));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));
vi.mock("@/data/courses", () => ({ getCourses: async () => [] }));
vi.mock("@/data/topics", () => ({ getTopics: async () => [] }));
vi.mock("@/components/library/RowMenu", () => ({ RowMenu: () => null }));

/**
 * `recentViews` is module state, so each test imports a fresh copy of the
 * module: a view one test kept is never served to the next.
 */
async function freshView() {
  vi.resetModules();
  return (await import("./library-view")).loadLibraryView;
}

beforeEach(() => {
  mocks.loadLibrary.mockImplementation(async () => library());
  mocks.currentOwner.mockResolvedValue("a");
});
afterEach(() => {
  vi.useRealTimers();
  mocks.loadLibrary.mockReset();
  mocks.currentOwner.mockReset();
});

describe("a searched Library view", () => {
  it("keeps what the page says about the search, and none of the words it searched", async () => {
    const loadLibraryView = await freshView();
    const view = await loadLibraryView({ q: "direction" });
    expect(view.matching.map((row) => row.id)).toEqual(["note:vectors"]);
    expect(view.search).toEqual({ searchedText: true, skipped: 2 });
    // The kept copy the scroll reuses is that same view, not a fresh read.
    const kept = await loadLibraryView({ q: "direction" }, { reuse: true });
    expect(kept).toBe(view);
    expect(kept.search).toEqual({ searchedText: true, skipped: 2 });
    expect(mocks.loadLibrary).toHaveBeenCalledTimes(1);
  });
});

describe("the kept Library view", () => {
  it("is served to a reuse within the minute, without reading the catalog again", async () => {
    const loadLibraryView = await freshView();
    const first = await loadLibraryView({}, { reuse: true });
    const second = await loadLibraryView({}, { reuse: true });
    expect(second).toBe(first);
    expect(mocks.loadLibrary).toHaveBeenCalledTimes(1);
  });

  it("is never served to another owner, and each owner keeps their own", async () => {
    const loadLibraryView = await freshView();
    mocks.currentOwner.mockResolvedValueOnce("a").mockResolvedValueOnce("b");
    const forA = await loadLibraryView({}, { reuse: true });
    const forB = await loadLibraryView({}, { reuse: true });
    expect(mocks.loadLibrary).toHaveBeenCalledTimes(2);
    expect(forB).not.toBe(forA);
    // Owner a's own copy is still theirs.
    mocks.currentOwner.mockResolvedValue("a");
    expect(await loadLibraryView({}, { reuse: true })).toBe(forA);
    expect(mocks.loadLibrary).toHaveBeenCalledTimes(2);
  });

  it("is keyed by its filters too", async () => {
    const loadLibraryView = await freshView();
    const notes = await loadLibraryView({ kind: "note" }, { reuse: true });
    const videos = await loadLibraryView({ kind: "video" }, { reuse: true });
    expect(videos).not.toBe(notes);
    expect(mocks.loadLibrary).toHaveBeenCalledTimes(2);
  });

  it("is read again once it is older than a minute", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-07T10:00:00Z"));
    const loadLibraryView = await freshView();
    const first = await loadLibraryView({}, { reuse: true });
    vi.setSystemTime(new Date("2026-11-07T10:00:59Z"));
    expect(await loadLibraryView({}, { reuse: true })).toBe(first);
    expect(mocks.loadLibrary).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-11-07T10:01:01Z"));
    const later = await loadLibraryView({}, { reuse: true });
    expect(later).not.toBe(first);
    expect(mocks.loadLibrary).toHaveBeenCalledTimes(2);
  });

  it("is never taken by the page, which reads every time and replaces it", async () => {
    const loadLibraryView = await freshView();
    const first = await loadLibraryView({});
    const second = await loadLibraryView({});
    expect(second).not.toBe(first);
    expect(mocks.loadLibrary).toHaveBeenCalledTimes(2);
    // The scroll after the page goes on from the page's newest view.
    expect(await loadLibraryView({}, { reuse: true })).toBe(second);
    expect(mocks.loadLibrary).toHaveBeenCalledTimes(2);
  });

  it("is not kept when the catalog was unreachable", async () => {
    const loadLibraryView = await freshView();
    mocks.loadLibrary.mockImplementationOnce(async () => library(false));
    const down = await loadLibraryView({}, { reuse: true });
    expect(down.library.reachable).toBe(false);
    const up = await loadLibraryView({}, { reuse: true });
    expect(up.library.reachable).toBe(true);
    expect(mocks.loadLibrary).toHaveBeenCalledTimes(2);
  });
});
