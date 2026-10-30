import { describe, expect, it } from "vitest";

import {
  bucketCounts,
  INDEX_FILTERS,
  dueLabel,
  LEGEND_GROUPS,
  legendMembers,
  legendPress,
  lastSeenLabel,
  matchesFilter,
  matchesQuery,
  parseFilter,
  parseScope,
  indexSearch,
  conceptMapHref,
  parseLayout,
  parseView,
  statusFilterOptions,
  type IndexRow,
} from "@/lib/learn-index";

const now = new Date("2026-09-26T04:00:00Z"); // a Saturday, noon in Singapore
const TZ = "Asia/Singapore";

const row = (over: Partial<IndexRow> = {}): IndexRow => ({
  id: "dot-product",
  title: "Dot product",
  summary: "Measures alignment.",
  bucket: "learning",
  pL: 0.4,
  due: null,
  isDue: false,
  dueLabel: "–",
  overdue: false,
  lastSeenLabel: "never",
  leech: false,
  courseLabel: null,
  courses: [],
  domain: "foundations",
  ready: false,
  ...over,
});

describe("dueLabel", () => {
  it("says overdue only for a day already gone, in the learner's zone", () => {
    expect(dueLabel("2026-09-25T15:00:00Z", now, TZ)).toEqual({ label: "overdue", overdue: true }); // 23:00 Fri SG
    expect(dueLabel("2026-09-25T17:00:00Z", now, TZ).label).toBe("today"); // 01:00 Sat SG
    expect(dueLabel("2026-09-26T15:00:00Z", now, TZ).label).toBe("today"); // 23:00 Sat SG, still today
    expect(dueLabel("2026-09-27T02:00:00Z", now, TZ).label).toBe("tomorrow");
    expect(dueLabel("2026-10-02T02:00:00Z", now, TZ).label).toBe("Fri");
    expect(dueLabel("2026-10-20T02:00:00Z", now, TZ).label).toBe("20 Oct");
    expect(dueLabel(null, now, TZ)).toEqual({ label: "–", overdue: false });
  });
});

describe("lastSeenLabel", () => {
  it("counts calendar days", () => {
    expect(lastSeenLabel(null, now, TZ)).toBe("never");
    expect(lastSeenLabel("2026-09-26T01:00:00Z", now, TZ)).toBe("today");
    expect(lastSeenLabel("2026-09-25T01:00:00Z", now, TZ)).toBe("yesterday");
    expect(lastSeenLabel("2026-09-23T01:00:00Z", now, TZ)).toBe("3 days");
    expect(lastSeenLabel("2026-08-20T01:00:00Z", now, TZ)).toBe("5 weeks");
    expect(lastSeenLabel("2026-03-01T01:00:00Z", now, TZ)).toBe("1 Mar");
  });
});

