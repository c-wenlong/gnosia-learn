import { describe, expect, it } from "vitest";
import {
  addUserResource,
  clearKnowledge,
  defaultState,
  KNOWLEDGE_LIMITS,
  migrateState,
  recordKnowledge,
  removeUserResource,
  resetCourseProgress,
  setLastVisited,
  setNote,
  setTheme,
  toggleTopic,
} from "@/lib/storage";
import { CURRENT_STATE_VERSION, type KnowledgeInput } from "@/lib/types";

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
    expect(state.version).toBe(CURRENT_STATE_VERSION);
    expect(state.theme).toBe("light");
    expect(state.completed).toEqual({});
    expect(state.notes).toEqual({});
    expect(state.userResources).toEqual({});
    expect(state.knowledge).toEqual({});
    expect(state.epoch).toBe(0);
  });

  it("toggles topic completion on and off", () => {
    const on = toggleTopic(defaultState(), "topic-1");
    expect(on.completed["topic-1"]).toBe(true);
    const off = toggleTopic(on, "topic-1");
    expect(off.completed["topic-1"]).toBeUndefined();
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
      toggleTopic(defaultState(), "t1"),
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
      toggleTopic(defaultState(), "t1"),
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

describe("state migration", () => {
  it("upgrades a v1 payload without losing progress", () => {
    const migrated = migrateState({
      version: 1,
      theme: "dark",
      completed: { t1: true },
      notes: { t1: "old note" },
      userResources: {},
      epoch: 3,
    } as never);

    expect(migrated.version).toBe(CURRENT_STATE_VERSION);
    expect(migrated.completed).toEqual({ t1: true });
    expect(migrated.notes["t1"]).toBe("old note");
    expect(migrated.theme).toBe("dark");
    expect(migrated.epoch).toBe(3);
    expect(migrated.knowledge).toEqual({});
  });

  it("drops malformed knowledge entries on load", () => {
    const migrated = migrateState({
      knowledge: {
        good: { summary: "kept", keyPoints: ["a"], sessions: 2 },
        empty: { summary: "   ", keyPoints: [] },
        junk: "not an object",
      },
    } as never);

    expect(Object.keys(migrated.knowledge)).toEqual(["good"]);
    expect(migrated.knowledge["good"].sessions).toBe(2);
    expect(migrated.knowledge["good"].topicId).toBe("good");
    expect(migrated.knowledge["good"].source).toBe("agent");
  });
});
