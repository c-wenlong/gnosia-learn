import { describe, expect, it } from "vitest";

import {
  conceptsForTopic,
  continueHref,
  courseSummaryLine,
  EMPTY_STANDING,
  guidebookConcept,
  isLocked,
  itemDoneWith,
  itemStanding,
  nodeCaption,
  pathStatus,
  resolveTopicMastery,
  topicDone,
  unitSubtitle,
  type KbConceptLike,
  type PathConcept,
  type TopicMastery,
} from "./course-path";

function kb(id: string, pL: number, mastery: KbConceptLike["mastery"], observations: number, topics: string[]): KbConceptLike {
  return { id, title: id.replace(/-/g, " "), pL, mastery, observations, topics };
}

function concept(slug: string, pL: number, bucket: PathConcept["bucket"]): PathConcept {
  const mastery = bucket === "mastered" ? "mastered" : "weak";
  return { slug, title: slug, pL, mastery, observations: bucket === "untouched" ? 0 : 1, bucket };
}

const mastered: TopicMastery = { bucket: "mastered", pL: 0.95, next: "a", concepts: [concept("a", 0.95, "mastered")] };
const learning: TopicMastery = { bucket: "learning", pL: 0.4, next: "b", concepts: [concept("b", 0.4, "learning")] };

describe("conceptsForTopic", () => {
  const concepts = [
    kb("self-attention", 0.05, "gap", 1, ["cp4284-m1-t1"]),
    kb("attention-weights", 0.04, "gap", 1, ["cp4284-m1-t1"]),
    kb("react-loop", 0.2, "weak", 0, ["cp4284-m3-t1"]),
    kb("zeta-extra", 0.3, "weak", 2, ["cp4284-m1-t1"]),
  ];

  it("takes the concepts whose notes name the topic, and nothing else", () => {
    expect(conceptsForTopic(concepts, "cp4284-m1-t1").map((c) => c.slug)).toEqual([
      "attention-weights",
      "self-attention",
      "zeta-extra",
    ]);
    expect(conceptsForTopic(concepts, "cp4284-m1-t2")).toEqual([]);
  });

  it("orders by the module's maps.concepts first, then by title, when nothing is placed", () => {
    const order = ["self-attention", "attention-weights"];
    expect(conceptsForTopic(concepts, "cp4284-m1-t1", order).map((c) => c.slug)).toEqual([
      "self-attention",
      "attention-weights",
      "zeta-extra",
    ]);
  });

  it("orders by the row's concepts: list first, and puts the unplaced after it", () => {
    const placed: KbConceptLike[] = [
      { ...kb("self-attention", 0.05, "gap", 1, ["cp4284-m1-t1"]), positions: { "cp4284-m1-t1": 3 } },
      { ...kb("attention-weights", 0.04, "gap", 1, ["cp4284-m1-t1"]), positions: { "cp4284-m1-t1": 1 } },
      // Placed on another row only: on this one it is unplaced.
      { ...kb("react-loop", 0.2, "weak", 0, ["cp4284-m1-t1", "cp4284-m3-t1"]), positions: { "cp4284-m3-t1": 1 } },
      // A link indexed before positions existed.
      { ...kb("zeta-extra", 0.3, "weak", 2, ["cp4284-m1-t1"]), positions: { "cp4284-m1-t1": 0 } },
      { ...kb("softmax", 0.5, "shaky", 3, ["cp4284-m1-t1"]), positions: { "cp4284-m1-t1": 2 } },
    ];
    // The authored order would put zeta first; the row's positions win, and
    // the authored order only ranks the two the row has not placed.
    const authored = ["zeta-extra", "self-attention", "react-loop"];
    expect(conceptsForTopic(placed, "cp4284-m1-t1", authored).map((c) => c.slug)).toEqual([
      "attention-weights",
      "softmax",
      "self-attention",
      "zeta-extra",
      "react-loop",
    ]);
  });

  it("buckets each concept with bucketOf", () => {
    const [react] = conceptsForTopic(concepts, "cp4284-m3-t1");
    expect(react?.bucket).toBe("untouched");
    expect(conceptsForTopic(concepts, "cp4284-m1-t1")[0]?.bucket).toBe("learning");
  });
});

