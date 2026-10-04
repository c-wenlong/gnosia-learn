import { describe, expect, it } from "vitest";

import {
  shotTitle,
  conversationHref,
  extendFromHref,
  DEFAULT_VIEW,
  NO_TOPIC,
  canvasHref,
  displayTitle,
  filterDiagrams,
  formatBytes,
  freshness,
  groupDiagrams,
  panelHref,
  browserPanelMove,
  browserViewMove,
  CLOSED,
  gridHref,
  panelSignature,
  parsePanel,
  parseView,
  rawParamsOf,
  showsKind,
  withoutOutcome,
  relativeTime,
  sortDiagrams,
  studioHref,
  thumbnailHref,
  titleOf,
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
      kind: "video",
      selected: "dot-product",
      panel: false,
      job: "job-1",
      extend: "tailscale",
      talk: true,
      stream: false,
      shot: "after",
      draft: "draft-1",
      settings: true,
      play: "attention-weights",
    };
    const href = studioHref(view);
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseView(params)).toEqual(view);
  });

  it("writes the kind only when it narrows, and reads an unknown one as all", () => {
    expect(studioHref(DEFAULT_VIEW, { kind: "all" })).toBe("/studio");
    expect(studioHref(DEFAULT_VIEW, { kind: "diagram" })).toBe("/studio?kind=diagram");
    expect(parseView({ kind: "video" }).kind).toBe("video");
    expect(parseView({ kind: "all" }).kind).toBe("all");
    expect(parseView({ kind: "picture" }).kind).toBe("all");
    expect(parseView({ kind: ["diagram", "video"] }).kind).toBe("diagram");
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

  it("keeps the diagrams under All and Diagrams, and none under Videos (D85)", () => {
    const all = [diagram({ name: "a" }), diagram({ name: "b", topic: null })];
    expect(filterDiagrams(all, { ...DEFAULT_VIEW, kind: "all" })).toHaveLength(2);
    expect(filterDiagrams(all, { ...DEFAULT_VIEW, kind: "diagram" })).toHaveLength(2);
    expect(filterDiagrams(all, { ...DEFAULT_VIEW, kind: "video" })).toEqual([]);
    // The topics still apply under a kind.
    expect(filterDiagrams(all, { ...DEFAULT_VIEW, kind: "diagram", topics: [NO_TOPIC] }).map((d) => d.name)).toEqual(["b"]);
  });

  it("lets a job card through by its kind, as its tile would be", () => {
    expect(showsKind("all", "diagram")).toBe(true);
    expect(showsKind("all", "video")).toBe(true);
    expect(showsKind("diagram", "video")).toBe(false);
    expect(showsKind("video", "diagram")).toBe(false);
    expect(showsKind("video", "video")).toBe(true);
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
    // `/api/assets/{id}/file` serves an asset row, and a diagram being drawn
    // has none until it is accepted. The runner's route answers for every
    // diagram it lists, behind the studio's one gate.
    expect(thumbnailHref("dot-product")).toBe("/studio/api/diagrams/dot-product/svg");
  });
});

/**
 * The panel holds one thing at a time and the URL says which.
 *
 * In the query string rather than in a component, for the reason the filters
 * are: opening a job or a conversation is a thing a person navigates to, comes
 * back from, and hands to somebody else as a link. The job *state* is not here
 * — the runner holds that, and these are pointers at it.
 */
