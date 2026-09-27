import { describe, expect, it } from "vitest";

import {
  bucketCounts,
  dueLabel,
  lastSeenLabel,
  matchesFilter,
  matchesQuery,
  parseFilter,
  parseScope,
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
    expect(parseScope(null, "graph")).toBe("course");
    expect(parseScope(null, "table")).toBe("neighbourhood");
    expect(parseScope("neighbourhood", "graph")).toBe("neighbourhood");
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
    ]);
  });
});
