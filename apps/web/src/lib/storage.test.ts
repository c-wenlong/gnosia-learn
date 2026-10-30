import { describe, expect, it } from "vitest";
import {
  addUserResource,
  clearKnowledge,
  recordKnowledge,
  removeUserResource,
  resetCourseProgress,
  setCourseActive,
  setLastVisited,
  setNote,
  setTheme,
  setTopicCompleted,
} from "@/lib/storage";
import { KNOWLEDGE_LIMITS } from "@gnosia/schema/shared";
import { emptyLearnerState as defaultState, type KnowledgeInput } from "@gnosia/tutor/types";

const sampleKnowledge = (
  overrides: Partial<KnowledgeInput> = {},
): KnowledgeInput => ({
  summary: "You worked out why self-attention is permutation-equivariant.",
  keyPoints: ["Positional encodings restore order information"],
  misconceptions: ["Thought attention weights were learned parameters"],
  openQuestions: ["How does this interact with KV caching?"],
  source: "agent",
  ...overrides,
});

describe("learner state reducers", () => {
  it("starts from a clean default state", () => {
    const state = defaultState();
    expect(state.theme).toBe("light");
    expect(state.completed).toEqual({});
    expect(state.notes).toEqual({});
    expect(state.userResources).toEqual({});
    expect(state.knowledge).toEqual({});
    expect(state.epoch).toBe(0);
  });

  it("ticks and unticks an item, the same however often it is applied", () => {
    const on = setTopicCompleted(defaultState(), "topic-1", true);
    expect(on.completed["topic-1"]).toBe(true);
    expect(setTopicCompleted(on, "topic-1", true)).toEqual(on);
    const off = setTopicCompleted(on, "topic-1", false);
    expect(off.completed["topic-1"]).toBeUndefined();
    expect(setTopicCompleted(off, "topic-1", false)).toEqual(off);
  });

  it("sets and clears notes", () => {
    const withNote = setNote(defaultState(), "topic-1", "  hello  ");
    expect(withNote.notes["topic-1"]).toBe("  hello  ");
    const cleared = setNote(withNote, "topic-1", "   ");
    expect(cleared.notes["topic-1"]).toBeUndefined();
  });

  it("sets theme", () => {
    expect(setTheme(defaultState(), "dark").theme).toBe("dark");
  });

  it("adds and removes user resources", () => {
    const withRes = addUserResource(defaultState(), "mod-1", {
      title: "Paper",
      url: "https://example.com",
    });
    const list = withRes.userResources["mod-1"];
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("Paper");
    expect(list[0].id).toMatch(/^user-/);

    const removed = removeUserResource(withRes, "mod-1", list[0].id);
    expect(removed.userResources["mod-1"]).toBeUndefined();
  });

  it("resets course progress and bumps epoch", () => {
    const seeded = setNote(
      setTopicCompleted(defaultState(), "t1", true),
      "t1",
      "keep? no",
    );
    const reset = resetCourseProgress(seeded, ["t1"]);
    expect(reset.completed["t1"]).toBeUndefined();
    expect(reset.notes["t1"]).toBeUndefined();
    expect(reset.epoch).toBe(1);
  });

  it("preserves knowledge recaps across a progress reset", () => {
    const seeded = recordKnowledge(
      setTopicCompleted(defaultState(), "t1", true),
      "t1",
      sampleKnowledge(),
    );
    const reset = resetCourseProgress(seeded, ["t1"]);
    expect(reset.completed["t1"]).toBeUndefined();
    expect(reset.knowledge["t1"]?.summary).toContain("permutation-equivariant");
  });

  it("records last visited course and module", () => {
    const visited = setLastVisited(defaultState(), "cs2111", "m1");
    expect(visited.lastVisited?.courseSlug).toBe("cs2111");
    expect(visited.lastVisited?.moduleSlug).toBe("m1");
    expect(visited.lastVisited?.at).toBeTruthy();
  });

  it("sets a course aside and brings it back", () => {
    const start = defaultState();
    const aside = setCourseActive(setCourseActive(start, "cs2111", false), "cs3230", false);
    expect(aside.inactiveCourses).toEqual(["cs2111", "cs3230"]);
    expect(setCourseActive(aside, "cs2111", true).inactiveCourses).toEqual(["cs3230"]);
    // Asking for what is already so changes nothing, not even the reference.
    expect(setCourseActive(aside, "cs2111", false)).toBe(aside);
    expect(setCourseActive(start, "cs2111", true)).toBe(start);
  });
});