describe("what the panel holds", () => {
  it("reads a job and an extend in flight", () => {
    expect(parsePanel({ job: "job-1" })).toMatchObject({ job: "job-1", extend: null });
    expect(parsePanel({ extend: "dot-product" })).toMatchObject({ job: null, extend: "dot-product" });
    expect(parsePanel({})).toMatchObject({ job: null, extend: null, stream: true });
  });

  it("drops the brief form's old parameter when it rebuilds a link", () => {
    // `?new=` opened the form, which is gone; a bookmark carrying it lands on
    // the grid rather than on a panel that no longer exists.
    expect(studioHref(parseView({ new: "job-1", q: "dot" }))).toBe("/studio?q=dot");
  });

  it("finds a title by the diagram's own name and nothing inherited", () => {
    const titles = { "dot-product": "Dot product" };
    expect(titleOf(titles, "dot-product")).toBe("Dot product");
    expect(titleOf(titles, "constructor")).toBeNull();
    expect(titleOf(titles, "toString")).toBeNull();
  });

  it("opens an extend from a tile's panel, and a picture does not follow it", () => {
    expect(panelHref("/studio?q=x&sel=dot-product", { extend: "dot-product", selected: null })).toBe(
      "/studio?q=x&extend=dot-product",
    );
    expect(panelHref("/studio?job=j&shot=after", { extend: "dot-product", job: null })).toBe(
      "/studio?extend=dot-product",
    );
    expect(panelHref("/studio?extend=dot-product", { extend: null, draft: "d1" })).toBe("/studio?draft=d1");
    expect(studioHref({ ...DEFAULT_VIEW, extend: "dot-product" })).toBe("/studio?extend=dot-product");
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
  });

  it("closes one by dropping its parameter rather than by adding another", () => {
    expect(panelHref("/studio/d/x?job=job-1", { job: null })).toBe("/studio/d/x");
  });

  it("carries the open conversation, beside the job Draw started", () => {
    expect(parsePanel({ draft: "d1" }).draft).toBe("d1");
    expect(parsePanel({}).draft).toBeNull();
    expect(panelHref("/studio?draft=d1", { job: "job-1" })).toBe("/studio?draft=d1&job=job-1");
    expect(panelHref("/studio?draft=d1&job=job-1", { job: null })).toBe("/studio?draft=d1");
    expect(panelHref("/studio?q=x", { draft: "d2" })).toBe("/studio?q=x&draft=d2");
    expect(panelHref("/studio?draft=d1&job=j", { draft: null, job: null })).toBe("/studio");
    expect(studioHref({ ...DEFAULT_VIEW, draft: "d1" })).toBe("/studio?draft=d1");
  });

  it("marks a Talk it through press in the URL, and drops the mark with the press", () => {
    const href = extendFromHref("/studio/d/dot-product?job=j1", "dot-product", { talk: true });
    expect(href).toBe("/studio?extend=dot-product&talk=1");
    expect(parsePanel(Object.fromEntries(new URL(href, "http://x").searchParams))).toMatchObject({
      extend: "dot-product",
      talk: true,
    });
    // The hand-off to the conversation, and Close, both end the press.
    expect(panelHref(href, { extend: null, draft: "d1" })).toBe("/studio?draft=d1");
    expect(panelHref(href, { extend: null, draft: null })).toBe("/studio");
    // Another press is an ordinary one unless it says so.
    expect(panelHref(href, { extend: "other" })).toBe("/studio?extend=other");
    // The mark means nothing on its own.
    expect(parsePanel({ talk: "1" }).talk).toBe(false);
    expect(parsePanel({ extend: "dot-product" }).talk).toBe(false);
  });

  it("opens an Extend press from either screen", () => {
    expect(extendFromHref("/studio?q=x&job=j1", "dot-product")).toBe("/studio?q=x&extend=dot-product");
    expect(extendFromHref("/studio/d/dot-product?job=j1", "dot-product")).toBe("/studio?extend=dot-product");
  });

  it("leads from a job back to its conversation, from either screen", () => {
    expect(conversationHref("/studio?q=x&job=j1", "d1")).toBe("/studio?q=x&draft=d1");
    expect(conversationHref("/studio/d/dot-product?job=j1", "d1")).toBe("/studio?draft=d1");
  });

  it("opens and closes a tile's panel by its selection", () => {
    expect(panelHref("/studio?q=x", { selected: "dot-product" })).toBe("/studio?q=x&sel=dot-product");
    expect(panelHref("/studio?sel=dot-product", { selected: null })).toBe("/studio");
  });

  it("opens a video's preview, and closes it when any other panel opens over it", () => {
    expect(panelHref("/studio?kind=video", { play: "a" })).toBe("/studio?kind=video&play=a");
    expect(panelHref("/studio?play=a", { play: null })).toBe("/studio");
    // Change in the preview opens a conversation, which takes the preview's place.
    expect(conversationHref("/studio?kind=video&play=a", "d1")).toBe("/studio?kind=video&draft=d1");
    expect(panelHref("/studio?play=a", { job: "j1" })).toBe("/studio?job=j1");
    expect(panelHref("/studio?play=a", { settings: true })).toBe("/studio?settings=1");
    // A patch that names no panel leaves it alone.
    expect(panelHref("/studio?play=a", { shot: null })).toBe("/studio?play=a");
    expect(panelHref("/studio?play=a&kind=video", CLOSED)).toBe("/studio?kind=video");
  });

  it("drops a verb outcome, so a stale message does not read as this panel's", () => {
    expect(panelHref("/studio?v=export&ok=0&m=it+failed", { job: "job-1" })).toBe("/studio?job=job-1");
  });
});

