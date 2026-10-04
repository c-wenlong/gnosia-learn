import { describe, expect, it } from "vitest";

import {
  bucketCounts,
  INDEX_FILTERS,
  dueLabel,
  lastSeenLabel,
  matchesFilter,
  matchesQuery,
  parseFilter,
  parseScope,
  indexSearch,
  courseGraphHref,
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
    expect(parseView(undefined)).toBe("table");
    expect(parseScope("neighbourhood", "graph")).toBe("neighbourhood");
  });

  // Phase 2 of docs/proposals/knowledge-map.md (G2): the map opens on the
  // selected concept's island, and a graph URL always says its scope.
  it("reads a missing scope as the island in the graph view and the neighbourhood in the table", () => {
    expect(parseScope(null, "graph")).toBe("island");
    expect(parseScope(undefined, "graph")).toBe("island");
    expect(parseScope("bogus", "graph")).toBe("island");
    expect(parseScope("course", "graph")).toBe("course");
    expect(parseScope("island", "graph")).toBe("island");
    expect(parseScope(null, "table")).toBe("neighbourhood");
    expect(parseScope("course", "table")).toBe("course");
    // The table's card has no island scope.
    expect(parseScope("island", "table")).toBe("neighbourhood");
  });

  it("writes the graph view's scope into the URL every time, so a reload shows the same view", () => {
    const base = { selected: "dot", filter: "all" as const };
    expect(indexSearch({ ...base, view: "graph", scope: "island" })).toBe("concept=dot&view=graph&scope=island");
    expect(indexSearch({ ...base, view: "graph", scope: "course" })).toBe("concept=dot&view=graph&scope=course");
    expect(indexSearch({ ...base, view: "graph", scope: "neighbourhood" })).toBe("concept=dot&view=graph&scope=neighbourhood");
    // The table leaves its defaults out, as it always has.
    expect(indexSearch({ ...base, view: "table", scope: "neighbourhood" })).toBe("concept=dot");
    expect(indexSearch({ ...base, view: "table", scope: "course" })).toBe("concept=dot&scope=course");
    expect(indexSearch({ selected: null, filter: "due", view: "table", scope: "neighbourhood" })).toBe("filter=due");
    // Other parameters already in the URL are kept.
    expect(indexSearch({ ...base, view: "graph", scope: "island" }, "utm=x&scope=course")).toBe(
      "utm=x&scope=island&concept=dot&view=graph",
    );
  });

  it("links a concept's full course graph with the scope said out loud", () => {
    expect(courseGraphHref("big-o")).toBe("/learn?concept=big-o&view=graph&scope=course");
    // And the link round-trips to the course scope.
    const params = new URL(courseGraphHref("big-o"), "http://x").searchParams;
    expect(parseScope(params.get("scope"), parseView(params.get("view")))).toBe("course");
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