describe("itemStanding and itemDoneWith", () => {
  const concepts = [
    kb("a", 0.97, "mastered", 4, ["t-mastered", "t-mixed"]),
    kb("b", 0.96, "mastered", 3, ["t-mastered"]),
    kb("c", 0.3, "weak", 1, ["t-mixed"]),
  ];
  const standing = itemStanding(concepts, ["t-mastered", "t-mixed", "t-bare"]);

  it("says which items have concepts, and which of those are mastered", () => {
    expect(standing).toEqual({ mastered: ["t-mastered"], withConcepts: ["t-mastered", "t-mixed"] });
  });

  it("is done by mastery for an item with concepts, and by the tick for one without", () => {
    const done = itemDoneWith(standing, { "t-mixed": true, "t-bare": true });
    expect(done("t-mastered")).toBe(true);
    // Ticked, but its concepts are not mastered: the tick says nothing.
    expect(done("t-mixed")).toBe(false);
    expect(done("t-bare")).toBe(true);
    expect(done("t-unknown")).toBe(false);
  });

  it("is tick-only with an empty standing, which is the no-catalog fallback", () => {
    const done = itemDoneWith(EMPTY_STANDING, { "t-mixed": true });
    expect(done("t-mixed")).toBe(true);
    expect(done("t-mastered")).toBe(false);
  });
});

describe("resolveTopicMastery", () => {
  it("is null for a topic with no concept", () => {
    expect(resolveTopicMastery([])).toBeNull();
  });

  it("is mastered only when every concept is", () => {
    const r = resolveTopicMastery([concept("a", 0.97, "mastered"), concept("b", 0.93, "mastered")]);
    expect(r?.bucket).toBe("mastered");
    expect(r?.pL).toBe(0.93);
  });

  it("is untouched only when nothing is observed or mastered", () => {
    expect(resolveTopicMastery([concept("a", 0.39, "untouched"), concept("b", 0.1, "untouched")])?.bucket).toBe(
      "untouched",
    );
  });

  it("is learning for a mix, even when the weakest concept is untouched", () => {
    const r = resolveTopicMastery([concept("a", 0.97, "mastered"), concept("b", 0.1, "untouched")]);
    expect(r?.bucket).toBe("learning");
    expect(r?.pL).toBe(0.1);
  });

  it("takes the minimum p(L) across the concepts", () => {
    const r = resolveTopicMastery([concept("a", 0.6, "learning"), concept("b", 0.05, "learning"), concept("c", 0.3, "learning")]);
    expect(r?.pL).toBe(0.05);
    expect(r?.next).toBe("b");
  });

  it("sends Continue to the first unmastered concept on the frontier", () => {
    const list = [concept("a", 0.6, "learning"), concept("b", 0.05, "learning"), concept("c", 0.97, "mastered")];
    expect(resolveTopicMastery(list, ["c", "z", "a"])?.next).toBe("a");
  });

  it("falls back to the weakest unmastered concept, keeping authored order on a tie", () => {
    const list = [concept("a", 0.1, "mastered"), concept("b", 0.3, "learning"), concept("c", 0.3, "learning")];
    expect(resolveTopicMastery(list)?.next).toBe("b");
  });
});

describe("topicDone", () => {
  it("uses mastery for a topic with concepts, ignoring the tick", () => {
    expect(topicDone(mastered, false)).toBe(true);
    expect(topicDone(learning, true)).toBe(false);
  });

  it("uses the tick for a topic with none", () => {
    expect(topicDone(null, true)).toBe(true);
    expect(topicDone(undefined, false)).toBe(false);
  });
});

describe("the lock rule", () => {
  it("never locks the first unit", () => {
    expect(isLocked(undefined)).toBe(false);
  });

  it("locks a unit while the previous one has topics and none done", () => {
    expect(isLocked({ done: 0, total: 3 })).toBe(true);
    expect(isLocked({ done: 1, total: 3 })).toBe(false);
  });

  it("does not lock behind an empty unit", () => {
    expect(isLocked({ done: 0, total: 0 })).toBe(false);
  });
});

