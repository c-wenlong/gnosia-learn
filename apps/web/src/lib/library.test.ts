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
  conceptHref,
  courseFacets,
  explainedConcepts,
  filterRows,
  libraryHref,
  parseView,
  addedOn,
  matchesAll,
  parseSort,
  searchHits,
  searchTerms,
  sortRows,
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
  it("names the five kinds that accompany something else", () => {
    for (const kind of ["transcript", "captions", "chapters", "diagram_source", "poster"]) {
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

  it("carries the course, the query and a non-default sort, and never writes the default", () => {
    expect(libraryHref({ course: "cp4281", q: "  dot product ", sort: "title" })).toBe(
      "/library?course=cp4281&q=dot+product&sort=title",
    );
    expect(libraryHref({ q: "   ", sort: "newest" })).toBe("/library");
    // A literal plus survives as %2B, distinct from the + that spells a space.
    expect(libraryHref({ q: "c++ templates" })).toBe("/library?q=c%2B%2B+templates");
  });

  it("writes the list layout and never the grid, which is the default", () => {
    expect(libraryHref({ view: "list" })).toBe("/library?view=list");
    expect(libraryHref({ kind: "video", sort: "title", view: "list" })).toBe(
      "/library?kind=video&sort=title&view=list",
    );
    expect(libraryHref({ view: "grid" })).toBe("/library");
  });
});

describe("parseView", () => {
  it("reads list and treats anything else as the grid", () => {
    expect(parseView("list")).toBe("list");
    expect(parseView("grid")).toBe("grid");
    expect(parseView("table")).toBe("grid");
    expect(parseView(null)).toBe("grid");
    expect(parseView(undefined)).toBe("grid");
  });
});

describe("addedOn", () => {
  it("prints the UTC day a row entered the catalog", () => {
    expect(addedOn("2026-10-04T09:30:00Z")).toBe("4 Oct 2026");
    // Late in the day UTC is still that day, whatever the server's zone.
    expect(addedOn("2026-09-30T23:59:59Z")).toBe("30 Sept 2026");
  });

  it("returns null for a timestamp that does not parse", () => {
    expect(addedOn("not a date")).toBeNull();
    expect(addedOn("")).toBeNull();
  });
});

describe("parseSort", () => {
  it("reads title, and anything else as the default", () => {
    expect(parseSort("title")).toBe("title");
    expect(parseSort("newest")).toBe("newest");
    expect(parseSort(null)).toBe("newest");
    expect(parseSort("ascending; drop table")).toBe("newest");
  });
});

/** A row as `listAssets` returns it, trimmed to what the view functions read. */
function row(
  id: string,
  over: Partial<{
    kind: string;
    title: string | null;
    path: string | null;
    url: string | null;
    topics: string[];
    createdAt: string;
  }> = {},
) {
  return {
    id,
    kind: "video",
    title: null,
    path: `out/${id}.mp4`,
    url: null,
    bytes: null,
    topics: [],
    createdAt: "2026-09-13T00:00:00.000Z",
    ...over,
  };
}

describe("searchTerms", () => {
  it("lowercases, splits on whitespace and drops repeats", () => {
    expect(searchTerms("  Dot   PRODUCT dot\tprojection ")).toEqual(["dot", "product", "projection"]);
  });

  it("is empty for no query, which means no search rather than no results", () => {
    expect(searchTerms(null)).toEqual([]);
    expect(searchTerms("")).toEqual([]);
    expect(searchTerms("   ")).toEqual([]);
  });

  it("stops at eight words and two hundred characters", () => {
    expect(searchTerms("a b c d e f g h i j")).toHaveLength(8);
    expect(searchTerms(`${"x".repeat(300)}`)[0]).toHaveLength(200);
  });
});

describe("matchesAll", () => {
  it("wants every word, in any order, anywhere", () => {
    expect(matchesAll("The Dot Product, projected", ["product", "dot"])).toBe(true);
    expect(matchesAll("The Dot Product", ["dot", "cross"])).toBe(false);
    expect(matchesAll("anything", [])).toBe(true);
  });
});

describe("searchHits", () => {
  const rows = [
    row("v1", { title: "Barycentric interpolation" }),
    row("t1", { kind: "transcript", path: "out/v1.transcript.json" }),
    row("n1", { kind: "note", title: "Dot product", path: "learn/concepts/la/dot-product.md" }),
    row("n2", { kind: "note", title: "Cross product", path: "learn/concepts/la/cross-product.md" }),
    row("l1", { kind: "link", title: null, path: null, url: "https://www.scratchapixel.com/raster" }),
  ];

  it("matches a title, whatever the case", () => {
    expect([...searchHits(rows, ["barycentric"], new Map(), {})]).toEqual(["v1"]);
  });

  it("matches a filename or a URL when the row has no title", () => {
    expect([...searchHits(rows, ["scratchapixel"], new Map(), {})]).toEqual(["l1"]);
    expect([...searchHits(rows, ["transcript.json"], new Map(), {})]).toEqual(["t1"]);
  });

  it("matches what a note says, when its words were read", () => {
    const texts = new Map([["n2", "the cross product is perpendicular to both"]]);
    expect([...searchHits(rows, ["perpendicular"], texts, {})]).toEqual(["n2"]);
  });

  it("wants every word, and lets them come from the title and the text together", () => {
    const texts = new Map([["n1", "a projection onto a line"]]);
    expect([...searchHits(rows, ["dot", "projection"], texts, {})]).toEqual(["n1"]);
    expect([...searchHits(rows, ["cross", "projection"], texts, {})]).toEqual([]);
  });

  it("lifts a line said in a transcript to the video it belongs to", () => {
    const texts = new Map([["t1", "each weight is the area of the opposite sub-triangle"]]);
    const hits = searchHits(rows, ["sub-triangle"], texts, { t1: ["v1"] });
    expect([...hits].sort()).toEqual(["t1", "v1"]);
  });

  it("finds nothing when nothing matches", () => {
    expect(searchHits(rows, ["quaternion"], new Map(), {}).size).toBe(0);
  });
});

describe("filterRows", () => {
  const rows = [
    row("v1", { topics: ["barycentric"] }),
    row("t1", { kind: "transcript", topics: ["barycentric"] }),
    row("n1", { kind: "note", topics: ["dot-product"] }),
    row("l1", { kind: "link", topics: [] }),
  ];
  const none = { kind: null, topic: null, courseTopics: null, hits: null };
  const ids = (out: { id: string }[]) => out.map((r) => r.id);

  it("shows every standalone row by default, and no companion", () => {
    expect(ids(filterRows(rows, none))).toEqual(["v1", "n1", "l1"]);
  });

  it("shows a companion kind when it is the one asked for", () => {
    expect(ids(filterRows(rows, { ...none, kind: "transcript" }))).toEqual(["t1"]);
  });

  it("narrows to a course through its modules' topics", () => {
    expect(ids(filterRows(rows, { ...none, courseTopics: new Set(["dot-product", "nothing"]) }))).toEqual([
      "n1",
    ]);
    // A course with no topics (an unknown slug) matches nothing, not everything.
    expect(filterRows(rows, { ...none, courseTopics: new Set() })).toEqual([]);
  });

  it("narrows to a topic", () => {
    expect(ids(filterRows(rows, { ...none, topic: "barycentric" }))).toEqual(["v1"]);
  });

  it("keeps a search hit only if it passes the other filters too", () => {
    const hits = new Set(["v1", "t1", "n1"]);
    expect(ids(filterRows(rows, { ...none, hits }))).toEqual(["v1", "n1"]);
    expect(ids(filterRows(rows, { ...none, hits, kind: "note" }))).toEqual(["n1"]);
    expect(filterRows(rows, { ...none, hits: new Set() })).toEqual([]);
  });
});

describe("sortRows", () => {
  const rows = [
    row("b", { title: "beta", createdAt: "2026-09-13T00:00:00.000Z" }),
    row("a", { title: "Alpha", createdAt: "2026-09-14T00:00:00.000Z" }),
    row("c", { title: "gamma 10", createdAt: "2026-09-12T00:00:00.000Z" }),
    row("d", { title: "gamma 9", createdAt: "2026-09-12T00:00:00.000Z" }),
    row("e", { kind: "note", title: "Epsilon", createdAt: "2026-09-13T00:00:00.000Z" }),
  ];
  const ids = (out: { id: string }[]) => out.map((r) => r.id);

  it("puts the newest first, and breaks a tie by kind then id", () => {
    // b and e entered together; video ranks before note.
    expect(ids(sortRows(rows, "newest"))).toEqual(["a", "b", "e", "c", "d"]);
  });

  it("sorts by the name on the card, ignoring case and reading numbers as numbers", () => {
    expect(ids(sortRows(rows, "title"))).toEqual(["a", "b", "e", "d", "c"]);
  });

  it("does not reorder its input", () => {
    const copy = [...rows];
    sortRows(rows, "title");
    expect(rows).toEqual(copy);
  });
});

describe("courseFacets", () => {
  const courses = [
    { slug: "cp4281", code: "CP4281", title: "Graphics", topics: ["barycentric", "rasterisation"] },
    { slug: "cs3216", code: "CS3216", title: "Apps", topics: ["product-design"] },
    { slug: "empty", code: "EMPTY", title: "Nothing filed", topics: ["nowhere"] },
  ];
  const rows = [
    row("v1", { topics: ["barycentric"] }),
    row("t1", { kind: "transcript", topics: ["barycentric"] }),
    row("n1", { kind: "note", topics: ["rasterisation", "barycentric"] }),
    row("l1", { kind: "link", topics: ["product-design"] }),
  ];

  it("counts standalone rows under any of a course's topics, once each, in the order given", () => {
    expect(courseFacets(courses, rows)).toEqual([
      { slug: "cp4281", code: "CP4281", title: "Graphics", count: 2 },
      { slug: "cs3216", code: "CS3216", title: "Apps", count: 1 },
    ]);
  });
});

describe("explainedConcepts", () => {
  const kb = new Map([
    ["dot-product", { title: "Dot product", mastery: "mastered" as const, pL: 0.96, observations: 4 }],
    ["cross-product", { title: "Cross product", mastery: "shaky" as const, pL: 0.55, observations: 2 }],
    ["norm", { title: "Norm", mastery: "gap" as const, pL: 0.25, observations: 0 }],
  ]);

  it("titles each slug and buckets it by mastery, in the order given", () => {
    expect(explainedConcepts(["dot-product", "cross-product", "norm"], kb)).toEqual([
      { slug: "dot-product", title: "Dot product", bucket: "mastered", pL: 0.96, observations: 4 },
      { slug: "cross-product", title: "Cross product", bucket: "learning", pL: 0.55, observations: 2 },
      { slug: "norm", title: "Norm", bucket: "untouched", pL: 0.25, observations: 0 },
    ]);
  });

  it("keeps a slug the knowledge base does not know, as an untouched concept named by its slug", () => {
    expect(explainedConcepts(["ghost"], kb)).toEqual([
      { slug: "ghost", title: "ghost", bucket: "untouched", pL: null, observations: 0 },
    ]);
  });
});

describe("conceptHref", () => {
  it("points at the concept's workspace", () => {
    expect(conceptHref("dot-product")).toBe("/learn/dot-product");
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
