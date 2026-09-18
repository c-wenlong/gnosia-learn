import { describe, expect, it } from "vitest";

import {
  DEFAULT_VIEW,
  NO_TOPIC,
  canvasHref,
  displayTitle,
  filterDiagrams,
  formatBytes,
  freshness,
  groupDiagrams,
  panelHref,
  parsePanel,
  parseView,
  relativeTime,
  sortDiagrams,
  studioHref,
  thumbnailHref,
  toggleTopic,
  topicChips,
  type Diagram,
  type StudioView,
} from "./studio-view";

/**
 * The browser screen's decisions, tested where they live.
 *
 * `apps/web/src/app` and `apps/web/src/components` are view code and untested
 * by design, which is exactly why the grouping, the sorting, the chip facets
 * and the freshness wording are in a pure module rather than inside a page.
 */

function diagram(over: Partial<Diagram> = {}): Diagram {
  const name = over.name ?? "dot-product";
  return {
    name,
    tldr: {
      path: `learn/assets/${name}.tldr`,
      exists: true,
      modified: "2026-09-13T08:58:47.323Z",
      bytes: 25_636,
    },
    svg: {
      path: `learn/assets/${name}.svg`,
      exists: true,
      modified: "2026-09-13T11:15:00.000Z",
      bytes: 313_282,
    },
    title: "The dot product",
    topic: "vector-and-linear-algebra-basics",
    concepts: ["dot-product"],
    source: null,
    shapes: 44,
    created: "2026-09-13T08:41:45.631Z",
    svgState: "current",
    ...over,
  };
}

const titles = new Map([["vector-and-linear-algebra-basics", "Vectors and linear algebra"]]);
const domains = new Map([["vector-and-linear-algebra-basics", "mathematics"]]);

describe("reading the view out of the URL", () => {
  it("is the default with nothing in the query string", () => {
    expect(parseView({})).toEqual(DEFAULT_VIEW);
  });

  it("takes topics from a comma list and from a repeated parameter alike", () => {
    expect(parseView({ topic: "a,b" }).topics).toEqual(["a", "b"]);
    expect(parseView({ topic: ["a", "b,c"] }).topics).toEqual(["a", "b", "c"]);
  });

  it("drops duplicates, so a chip clicked twice is not two filters", () => {
    expect(parseView({ topic: "a,a,b" }).topics).toEqual(["a", "b"]);
  });

  it("falls back on a value it does not recognise rather than throwing at somebody", () => {
    // A hand-edited or stale link is a thing a person typed, not an error.
    expect(parseView({ sort: "colour", group: "planet", view: "carousel" })).toMatchObject({
      sort: "modified",
      group: "none",
      layout: "grid",
    });
  });
});

describe("writing the view back into a URL", () => {
  it("writes nothing that is already the default", () => {
    expect(studioHref(DEFAULT_VIEW)).toBe("/studio");
  });

  it("round-trips every field it does write", () => {
    const view: StudioView = {
      topics: ["alpha", NO_TOPIC],
      query: "dot",
      group: "domain",
      sort: "title",
      direction: "asc",
      chips: true,
      layout: "list",
      selected: "dot-product",
      panel: false,
      job: "job-1",
      brief: "job-2",
      stream: false,
    };
    const href = studioHref(view);
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseView(params)).toEqual(view);
  });

  it("toggles a topic on and back off", () => {
    const once = toggleTopic(DEFAULT_VIEW, "alpha");
    expect(once.topics).toEqual(["alpha"]);
    expect(toggleTopic(once, "alpha").topics).toEqual([]);
  });
});