describe("the full-width picture's title (review of #217)", () => {
  it("names the job, never its target's path", () => {
    const jobs = [{ jobId: "j1", title: "Dot product, part by part", target: "learn/assets/dot.tldr" }, { jobId: "j2", title: null, target: "learn/assets/x.tldr" }];
    expect(shotTitle(jobs, "j1")).toBe("Dot product, part by part");
    expect(shotTitle(jobs, "j2")).toBe("the diagram");
    expect(shotTitle(jobs, "gone")).toBe("the diagram");
  });
});

describe("the panel a URL names", () => {
  it("tells a video's preview apart from the rest, and ignores the kind filter", () => {
    expect(panelSignature({ play: "a" })).not.toBe(panelSignature({}));
    expect(panelSignature({ play: "a" })).not.toBe(panelSignature({ play: "b" }));
    expect(panelSignature({ play: "a", kind: "video" })).toBe(panelSignature({ play: "a" }));
  });

  it("ignores the filters and tells each panel apart", () => {
    expect(panelSignature({ draft: "d1", topic: "a", q: "x" })).toBe(panelSignature({ draft: "d1" }));
    const panels = [{}, { draft: "d1" }, { draft: "d2" }, { job: "j1" }, { extend: "e" }, { extend: "e", talk: "1" }, { sel: "s" }, { settings: "1" }, { job: "j1", shot: "after" }];
    expect(new Set(panels.map((params) => panelSignature(params))).size).toBe(panels.length);
  });

  it("reads what the page's parser reads: a picture needs its job, Talk needs its Extend", () => {
    expect(panelSignature({ shot: "after" })).toBe(panelSignature({}));
    expect(panelSignature({ talk: "1" })).toBe(panelSignature({}));
  });

  it("turns the address bar into the page's search params, a repeated name as a list", () => {
    expect(rawParamsOf(new URLSearchParams("draft=d1&topic=a&topic=b"))).toEqual({ draft: "d1", topic: ["a", "b"] });
    expect(panelSignature(rawParamsOf(new URLSearchParams("sel=s&view=list")))).toBe(panelSignature({ sel: "s" }));
  });
});

