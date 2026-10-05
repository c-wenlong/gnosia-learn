import type { AssetConversation, AssetPlace } from "@self-learn/catalog/state";
import { describe, expect, it } from "vitest";

import { conversationGroups, courseGroups, NO_GROUP, topicBucket, topicGroups, topicRanks, WHOLE_COURSE } from "./library-groups";
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

  it("ignores a prerequisite in another domain, as the map does", () => {
    // Paging needs a concept filed under an algorithms topic; inside OS it
    // still goes by the vocabulary's order, ahead of scheduling.
    const vocabulary = [
      { slug: "analysis", domain: "algorithms" },
      { slug: "paging", domain: "os" },
      { slug: "scheduling", domain: "os" },
    ];
    const conceptTopic = new Map([
      ["recurrences", "analysis"],
      ["tlb", "paging"],
      ["round-robin", "scheduling"],
    ]);
    const edges = [{ from: "recurrences", to: "tlb", kind: "requires" as const }];
    expect([...topicRanks(vocabulary, conceptTopic, edges).keys()]).toEqual(["analysis", "paging", "scheduling"]);
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

describe("conversationGroups", () => {
  const conversation = (over: Partial<AssetConversation>): AssetConversation => ({
    id: "d1",
    title: null,
    name: null,
    updatedAt: "2026-10-04T10:00:00.000Z",
    ...over,
  });
  const NOW = new Date("2026-10-05T06:00:00Z");
  const ZONE = "Asia/Singapore";

  it("puts each row under its conversation, newest first, named by the shared rule and dated in the zone", () => {
    const renamed = conversation({ id: "d-old", title: "Planner's words", name: "Proof picture", updatedAt: "2026-10-01T09:00:00.000Z" });
    const titled = conversation({ id: "d-new", title: "Master theorem, drawn", updatedAt: "2026-10-04T17:30:00.000Z" });
    const lastYear = conversation({ id: "d-2025", title: null, updatedAt: "2025-12-28T03:00:00.000Z" });
    const rows = [
      { id: "a", made: renamed },
      { id: "b", made: titled },
      { id: "note", made: null },
      { id: "c", made: renamed },
      { id: "d", made: lastYear },
    ];
    const groups = conversationGroups(rows, (row) => row.made, { now: NOW, timeZone: ZONE });
    expect(groups.map((g) => [g.key, g.label, g.detail, g.rows.map((r) => r.id)])).toEqual([
      // 17:30 UTC on the 4th is the 5th in Singapore.
      ["conversation:d-new", "Master theorem, drawn", "5 Oct", ["b"]],
      ["conversation:d-old", "Proof picture", "1 Oct", ["a", "c"]],
      // No name and no title, and another year.
      ["conversation:d-2025", "Studio conversation", "28 Dec 2025", ["d"]],
      [NO_GROUP, "No conversation", undefined, ["note"]],
    ]);
  });

  it("puts a conversation whose instant does not read after the dated ones, by id, with no day", () => {
    const rows = [
      { id: "x", made: conversation({ id: "z", updatedAt: null }) },
      { id: "y", made: conversation({ id: "m", updatedAt: "not a date" }) },
      { id: "w", made: conversation({ id: "dated" }) },
    ];
    const groups = conversationGroups(rows, (row) => row.made, { now: NOW, timeZone: ZONE });
    expect(groups.map((g) => [g.key, g.detail])).toEqual([
      ["conversation:dated", "4 Oct"],
      ["conversation:m", undefined],
      ["conversation:z", undefined],
    ]);
  });

  it("orders two conversations written at the same instant by id, and leaves out an empty last group", () => {
    const rows = [
      { id: "1", made: conversation({ id: "b" }) },
      { id: "2", made: conversation({ id: "a" }) },
    ];
    expect(conversationGroups(rows, (row) => row.made, { now: NOW, timeZone: ZONE }).map((g) => g.key)).toEqual([
      "conversation:a",
      "conversation:b",
    ]);
  });
});
