import { describe, expect, it } from "vitest";
import {
  assetFileHref,
  assetHref,
  compareByKindThenId,
  decodeAssetId,
  firstParam,
  isCompanionKind,
  kindFacets,
  kindNoun,
  kindRank,
  libraryHref,
  topicFacets,
} from "./library";

/** The catalog's real per-kind counts, which the default view is designed against. */
const COUNTS = [
  { kind: "captions", count: 23 },
  { kind: "chapters", count: 23 },
  { kind: "diagram_source", count: 2 },
  { kind: "diagram_svg", count: 2 },
  { kind: "link", count: 68 },
  { kind: "note", count: 32 },
  { kind: "session", count: 3 },
  { kind: "transcript", count: 23 },
  { kind: "video", count: 30 },
];

describe("isCompanionKind", () => {
  it("names the four kinds that accompany something else", () => {
    for (const kind of ["transcript", "captions", "chapters", "diagram_source"]) {
      expect(isCompanionKind(kind)).toBe(true);
    }
  });

  it("shows a kind nobody has classified yet", () => {
    // The safe direction: a new indexer's rows turn up in the library on their
    // first index run rather than being filtered out by a list nobody updated.
    expect(isCompanionKind("podcast")).toBe(false);
    expect(isCompanionKind("video")).toBe(false);
    expect(isCompanionKind("diagram_svg")).toBe(false);
  });
});

describe("kindFacets", () => {
  it("splits the catalog into 135 standalone rows and 71 companions", () => {
    const facets = kindFacets(COUNTS);
    expect(facets.total).toBe(206);
    expect(facets.standalone).toBe(135);
    expect(facets.total - facets.standalone).toBe(71);
  });

  it("ranks the primary rail by what is worth opening, not alphabetically", () => {
    expect(kindFacets(COUNTS).primary.map((f) => f.kind)).toEqual([
      "video",
      "diagram_svg",
      "note",
      "session",
      "link",
    ]);
  });

  it("labels a chip the same way a card does", () => {
    const facets = kindFacets(COUNTS);
    expect(facets.primary.find((f) => f.kind === "diagram_svg")?.label).toBe("Diagram");
    expect(facets.companion.find((f) => f.kind === "diagram_source")?.label).toBe("Diagram source");
  });

  it("offers no chip for a kind with no rows", () => {
    const facets = kindFacets([{ kind: "video", count: 4 }]);
    expect(facets.primary).toHaveLength(1);
    expect(facets.companion).toHaveLength(0);
    expect(facets.standalone).toBe(4);
  });

  it("puts an unknown kind last rather than first", () => {
    const facets = kindFacets([...COUNTS, { kind: "podcast", count: 1 }]);
    expect(facets.primary.at(-1)?.kind).toBe("podcast");
    expect(facets.standalone).toBe(136);
  });
});

describe("compareByKindThenId", () => {
  it("leads with video, where the catalog's own kind ordering leads with captions", () => {
    const rows = [
      { kind: "note", id: "note:b" },
      { kind: "captions", id: "manimkc:a.vtt" },
      { kind: "video", id: "manimkc:b.mp4" },
      { kind: "video", id: "manimkc:a.mp4" },
      { kind: "diagram_svg", id: "diagram:d.svg" },
    ];
    expect([...rows].sort(compareByKindThenId).map((r) => r.id)).toEqual([
      "manimkc:a.mp4",
      "manimkc:b.mp4",
      "diagram:d.svg",
      "note:b",
      "manimkc:a.vtt",
    ]);
  });

  it("orders two unranked kinds by name, then by id", () => {
    expect(kindRank("podcast")).toBe(kindRank("zine"));
    const rows = [
      { kind: "zine", id: "z:1" },
      { kind: "podcast", id: "p:2" },
      { kind: "podcast", id: "p:1" },
    ];
    expect([...rows].sort(compareByKindThenId).map((r) => r.id)).toEqual(["p:1", "p:2", "z:1"]);
  });

  it("compares ids by code unit, not by locale", () => {
    // The same argument `byKindThenId` in the catalog makes: an id is full of
    // the punctuation where locale collation and byte order disagree, so two
    // machines must not order one grid two ways.
    const rows = [
      { kind: "video", id: "manimkc:out/b" },
      { kind: "video", id: "manimkc:out-a" },
    ];
    expect([...rows].sort(compareByKindThenId).map((r) => r.id)).toEqual([
      "manimkc:out-a",
      "manimkc:out/b",
    ]);
  });
});

