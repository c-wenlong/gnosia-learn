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

// Notes named after `Object.prototype` members, beside an ordinary one.
const notes = ["graphs", "constructor", "__proto__"].map((slug) => ({
  id: `note:learn/concepts/x/${slug}.md`,
  kind: "note",
  path: `learn/concepts/x/${slug}.md`,
  url: null,
  bytes: 10,
  title: slug,
  sourceRepo: "gnosia",
  topics: [],
}));

vi.mock("@/lib/learner-store", () => ({ catalogDatabase: async () => ({}) }));

const assetParents = vi.hoisted(() => vi.fn(async (): Promise<Record<string, unknown>> => ({})));

vi.mock("@gnosia/catalog/state", () => ({
  assetParents,
  listAssets: async (_db: unknown, filter: { ids?: string[]; kind?: string } = {}) =>
    filter.kind === "note"
      ? notes
      : filter.ids === undefined
        ? rows
        : [...rows, ...notes].filter((r) => filter.ids!.includes(r.id)),
  assetCounts: async () => [{ kind: "video", count: 1 }],
  assetDerivations: async () => ({ sources: [], derived: [] }),
  readAssetNaming: async () => null,
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

const { loadAssetParents, readLibrary, readAssetDetail, readSearchText, searchableText } = await import(
  "@/lib/asset-library"
);

describe("loadAssetParents, for the previewer's Conversation tool", () => {
  const made = { places: [], concepts: [], conversations: [{ id: "d1", title: "T", name: null, updatedAt: null }], sessions: [] };

  it("asks for the one asset, as the owner, and answers its parents", async () => {
    assetParents.mockResolvedValueOnce({ "manimkc:out/x/y.mp4": made });
    expect(await loadAssetParents("manimkc:out/x/y.mp4")).toEqual(made);
    const call = assetParents.mock.calls.at(-1) as unknown as [unknown, string[], { owner: string }];
    expect(call[1]).toEqual(["manimkc:out/x/y.mp4"]);
    expect(call[2].owner).toBe("local");
  });

  it("answers undefined for an asset with no parent, and for one named like a prototype member", async () => {
    assetParents.mockResolvedValueOnce({});
    expect(await loadAssetParents("manimkc:out/x/y.mp4")).toBeUndefined();
    assetParents.mockResolvedValueOnce({});
    expect(await loadAssetParents("constructor")).toBeUndefined();
  });

  it("answers undefined when the read fails, costing the tool and not the panel", async () => {
    assetParents.mockRejectedValueOnce(new Error("parents unavailable"));
    expect(await loadAssetParents("manimkc:out/x/y.mp4")).toBeUndefined();
  });
});

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

describe("an asset id the catalog does not hold", () => {
  it("is no asset, on a reachable catalog", async () => {
    const detail = await readAssetDetail("manimkc:out/nowhere.mp4");
    expect(detail.asset).toBeNull();
    expect(detail.reachable).toBe(true);
  });
});

describe("the wikilink index", () => {
  it("links a note whose slug is an Object.prototype member", async () => {
    const detail = await readAssetDetail("note:learn/concepts/x/graphs.md");
    expect(Object.hasOwn(detail.notes, "__proto__")).toBe(true);
    expect(Object.hasOwn(detail.notes, "constructor")).toBe(true);
    expect(detail.notes).toEqual({
      graphs: "note:learn/concepts/x/graphs.md",
      constructor: "note:learn/concepts/x/constructor.md",
      ["__proto__"]: "note:learn/concepts/x/__proto__.md",
    });
  });
});

describe("a failing concept-link lookup", () => {
  it("still returns the rows, with no concept chips", async () => {
    // The Library's concepts come from the parents read now, so that is the one to fail.
    assetParents.mockRejectedValueOnce(new Error("parents unavailable"));
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
      [{ ...rows[0]!, id: "manimkc:out/x/y.transcript.json", kind: "transcript", path: "out/x/y.transcript.json", createdAt: "", updatedAt: "", editedAt: null }],
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

describe("mapLimited, which search reads its files through", () => {
  it("keeps the input's order and never runs more than the limit at once", async () => {
    const { mapLimited } = await import("./asset-library");
    let running = 0;
    let most = 0;
    const out = await mapLimited(Array.from({ length: 30 }, (_, i) => i), 4, async (i) => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, (i * 7) % 5));
      running -= 1;
      return i * 2;
    });
    expect(out).toEqual(Array.from({ length: 30 }, (_, i) => i * 2));
    expect(most).toBe(4);
  });

  it("answers an empty list with an empty list", async () => {
    const { mapLimited } = await import("./asset-library");
    expect(await mapLimited([], 8, async () => 1)).toEqual([]);
  });
});
