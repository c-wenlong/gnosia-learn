import type { AssetPlace } from "@self-learn/catalog/state";
import { describe, expect, it } from "vitest";

import { conceptGroups, courseGroups, NO_GROUP, WHOLE_COURSE } from "./library-groups";
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
const ids = (rows: readonly Row[]) => rows.map((r) => r.id);

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

describe("conceptGroups", () => {
  const order = conceptOrder([
    { id: "big-o", requires: [], assumes: [] },
    { id: "recurrences", requires: ["big-o"], assumes: [] },
    { id: "master-theorem", requires: ["recurrences"], assumes: [] },
  ]);
  const known: Record<string, { title: string; bucket: "mastered" | "learning" }> = {
    "big-o": { title: "Big O", bucket: "mastered" },
    recurrences: { title: "Recurrences", bucket: "learning" },
    "master-theorem": { title: "Master theorem", bucket: "learning" },
  };

  it("gives a heading per first concept in the graph's order, an unknown one after by slug, and no concept last", () => {
    const rows = [
      row("a", [], ["master-theorem"]),
      row("b", [], ["master-theorem", "recurrences"]),
      row("c"),
      row("d", [], ["zz-unknown"]),
      row("e", [], ["big-o"]),
    ];
    const groups = conceptGroups(rows, (r) => r.concepts, order, (slug) => known[slug] ?? null);
    expect(groups.map((g) => [g.key, g.label, g.bucket, ids(g.rows)])).toEqual([
      ["concept:big-o", "Big O", "mastered", ["e"]],
      ["concept:recurrences", "Recurrences", "learning", ["b"]],
      ["concept:master-theorem", "Master theorem", "learning", ["a"]],
      ["concept:zz-unknown", "zz-unknown", "untouched", ["d"]],
      [NO_GROUP, "No concept", undefined, ["c"]],
    ]);
  });
});