describe("the topic chips", () => {
  it("counts what is in the directory, not the whole vocabulary", () => {
    const chips = topicChips([diagram(), diagram({ name: "b" })], titles, domains);
    expect(chips[0]).toMatchObject({
      slug: "vector-and-linear-algebra-basics",
      label: "Vectors and linear algebra",
      domain: "mathematics",
      count: 2,
    });
  });

  it("always ends with No topic, even at zero, because its absence is the news", () => {
    const chips = topicChips([diagram()], titles, domains);
    expect(chips.at(-1)).toMatchObject({ slug: NO_TOPIC, label: "No topic", count: 0 });
  });

  it("counts the untopiced ones under that chip and under no other", () => {
    const chips = topicChips([diagram(), diagram({ name: "b", topic: null })], titles, domains);
    expect(chips.at(-1)?.count).toBe(1);
    expect(chips[0]?.count).toBe(1);
  });
});

describe("filtering", () => {
  const corpus = [
    diagram(),
    diagram({ name: "loose", topic: null, title: null, concepts: [] }),
  ];

  it("keeps everything with no chips selected", () => {
    expect(filterDiagrams(corpus, DEFAULT_VIEW)).toHaveLength(2);
  });

  it("ORs the chips within themselves", () => {
    const view = { ...DEFAULT_VIEW, topics: ["vector-and-linear-algebra-basics", NO_TOPIC] };
    expect(filterDiagrams(corpus, view)).toHaveLength(2);
  });

  it("uses the No topic chip to reach the diagrams the indexer refuses", () => {
    const view = { ...DEFAULT_VIEW, topics: [NO_TOPIC] };
    expect(filterDiagrams(corpus, view).map((entry) => entry.name)).toEqual(["loose"]);
  });

  it("searches the name, the title, the topic and the concepts", () => {
    const view = { ...DEFAULT_VIEW, query: "DOT-PRODUCT" };
    expect(filterDiagrams(corpus, view).map((entry) => entry.name)).toEqual(["dot-product"]);
  });
});

describe("sorting", () => {
  const older = diagram({ name: "older", tldr: { ...diagram().tldr, modified: "2026-01-01T00:00:00.000Z" } });
  const newer = diagram({ name: "newer" });
  const undated = diagram({ name: "undated", tldr: { ...diagram().tldr, modified: null }, created: null });

  it("puts the newest first by default", () => {
    const sorted = sortDiagrams([older, newer], DEFAULT_VIEW);
    expect(sorted.map((entry) => entry.name)).toEqual(["newer", "older"]);
  });

  it("flips with the direction", () => {
    const sorted = sortDiagrams([older, newer], { ...DEFAULT_VIEW, direction: "asc" });
    expect(sorted.map((entry) => entry.name)).toEqual(["older", "newer"]);
  });

  it("sorts undated last whichever way the arrow points", () => {
    // Reversing the list instead would float the undated to the top on one of
    // the two directions, which reads as a claim about when they were made.
    for (const direction of ["asc", "desc"] as const) {
      const sorted = sortDiagrams([undated, older, newer], { ...DEFAULT_VIEW, direction });
      expect(sorted.at(-1)?.name).toBe("undated");
    }
  });

  it("sorts titles A to Z when the direction is ascending", () => {
    const a = diagram({ name: "a", title: "Alpha" });
    const z = diagram({ name: "z", title: "Zulu" });
    const view = { ...DEFAULT_VIEW, sort: "title" as const, direction: "asc" as const };
    expect(sortDiagrams([z, a], view).map((entry) => entry.title)).toEqual(["Alpha", "Zulu"]);
  });

  it("falls back to the filename stem for a document with no stamped title", () => {
    expect(displayTitle(diagram({ title: null, name: "loose" }))).toBe("loose");
  });
});

describe("grouping", () => {
  const corpus = [diagram(), diagram({ name: "loose", topic: null })];

  it("is one unlabelled group when Display says none", () => {
    const groups = groupDiagrams(corpus, DEFAULT_VIEW, titles, domains);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("");
  });

  it("labels a topic group with its title rather than its slug", () => {
    const groups = groupDiagrams(corpus, { ...DEFAULT_VIEW, group: "topic" }, titles, domains);
    expect(groups[0]?.label).toBe("Vectors and linear algebra");
  });

  it("puts the missing group last, the way its chip is last", () => {
    const groups = groupDiagrams(corpus, { ...DEFAULT_VIEW, group: "domain" }, titles, domains);
    expect(groups.map((group) => group.label)).toEqual(["mathematics", "No domain"]);
  });
});