describe("kindNoun", () => {
  it("pluralises a label, except when it already ends in one", () => {
    expect(kindNoun("Video", 30)).toBe("videos");
    expect(kindNoun("Session log", 3)).toBe("session logs");
    expect(kindNoun("Diagram source", 2)).toBe("diagram sources");
    expect(kindNoun("Captions", 23)).toBe("captions");
    expect(kindNoun("Chapters", 23)).toBe("chapters");
  });

  it("leaves a count of one singular", () => {
    expect(kindNoun("Video", 1)).toBe("video");
    expect(kindNoun("Session log", 1)).toBe("session log");
  });

  it("pluralises a zero, which is what an empty filtered view shows", () => {
    expect(kindNoun("Session log", 0)).toBe("session logs");
  });
});

describe("topicFacets", () => {
  it("counts a row once per topic it is filed under, biggest first", () => {
    expect(
      topicFacets([
        { topics: ["vectors", "algorithms"] },
        { topics: ["algorithms"] },
        { topics: [] },
        { topics: ["zebras"] },
      ]),
    ).toEqual([
      { slug: "algorithms", count: 2 },
      { slug: "vectors", count: 1 },
      { slug: "zebras", count: 1 },
    ]);
  });

  it("has nothing to offer when nothing is filed", () => {
    expect(topicFacets([{ topics: [] }])).toEqual([]);
  });
});

describe("libraryHref", () => {
  it("drops an absent filter rather than writing an empty value", () => {
    expect(libraryHref({})).toBe("/library");
    expect(libraryHref({ kind: null, topic: null })).toBe("/library");
    expect(libraryHref({ kind: "video" })).toBe("/library?kind=video");
    expect(libraryHref({ topic: "recurrence-relations" })).toBe(
      "/library?topic=recurrence-relations",
    );
    expect(libraryHref({ kind: "note", topic: "vectors" })).toBe(
      "/library?kind=note&topic=vectors",
    );
  });
});

describe("assetHref and assetFileHref", () => {
  it("encode an id whole, colons and slashes included", () => {
    const id = "manimkc:out/algorithms/cs3230-assignment-1/cs3230_a1.mp4";
    expect(assetHref(id)).toBe(
      "/library/manimkc%3Aout%2Falgorithms%2Fcs3230-assignment-1%2Fcs3230_a1.mp4",
    );
    expect(assetFileHref(id)).toBe(
      "/api/assets/manimkc%3Aout%2Falgorithms%2Fcs3230-assignment-1%2Fcs3230_a1.mp4/file",
    );
  });

  it("survives the round trip the page has to make by hand", () => {
    // Next 16 hands a page its dynamic segment still encoded, so the page
    // decodes. Without this the lookup misses and every asset 404s.
    for (const id of [
      "diagram:learn/assets/dot-product.svg",
      "manimkc:out/algorithms/cs3230-assignment-1/cs3230_a1.mp4",
      "note:learn/concepts/algorithms/case-analysis-worst-best-average.md",
      "link:cs3216-m3-r1",
    ]) {
      expect(decodeAssetId(assetHref(id).slice("/library/".length))).toBe(id);
    }
  });
});

describe("decodeAssetId", () => {
  it("hands a malformed escape back rather than throwing", () => {
    // `decodeURIComponent` raises URIError on these, and a hand-typed URL is
    // the ordinary way to produce one. An id nothing matches is a 404, which
    // is the right answer; a crash is not.
    expect(decodeAssetId("100%")).toBe("100%");
    expect(decodeAssetId("%E0%A4%A")).toBe("%E0%A4%A");
  });

  it("leaves a segment with nothing to decode alone", () => {
    expect(decodeAssetId("plain-id")).toBe("plain-id");
  });
});

describe("firstParam", () => {
  it("takes the first value of a repeated key", () => {
    expect(firstParam(["video", "note"])).toBe("video");
  });

  it("treats absent and empty as no filter", () => {
    expect(firstParam(undefined)).toBeNull();
    expect(firstParam("")).toBeNull();
    expect(firstParam([])).toBeNull();
  });

  it("passes a single value through", () => {
    expect(firstParam("video")).toBe("video");
  });
});
