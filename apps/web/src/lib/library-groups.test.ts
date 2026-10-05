import type { AssetPlace } from "@self-learn/catalog/state";
import { describe, expect, it } from "vitest";

import { courseGroups, NO_GROUP, topicBucket, topicGroups, topicRanks, WHOLE_COURSE } from "./library-groups";
import { conceptOrder } from "./library-source";

const place = (over: Partial<AssetPlace>): AssetPlace => ({
  course: "cs3230",
  code: "CS3230",
  courseTitle: "Design and Analysis of Algorithms",
  module: "m3",
  moduleTitle: "Week 3: Proof of correctness",
  position: 3,
  via: "item",
  ...over,
});

interface Row {
  id: string;
  places: AssetPlace[];
  concepts: string[];
}

const row = (id: string, places: AssetPlace[] = [], concepts: string[] = []): Row => ({ id, places, concepts });
const ids = (rows: readonly { id: string }[]) => rows.map((r) => r.id);

describe("courseGroups", () => {
  const rows = [
    row("a", [place({ module: "m5", moduleTitle: "Week 5: Dynamic programming", position: 5 })]),
    row("loose"),
    row("b", [place({})]),
    row("c", [place({ course: "cs2106", code: "CS2106", courseTitle: "Operating Systems", module: "m7", moduleTitle: "Week 7", position: 7 })]),
    row("d", [place({ module: null, moduleTitle: null, position: 0 })]),
    row("e", [place({ module: "m5", moduleTitle: "Week 5: Dynamic programming", position: 5 })]),
  ];

  it("gives a heading per course by code, its modules in course order inside, and no course last", () => {
    const groups = courseGroups(rows, (r) => r.places, { course: null });
    expect(groups.map((g) => [g.key, g.label, g.detail, ids(g.rows)])).toEqual([
      ["course:cs2106", "CS2106", "Operating Systems", ["c"]],
      ["course:cs3230", "CS3230", "Design and Analysis of Algorithms", ["d", "b", "a", "e"]],
      [NO_GROUP, "No course", undefined, ["loose"]],
    ]);
    expect(groups[1]?.sections?.map((s) => [s.key, s.label, ids(s.rows)])).toEqual([
      ["", WHOLE_COURSE, ["d"]],
      ["m3", "Week 3: Proof of correctness", ["b"]],
      ["m5", "Week 5: Dynamic programming", ["a", "e"]],
    ]);
    expect(groups[2]?.sections).toBeUndefined();
  });

  it("files an asset in two courses under the open filter's course, else the first by code, once", () => {
    const both = [row("x", [place({}), place({ course: "cs2106", code: "CS2106", courseTitle: "OS", module: "m1", position: 1 })])];
    expect(courseGroups(both, (r) => r.places, { course: null }).map((g) => g.key)).toEqual(["course:cs2106"]);
    expect(courseGroups(both, (r) => r.places, { course: "cs3230" }).map((g) => g.key)).toEqual(["course:cs3230"]);
  });

  it("names a course with no code by its title, and a module with no title by its slug", () => {
    const groups = courseGroups([row("x", [place({ code: null, moduleTitle: null })])], (r) => r.places, { course: null });
    expect(groups[0]).toMatchObject({ label: "Design and Analysis of Algorithms" });
    expect(groups[0]?.detail).toBeUndefined();
    expect(groups[0]?.sections?.[0]?.label).toBe("m3");
  });

  it("leaves out the last group when every row has a course, and returns nothing for no rows", () => {
    expect(courseGroups([row("b", [place({})])], (r) => r.places, { course: null }).map((g) => g.key)).toEqual(["course:cs3230"]);
    expect(courseGroups([], (r: Row) => r.places, { course: null })).toEqual([]);
  });
});