describe("the words", () => {
  const now = Date.parse("2026-09-13T12:00:00.000Z");

  it.each([
    ["2026-09-13T11:59:30.000Z", "just now"],
    ["2026-09-13T11:30:00.000Z", "30 minutes ago"],
    ["2026-09-13T11:00:00.000Z", "1 hour ago"],
    ["2026-09-11T12:00:00.000Z", "2 days ago"],
    ["2026-01-01T12:00:00.000Z", "2026-01-01"],
  ])("says %s is %s", (iso, expected) => {
    expect(relativeTime(iso, now)).toBe(expected);
  });

  it("says never rather than inventing a time for a file that is not there", () => {
    expect(relativeTime(null, now)).toBe("never");
  });

  it.each([
    ["current", "SVG current", "ok"],
    ["stale", "SVG stale", "warn"],
    ["missing", "No SVG", "warn"],
  ] as const)("reads %s as %s", (state, label, tone) => {
    expect(freshness(state)).toMatchObject({ label, tone });
  });

  it.each([
    [null, null],
    [512, "512 B"],
    [213_962, "209 kB"],
    [3_500_000, "3.3 MB"],
  ])("formats %s bytes as %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe("the hrefs", () => {
  it("escapes a name into the canvas route", () => {
    expect(canvasHref("dot product")).toBe("/studio/d/dot%20product");
  });

  it("points a thumbnail at the studio's own proxy and not at the library's file route", () => {
    // `/api/assets/{id}/file` needs ASSET_FILES_ENABLED *and* an indexed asset,
    // and an untopiced diagram has no asset row at all. That is the tile that
    // matters most, so it cannot be the one that breaks.
    expect(thumbnailHref("dot-product")).toBe("/studio/api/diagrams/dot-product/svg");
  });
});

/**
 * The right panel has three contents and the URL says which.
 *
 * In the query string rather than in a component, for the reason the filters
 * are: opening a job and opening the brief form are things a person navigates
 * to, comes back from, and hands to somebody else as a link. The job *state* is
 * not here — the runner holds that, and these are pointers at it.
 */
describe("what the right panel holds", () => {
  it("reads a job and a blank form apart from a prefilled one", () => {
    expect(parsePanel({ job: "job-1" })).toMatchObject({ job: "job-1", brief: null });
    // `?new=` is a blank form and `?new=job-1` is one prefilled from that job.
    // An empty value is meaningful, which is why this is not read like the rest.
    expect(parsePanel({ new: "" })).toMatchObject({ brief: "" });
    expect(parsePanel({ new: "job-1" })).toMatchObject({ brief: "job-1" });
    expect(parsePanel({})).toMatchObject({ job: null, brief: null, stream: true });
  });

  it("turns the stream off only on the word that means it", () => {
    expect(parsePanel({ stream: "off" }).stream).toBe(false);
    expect(parsePanel({ stream: "on" }).stream).toBe(true);
    expect(parsePanel({}).stream).toBe(true);
  });

  it("patches a path that is not /studio, which is what the canvas route needs", () => {
    expect(panelHref("/studio/d/dot-product", { job: "job-1" })).toBe(
      "/studio/d/dot-product?job=job-1",
    );
    expect(panelHref("/studio?sel=dot-product", { brief: "" })).toBe("/studio?sel=dot-product&new=");
  });

  it("closes one by dropping its parameter rather than by adding another", () => {
    expect(panelHref("/studio/d/x?job=job-1", { job: null })).toBe("/studio/d/x");
  });

  it("drops a verb outcome, so a stale message does not read as this panel's", () => {
    expect(panelHref("/studio?v=export&ok=0&m=it+failed", { job: "job-1" })).toBe("/studio?job=job-1");
  });
});