describe("pathStatus", () => {
  const modules = [
    { id: "m1", topics: [{ id: "t1", mastery: mastered }, { id: "t2", mastery: learning }] },
    { id: "m2", topics: [{ id: "t3", mastery: null }, { id: "t4", mastery: null }] },
    { id: "m3", topics: [{ id: "t5", mastery: null }] },
  ];

  it("makes the first topic that is not done the active node", () => {
    const s = pathStatus(modules, {});
    expect(s.active).toEqual({ moduleId: "m1", topicId: "t2" });
  });

  it("locks each unit whose predecessor has nothing done", () => {
    const s = pathStatus(modules, {});
    expect(s.modules.map((m) => m.locked)).toEqual([false, false, true]);
    const ticked = pathStatus(modules, { t4: true });
    expect(ticked.modules.map((m) => m.locked)).toEqual([false, false, false]);
  });

  it("counts done topics across the course", () => {
    const s = pathStatus(modules, { t3: true, t2: true });
    // t2 is ticked but has a concept that is not mastered: it is not done.
    expect(s.doneCount).toBe(2);
    expect(s.total).toBe(5);
    expect(s.percent).toBe(40);
    expect(s.done).toMatchObject({ t1: true, t2: false, t3: true });
  });

  it("has no active node when everything is done", () => {
    const s = pathStatus([{ id: "m1", topics: [{ id: "t1", mastery: mastered }] }], {});
    expect(s.active).toBeNull();
    expect(s.percent).toBe(100);
  });

  it("never puts the active node in a locked unit", () => {
    const s = pathStatus(
      [
        { id: "m1", topics: [{ id: "t1", mastery: learning }] },
        { id: "m2", topics: [{ id: "t2", mastery: null }] },
      ],
      {},
    );
    expect(s.active).toEqual({ moduleId: "m1", topicId: "t1" });
    expect(s.modules[1]?.locked).toBe(true);
  });

  it("calls a unit concept-backed only when every topic has a concept", () => {
    const s = pathStatus(modules, {});
    expect(s.modules.map((m) => m.conceptBacked)).toEqual([true, false, false]);
    expect(s.conceptBacked).toBe(false);
  });
});

describe("labels", () => {
  it("words a unit by its lock and what done means there", () => {
    const s = pathStatus(
      [
        { id: "m1", topics: [{ id: "t1", mastery: mastered }] },
        { id: "m2", topics: [{ id: "t2", mastery: null }, { id: "t3", mastery: null }] },
        { id: "m3", topics: [{ id: "t4", mastery: null }] },
      ],
      {},
    );
    expect(unitSubtitle(s.modules[0]!, undefined)).toBe("1 of 1 mastered");
    expect(unitSubtitle(s.modules[1]!, 1)).toBe("0 of 2 done");
    expect(unitSubtitle(s.modules[2]!, 2)).toBe("locked until Module 2");
    expect(courseSummaryLine(s)).toBe("3 modules · 4 topics · 25% done");
  });

  it("captions a node from its mastery or its tick", () => {
    expect(nodeCaption(learning, false)).toBe("Learning · p(L) 0.40");
    expect(nodeCaption({ ...learning, concepts: [concept("b", 0.4, "learning"), concept("c", 0.5, "learning")] }, false)).toBe(
      "Learning · p(L) 0.40 · 2 concepts",
    );
    expect(nodeCaption(null, true)).toBe("Completed");
    expect(nodeCaption(null, false)).toBe("Not started");
  });
});

describe("links", () => {
  it("sends Continue to the concept session, or the topic session without a concept", () => {
    expect(continueHref("cp4284", "m1-x", "cp4284-m1-t1", learning)).toBe("/learn/b/session");
    expect(continueHref("cp4284", "m1-x", "cp4284-m1-t2", null)).toBe(
      "/courses/cp4284/m1-x/session?topic=cp4284-m1-t2",
    );
  });

  it("opens the Guidebook on the first mapped concept, then the module's own list", () => {
    expect(guidebookConcept([{ mastery: null }, { mastery: learning }], ["z"], null)).toBe("b");
    expect(guidebookConcept([{ mastery: null }], ["gone", "here"], new Set(["here"]))).toBe("here");
    expect(guidebookConcept([{ mastery: null }], ["gone"], null)).toBe("gone");
    expect(guidebookConcept([{ mastery: null }], [], null)).toBeNull();
  });
});
