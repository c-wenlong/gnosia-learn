import type { AssetParents, AssetPlace } from "@self-learn/catalog/state";
import { describe, expect, it } from "vitest";

import { conceptOrder, moduleShortTitle, pickPlace, placeLabel, rowSource } from "./library-source";

const place = (over: Partial<AssetPlace>): AssetPlace => ({
  course: "cs3230",
  code: "CS3230",
  courseTitle: "Design and Analysis of Algorithms",
  module: "m3-proof-of-correctness",
  moduleTitle: "Week 3: Proof of correctness",
  position: 3,
  via: "item",
  ...over,
});

const parents = (over: Partial<AssetParents>): AssetParents => ({
  places: [],
  concepts: [],
  conversations: [],
  sessions: [],
  ...over,
});

const KB: Record<string, { title: string; bucket: "mastered" | "learning" | "untouched" }> = {
  recurrences: { title: "Recurrences", bucket: "learning" },
  "master-theorem": { title: "Master theorem", bucket: "untouched" },
  "big-o": { title: "Big O", bucket: "mastered" },
};
const ORDER = conceptOrder([
  { id: "big-o", requires: [], assumes: [] },
  { id: "recurrences", requires: ["big-o"], assumes: [] },
  { id: "master-theorem", requires: ["recurrences"], assumes: [] },
]);
const options = (course: string | null = null) => ({
  course,
  order: ORDER,
  concept: (slug: string) => KB[slug] ?? null,
});

describe("moduleShortTitle and placeLabel", () => {
  it("cuts a numbered module at its colon, and keeps a plain title whole", () => {
    expect(moduleShortTitle("Week 3: Proof of correctness")).toBe("Week 3");
    expect(moduleShortTitle("Weeks 3 to 4: Divide and conquer")).toBe("Weeks 3 to 4");
    expect(moduleShortTitle("Foundations of HCI")).toBe("Foundations of HCI");
    expect(moduleShortTitle(": odd")).toBe(": odd");
  });

  it("names the course by code, then the module; the title when there is no code", () => {
    expect(placeLabel(place({}))).toBe("CS3230 · Week 3");
    expect(placeLabel(place({ module: null, moduleTitle: null }))).toBe("CS3230");
    expect(placeLabel(place({ code: null }))).toBe("Design and Analysis of Algorithms · Week 3");
    expect(placeLabel(place({ code: "  " }))).toBe("Design and Analysis of Algorithms · Week 3");
  });
});

describe("pickPlace", () => {
  const a = place({ course: "cs4223", code: "CS4223", via: "topic", moduleTitle: "Week 1: Caches" });
  const b = place({ course: "cs3230", code: "CS3230", via: "topic" });
  const c = place({ course: "cs4225", code: "CS4225", via: "item", moduleTitle: "Week 2: Spark" });

  it("takes a module listing over a topic match, then the first by code", () => {
    expect(pickPlace([a, b, c], null)).toBe(c);
    expect(pickPlace([a, b], null)).toBe(b);
    expect(pickPlace([], null)).toBeNull();
  });

  it("takes the course the open filter names, wherever it was found", () => {
    expect(pickPlace([a, b, c], "cs4223")).toBe(a);
    expect(pickPlace([a, b, c], "cs9999")).toBe(c);
  });

  it("orders two modules of one course by position", () => {
    const early = place({ position: 1, moduleTitle: "Week 1: A" });
    const late = place({ position: 5, moduleTitle: "Week 5: B" });
    expect(pickPlace([late, early], null)).toBe(early);
  });
});

describe("conceptOrder", () => {
  it("ranks prerequisites first, then by slug within a layer, and survives a cycle", () => {
    expect([...ORDER.entries()]).toEqual([
      ["big-o", 0],
      ["recurrences", 1],
      ["master-theorem", 2],
    ]);
    const cyclic = conceptOrder([
      { id: "b", requires: ["a"], assumes: [] },
      { id: "a", requires: ["b"], assumes: [] },
      { id: "c", requires: [], assumes: ["a"] },
    ]);
    expect(cyclic.size).toBe(3);
  });
});

describe("rowSource precedence (golden)", () => {
  const cases: Array<[string, AssetParents | undefined, string | null, unknown]> = [
    ["no parents", undefined, null, null],
    ["an empty answer", parents({}), null, null],
    [
      "course and concept together",
      parents({
        places: [place({})],
        concepts: ["master-theorem", "recurrences"],
        conversations: [{ id: "d1", title: "Ignored" }],
      }),
      null,
      { place: "CS3230 · Week 3", concept: { title: "Recurrences", bucket: "learning", more: 1 } },
    ],
    ["course alone", parents({ places: [place({})] }), null, { place: "CS3230 · Week 3" }],
    [
      "concept alone, the first in graph order",
      parents({ concepts: ["master-theorem", "big-o"], sessions: [{ id: "s1", title: "Ignored" }] }),
      null,
      { concept: { title: "Big O", bucket: "mastered", more: 1 } },
    ],
    [
      "a concept the knowledge base does not hold",
      parents({ concepts: ["zeta", "big-o"] }),
      null,
      { concept: { title: "Big O", bucket: "mastered", more: 1 } },
    ],
    [
      "only an unknown concept",
      parents({ concepts: ["zeta"] }),
      null,
      { concept: { title: "zeta", bucket: "untouched", more: 0 } },
    ],
    [
      "a studio conversation, over a session",
      parents({ conversations: [{ id: "d1", title: "How dengue moves" }], sessions: [{ id: "s1", title: "S" }] }),
      null,
      { origin: { kind: "conversation", title: "How dengue moves" } },
    ],
    [
      "an untitled conversation",
      parents({ conversations: [{ id: "d1", title: null }] }),
      null,
      { origin: { kind: "conversation", title: "Studio conversation" } },
    ],
    [
      "a tutor session",
      parents({ sessions: [{ id: "s1", title: "Divide and conquer" }] }),
      null,
      { origin: { kind: "session", title: "Divide and conquer" } },
    ],
    [
      "an untitled session",
      parents({ sessions: [{ id: "s1", title: "  " }] }),
      null,
      { origin: { kind: "session", title: "Tutor session" } },
    ],
    [
      "two courses, the filter's",
      parents({
        places: [place({}), place({ course: "cs1231", code: "CS1231", moduleTitle: "Week 9: Graphs", via: "topic" })],
      }),
      "cs1231",
      { place: "CS1231 · Week 9" },
    ],
  ];

  for (const [name, input, course, expected] of cases) {
    it(name, () => {
      expect(rowSource(input, options(course))).toEqual(expected);
    });
  }
});