describe("filters and search", () => {
  it("filters by bucket, due and leech", () => {
    expect(matchesFilter(row(), "all")).toBe(true);
    expect(matchesFilter(row(), "learning")).toBe(true);
    expect(matchesFilter(row(), "mastered")).toBe(false);
    expect(matchesFilter(row({ isDue: true }), "due")).toBe(true);
    expect(matchesFilter(row(), "due")).toBe(false);
    expect(matchesFilter(row({ leech: true }), "leeches")).toBe(true);
  });

  it("matches every word against the title, summary or slug", () => {
    expect(matchesQuery(row(), "")).toBe(true);
    expect(matchesQuery(row(), "DOT align")).toBe(true);
    expect(matchesQuery(row(), "dot-product")).toBe(true);
    expect(matchesQuery(row(), "dot softmax")).toBe(false);
  });

  it("parses the query string defensively", () => {
    expect(parseFilter("leeches")).toBe("leeches");
    expect(parseFilter("bogus")).toBe("all");
    expect(parseView("graph")).toBe("graph");
    // G1 of docs/proposals/knowledge-map.md: the map is the default, the table one press away.
    expect(parseView(undefined)).toBe("graph");
    expect(parseView(null)).toBe("graph");
    expect(parseView("table")).toBe("table");
    expect(parseView("bogus")).toBe("graph");
  });

  // The table's side card shows a neighbourhood or a course. The map has no
  // scope any more: it shows a domain or a topic (docs/proposals/domain-map.md, D2).
  it("reads the table's scope, the neighbourhood unless the course is asked for", () => {
    expect(parseScope("course")).toBe("course");
    expect(parseScope("neighbourhood")).toBe("neighbourhood");
    expect(parseScope(null)).toBe("neighbourhood");
    expect(parseScope("island")).toBe("neighbourhood");
    expect(parseScope("bogus")).toBe("neighbourhood");
  });

  it("writes the map's domain and topic, and the table's own state, so a reload shows the same view", () => {
    const base = { selected: "dot", filter: "all" as const, scope: "neighbourhood" as const };
    // The map is the default view (G1), so its URL leaves `view` out.
    expect(indexSearch({ ...base, view: "graph", domain: "algorithms", topic: null })).toBe("concept=dot&domain=algorithms");
    expect(indexSearch({ ...base, view: "graph", domain: "algorithms", topic: "sorting" })).toBe(
      "concept=dot&domain=algorithms&topic=sorting",
    );
    // The domain cards: nothing to say.
    expect(indexSearch({ ...base, selected: null, view: "graph", domain: null, topic: null })).toBe("");
    // The table says it is the table, drops the map's place, and leaves its own default scope out.
    expect(indexSearch({ ...base, view: "table", domain: "algorithms", topic: "sorting" }, "domain=algorithms&topic=sorting")).toBe(
      "concept=dot&view=table",
    );
    expect(indexSearch({ ...base, scope: "course", view: "table", domain: null, topic: null })).toBe("concept=dot&view=table&scope=course");
    expect(indexSearch({ selected: null, filter: "due", scope: "neighbourhood", view: "table", domain: null, topic: null })).toBe(
      "view=table&filter=due",
    );
    // Other parameters are kept; an old `view=graph` and an island map's `scope` are dropped.
    expect(indexSearch({ ...base, view: "graph", domain: "algorithms", topic: null }, "utm=x&view=graph&scope=island")).toBe(
      "utm=x&concept=dot&domain=algorithms",
    );
  });

  // D11 of docs/proposals/domain-map.md: a domain is drawn in groups or on axes.
  it("reads the map's layout, groups unless the axes are asked for", () => {
    expect(parseLayout("axes")).toBe("axes");
    expect(parseLayout("groups")).toBe("groups");
    expect(parseLayout(null)).toBe("groups");
    expect(parseLayout(undefined)).toBe("groups");
    expect(parseLayout("bogus")).toBe("groups");
  });

  it("writes layout=axes on a domain only, and drops it in a topic, on the cards and in the table", () => {
    const base = { selected: null, filter: "all" as const, scope: "neighbourhood" as const, layout: "axes" as const };
    expect(indexSearch({ ...base, view: "graph", domain: "algorithms", topic: null })).toBe("domain=algorithms&layout=axes");
    // Groups is the default, so it says nothing.
    expect(indexSearch({ ...base, layout: "groups", view: "graph", domain: "algorithms", topic: null }, "domain=algorithms&layout=axes")).toBe(
      "domain=algorithms",
    );
    // A topic is always groups.
    expect(indexSearch({ ...base, view: "graph", domain: "algorithms", topic: "sorting" }, "domain=algorithms&layout=axes")).toBe(
      "domain=algorithms&topic=sorting",
    );
    // The cards and the table have no picture to arrange.
    expect(indexSearch({ ...base, view: "graph", domain: null, topic: null }, "layout=axes")).toBe("");
    expect(indexSearch({ ...base, view: "table", domain: "algorithms", topic: null }, "domain=algorithms&layout=axes")).toBe("view=table");
    // A state that does not name a layout leaves the groups' URL as it was.
    expect(indexSearch({ selected: null, filter: "all", scope: "neighbourhood", view: "graph", domain: "algorithms", topic: null }, "layout=axes")).toBe("domain=algorithms");
  });

  it("links a concept to its place on the map, which the page opens in its domain", () => {
    expect(conceptMapHref("big-o")).toBe("/learn?concept=big-o");
  });

  it("counts buckets", () => {
    expect(bucketCounts([row(), row({ bucket: "mastered" }), row({ bucket: "untouched" }), row()])).toEqual({
      mastered: 1,
      learning: 2,
      untouched: 1,
    });
  });
});