describe("a move the browser can make on its own", () => {
  const at = (search: string) => ({ pathname: "/studio", search });

  it("opens, closes and swaps a conversation, a job and a tile over the same grid", () => {
    expect(browserPanelMove(at("topic=a"), "/studio?topic=a&sel=x")).toBe(true);
    expect(browserPanelMove(at("?topic=a&sel=x"), "/studio?topic=a&job=j1")).toBe(true);
    expect(browserPanelMove(at("job=j1"), "/studio")).toBe(true);
    expect(browserPanelMove(at("draft=d1"), "/studio?draft=d1&job=j1")).toBe(true);
    // A verb's outcome is the panel's, not the grid's.
    expect(browserPanelMove(at("sel=x&v=verify&ok=1&m=done"), "/studio?job=j1")).toBe(true);
  });

  it("opens and closes the settings, which read their own rows", () => {
    expect(browserPanelMove(at("topic=a"), "/studio?topic=a&settings=1")).toBe(true);
    expect(browserPanelMove(at("topic=a&settings=1"), "/studio?topic=a")).toBe(true);
    expect(browserPanelMove(at("topic=a"), "/studio?topic=b&settings=1")).toBe(false);
  });

  it("leaves the rest to the server", () => {
    expect(browserPanelMove(at("topic=a"), "/studio?topic=b&sel=x")).toBe(false);
    expect(browserPanelMove(at(""), "/studio?job=j1&shot=after")).toBe(false);
    expect(browserPanelMove(at("job=j1&shot=after"), "/studio?job=j1")).toBe(false);
    expect(browserPanelMove(at("sel=x"), "/studio?extend=x")).toBe(false);
    expect(browserPanelMove(at(""), "/studio/d/x")).toBe(false);
  });

  it("redraws the grid in the browser for the search, the topics, Display and Sort", () => {
    expect(browserViewMove(at(""), "/studio?sort=title&dir=asc")).toBe(true);
    expect(browserViewMove(at("sort=title&dir=asc"), "/studio?sort=title&dir=asc&group=topic&view=list")).toBe(true);
    expect(browserViewMove(at("chips=1"), "/studio?q=tcp&topic=a,b")).toBe(true);
    // A chip closes a tile's panel on the way, and a verb's outcome is dropped.
    expect(browserViewMove(at("sel=x"), "/studio?topic=a")).toBe(true);
    expect(browserViewMove(at("v=verify&ok=1"), "/studio?sort=created")).toBe(true);
    // A tile's panel kept open over the new view; another tile is a panel move.
    expect(browserViewMove(at("sel=x"), "/studio?sel=x&sort=title")).toBe(true);
    expect(browserViewMove(at("sel=x"), "/studio?sel=y&sort=title")).toBe(false);
    // An open conversation or job stays open over the new view.
    expect(browserViewMove(at("draft=d1"), "/studio?draft=d1&sort=title")).toBe(true);
  });

  it("redraws the grid in the browser for the kind filter, and keeps a panel open over it", () => {
    expect(browserViewMove(at(""), "/studio?kind=diagram")).toBe(true);
    expect(browserViewMove(at("kind=diagram&topic=a"), "/studio?kind=video&topic=a")).toBe(true);
    expect(browserViewMove(at("kind=video"), "/studio")).toBe(true);
    // A tile's panel closes on the way, as a topic chip closes it.
    expect(browserViewMove(at("sel=x"), "/studio?kind=video")).toBe(true);
    // Not a panel move: the grid under it changes.
    expect(browserPanelMove(at(""), "/studio?kind=video")).toBe(false);
  });

  it("opens, closes and swaps a video's preview over the same grid", () => {
    expect(browserPanelMove(at("kind=video"), "/studio?kind=video&play=a")).toBe(true);
    expect(browserPanelMove(at("play=a"), "/studio")).toBe(true);
    expect(browserPanelMove(at("play=a"), "/studio?draft=d1")).toBe(true);
    expect(browserPanelMove(at("kind=video"), "/studio?play=a")).toBe(false);
  });

  it("leaves a view change that also moves a panel, or a server panel, to the server", () => {
    expect(browserViewMove(at("draft=d1"), "/studio?sort=title")).toBe(false);
    expect(browserViewMove(at(""), "/studio?sort=title&job=j1")).toBe(false);
    expect(browserViewMove(at("job=j1&shot=after"), "/studio?job=j1&shot=after&sort=title")).toBe(false);
    expect(browserViewMove(at(""), "/studio?settings=1")).toBe(false);
    expect(browserViewMove(at("?extend=graph"), "/studio?extend=graph&sort=title")).toBe(false);
    expect(browserViewMove(at("stream=off"), "/studio?sort=title")).toBe(false);
    expect(browserViewMove(at(""), "/studio/d/x?sort=title")).toBe(false);
  });

  it("drops every panel from a path and keeps the filters", () => {
    expect(gridHref("/studio?topic=a&settings=1&sel=x&v=verify&ok=1&m=done")).toBe("/studio?topic=a");
    expect(gridHref("/studio?draft=d1&job=j1&extend=e&talk=1&shot=after")).toBe("/studio");
    // The library's back link from a preview's Open lands on the grid, not the preview.
    expect(gridHref("/studio?kind=video&play=a")).toBe("/studio?kind=video");
  });

  it("drops a verb's outcome from a path and keeps the rest", () => {
    expect(withoutOutcome("/studio?sel=x&v=verify&ok=1&m=done&topic=a")).toBe("/studio?sel=x&topic=a");
    expect(withoutOutcome("/studio?v=verify")).toBe("/studio");
  });
});