describe("topic knowledge", () => {
  it("stores a recap and counts the first session", () => {
    const state = recordKnowledge(defaultState(), "t1", sampleKnowledge());
    const entry = state.knowledge["t1"];
    expect(entry.topicId).toBe("t1");
    expect(entry.sessions).toBe(1);
    expect(entry.source).toBe("agent");
    expect(entry.keyPoints).toHaveLength(1);
    expect(entry.updatedAt).toBeTruthy();
  });

  it("increments the session count when a recap is replaced", () => {
    const first = recordKnowledge(defaultState(), "t1", sampleKnowledge());
    const second = recordKnowledge(
      first,
      "t1",
      sampleKnowledge({ summary: "Second pass." }),
    );
    expect(second.knowledge["t1"].sessions).toBe(2);
    expect(second.knowledge["t1"].summary).toBe("Second pass.");
  });

  it("does not count a session for a manual edit", () => {
    const first = recordKnowledge(defaultState(), "t1", sampleKnowledge());
    const edited = recordKnowledge(
      first,
      "t1",
      sampleKnowledge({ summary: "Fixed a typo.", source: "manual" }),
      { countSession: false },
    );
    expect(edited.knowledge["t1"].sessions).toBe(1);
    expect(edited.knowledge["t1"].source).toBe("manual");
  });

  it("clears the record when every field is empty", () => {
    const seeded = recordKnowledge(defaultState(), "t1", sampleKnowledge());
    const cleared = recordKnowledge(seeded, "t1", {
      summary: "   ",
      keyPoints: [],
      misconceptions: [],
      openQuestions: ["  "],
      source: "manual",
    });
    expect(cleared.knowledge["t1"]).toBeUndefined();
  });

  it("clamps oversized summaries and lists", () => {
    const state = recordKnowledge(defaultState(), "t1", {
      summary: "x".repeat(5000),
      keyPoints: Array.from({ length: 30 }, (_, i) => `point ${i}`),
      misconceptions: ["y".repeat(1000)],
      openQuestions: [],
      source: "agent",
    });
    const entry = state.knowledge["t1"];
    expect(entry.summary).toHaveLength(KNOWLEDGE_LIMITS.summaryChars);
    expect(entry.keyPoints).toHaveLength(KNOWLEDGE_LIMITS.listItems);
    expect(entry.misconceptions[0]).toHaveLength(KNOWLEDGE_LIMITS.itemChars);
  });

  it("forgets a single topic recap", () => {
    const seeded = recordKnowledge(defaultState(), "t1", sampleKnowledge());
    expect(clearKnowledge(seeded, "t1").knowledge["t1"]).toBeUndefined();
    expect(clearKnowledge(seeded, "missing")).toBe(seeded);
  });
});

/*
 * The `state migration` suite that used to live here is gone with the code it
 * tested. `migrateState` brought an older localStorage document up to the
 * current version on every load; there is no localStorage document any more,
 * and the one-time carry-over of an old one is `importLegacyState` in
 * services/catalog/src/state/import.ts, tested against a real database in
 * services/catalog/test/state.test.ts. The defensive parsing those two cases
 * covered — a malformed knowledge entry, a v1 payload with no `knowledge` key
 * — is covered there, against the shape that actually arrives.
 */