describe("statusFilterOptions", () => {
  it("counts every filter over all the rows", () => {
    const rows = [
      row(),
      row({ id: "a", bucket: "mastered", isDue: true }),
      row({ id: "b", bucket: "untouched", leech: true }),
    ];
    expect(statusFilterOptions(rows).map((o) => [o.value, o.count])).toEqual([
      ["all", 3],
      ["due", 1],
      ["learning", 1],
      ["mastered", 1],
      ["untouched", 1],
      ["leeches", 1],
      ["ready", 0],
      ["nocourse", 3],
    ]);
  });

  // Phase 3 of docs/proposals/knowledge-map.md: the map adds two options and keeps every other (G5, G8).
  it("adds Ready to learn and Not in a course after the options the table already had", () => {
    expect(INDEX_FILTERS.map((f) => f.key)).toEqual(["all", "due", "learning", "mastered", "untouched", "leeches", "ready", "nocourse"]);
    expect(INDEX_FILTERS.find((f) => f.key === "ready")?.label).toBe("Ready to learn");
    expect(INDEX_FILTERS.find((f) => f.key === "nocourse")?.label).toBe("Not in a course");
    // One name for the bucket everywhere: the Status menu says what the chips and the panel say.
    expect(INDEX_FILTERS.find((f) => f.key === "untouched")?.label).toBe("Not started");
    expect(matchesFilter(row({ ready: true }), "ready")).toBe(true);
    expect(matchesFilter(row({ ready: false }), "ready")).toBe(false);
    expect(matchesFilter(row({ courses: [] }), "nocourse")).toBe(true);
    expect(matchesFilter(row({ courses: ["cs3230"] }), "nocourse")).toBe(false);
    expect(parseFilter("nocourse")).toBe("nocourse");
    expect(parseFilter("ready")).toBe("ready");
  });

  it("calls a leech what it means, and keeps the key the URL carries", () => {
    const option = statusFilterOptions([row({ id: "b", leech: true })]).find((o) => o.value === "leeches");
    expect(option?.label).toBe("Keeps slipping");
    expect(INDEX_FILTERS.some((f) => /leech/i.test(f.label))).toBe(false);
  });
});

// D9 of docs/proposals/domain-map.md: the legend chips over a domain's picture.
describe("the map's legend", () => {
  it("is four groups, each a Status filter, in the order the chips are drawn", () => {
    expect(LEGEND_GROUPS.map((g) => [g.key, g.label])).toEqual([
      ["mastered", "Mastered"],
      ["learning", "Learning"],
      ["untouched", "Not started"],
      ["ready", "Ready to learn"],
    ]);
    for (const g of LEGEND_GROUPS) expect(INDEX_FILTERS.some((f) => f.key === g.key)).toBe(true);
  });

  it("puts each concept shown in the groups it matches, ready as well as its bucket", () => {
    const rows = new Map(
      [
        row({ id: "a", bucket: "mastered" }),
        row({ id: "b", bucket: "learning", ready: true }),
        row({ id: "c", bucket: "untouched", ready: true }),
        row({ id: "d", bucket: "untouched" }),
      ].map((r) => [r.id, r]),
    );
    // Only the ids asked for: a concept outside the open topic is not counted, and one with no row is skipped.
    expect(legendMembers(["a", "b", "c", "gone"], rows)).toEqual({ mastered: ["a"], learning: ["b"], untouched: ["c"], ready: ["b", "c"] });
  });

  it("commits a group on a press, and clears to all on a press of the active one", () => {
    expect(legendPress("all", "learning")).toBe("learning");
    expect(legendPress("due", "learning")).toBe("learning");
    expect(legendPress("mastered", "learning")).toBe("learning");
    expect(legendPress("learning", "learning")).toBe("all");
  });
});