describe("topicGroups", () => {
  const order = conceptOrder([
    { id: "big-o", requires: [], assumes: [] },
    { id: "recurrences", requires: ["big-o"], assumes: [] },
    { id: "master-theorem", requires: ["recurrences"], assumes: [] },
    { id: "orphan", requires: ["master-theorem"], assumes: [] },
  ]);
  const topicOf: Record<string, string | null> = {
    "big-o": "analysis",
    recurrences: "analysis",
    "master-theorem": "divide-and-conquer",
    orphan: null,
  };
  const topics: Record<string, { title: string; bucket: "mastered" | "learning" | null }> = {
    analysis: { title: "Analysis", bucket: "learning" },
    "divide-and-conquer": { title: "Divide and conquer", bucket: "mastered" },
    "filed-only": { title: "Filed only", bucket: null },
  };
  // Analysis first, then divide and conquer, then the topic filed under only.
  const rank = new Map([
    ["analysis", 0],
    ["divide-and-conquer", 1],
    ["filed-only", 2],
  ]);
  type TopicRow = { id: string; concepts: string[]; topics: string[] };
  const r = (id: string, concepts: string[] = [], filed: string[] = []): TopicRow => ({ id, concepts, topics: filed });
  const group = (rows: TopicRow[], ranks: ReadonlyMap<string, number> = rank) =>
    topicGroups(rows, (x) => x, {
      order,
      topicOf: (slug) => topicOf[slug] ?? null,
      rank: ranks,
      topic: (slug) => topics[slug] ?? null,
    });

  it("gives a heading per topic in rank order, a topic without a rank after by slug, no topic last", () => {
    const rows = [
      r("a", ["master-theorem"]),
      r("b", ["recurrences"]),
      r("c"),
      r("d", ["big-o"]),
      r("f", [], ["zz-unknown"]),
      r("e", [], ["filed-only"]),
    ];
    expect(group(rows).map((g) => [g.key, g.label, g.bucket, ids(g.rows)])).toEqual([
      ["topic:analysis", "Analysis", "learning", ["b", "d"]],
      ["topic:divide-and-conquer", "Divide and conquer", "mastered", ["a"]],
      // Filed under a topic but explaining no concept: under that topic, with no dot.
      ["topic:filed-only", "Filed only", undefined, ["e"]],
      ["topic:zz-unknown", "zz-unknown", undefined, ["f"]],
      [NO_GROUP, "No topic", undefined, ["c"]],
    ]);
    // With no ranks at all the topics go by slug.
    expect(group(rows, new Map()).map((g) => g.key)).toEqual([
      "topic:analysis",
      "topic:divide-and-conquer",
      "topic:filed-only",
      "topic:zz-unknown",
      NO_GROUP,
    ]);
  });

  it("puts an asset under two topics once, under its first concept's, so the counts add up", () => {
    const rows = [r("x", ["master-theorem", "big-o"], ["filed-only"]), r("y", ["master-theorem"])];
    const groups = group(rows);
    expect(groups.map((g) => [g.key, ids(g.rows)])).toEqual([
      ["topic:analysis", ["x"]],
      ["topic:divide-and-conquer", ["y"]],
    ]);
    expect(groups.reduce((n, g) => n + g.rows.length, 0)).toBe(rows.length);
  });

  it("falls back to the asset's own topic when its first concept has none, and to no topic after that", () => {
    const groups = group([r("p", ["orphan"], ["filed-only"]), r("q", ["orphan"]), r("s", ["not-in-graph"])]);
    expect(groups.map((g) => [g.key, ids(g.rows)])).toEqual([
      ["topic:filed-only", ["p"]],
      [NO_GROUP, ["q", "s"]],
    ]);
  });

  it("keeps the input's order inside a topic, and returns nothing for no rows", () => {
    expect(ids(group([r("2", ["big-o"]), r("1", ["recurrences"])])[0]?.rows ?? [])).toEqual(["2", "1"]);
    expect(group([])).toEqual([]);
  });
});

describe("topicRanks", () => {
  it("orders domains by title, and inside one the Learn map's order, prerequisite topics first", () => {
    const vocabulary = [
      { slug: "divide-and-conquer", domain: "algorithms" },
      { slug: "analysis", domain: "algorithms" },
      { slug: "paging", domain: "os" },
      { slug: "accessibility", domain: "hci" },
    ];
    const conceptTopic = new Map([
      ["master-theorem", "divide-and-conquer"],
      ["recurrences", "analysis"],
    ]);
    const edges = [{ from: "recurrences", to: "master-theorem", kind: "requires" as const }];
    // Algorithms, HCI, OS by title; analysis before the topic that needs it.
    expect([...topicRanks(vocabulary, conceptTopic, edges).entries()]).toEqual([
      ["analysis", 0],
      ["divide-and-conquer", 1],
      ["accessibility", 2],
      ["paging", 3],
    ]);
    expect(topicRanks([], conceptTopic, edges).size).toBe(0);
  });
});

describe("topicBucket", () => {
  it("reads a topic as a course page does: all mastered, none started, or learning", () => {
    expect(topicBucket(["mastered", "mastered"])).toBe("mastered");
    expect(topicBucket(["untouched", "untouched"])).toBe("untouched");
    expect(topicBucket(["mastered", "untouched"])).toBe("learning");
    expect(topicBucket(["learning"])).toBe("learning");
    expect(topicBucket([])).toBeNull();
  });
});
