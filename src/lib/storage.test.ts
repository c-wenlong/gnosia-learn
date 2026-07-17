import { describe, expect, it } from "vitest";
import {
  addUserResource,
  defaultState,
  removeUserResource,
  resetCourseProgress,
  setLastVisited,
  setNote,
  setTheme,
  toggleTopic,
} from "@/lib/storage";

describe("learner state reducers", () => {
  it("starts from a clean default state", () => {
    const state = defaultState();
    expect(state.version).toBe(1);
    expect(state.theme).toBe("light");
    expect(state.completed).toEqual({});
    expect(state.notes).toEqual({});
    expect(state.userResources).toEqual({});
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

  it("records last visited course and module", () => {
    const visited = setLastVisited(defaultState(), "cs2111", "m1");
    expect(visited.lastVisited?.courseSlug).toBe("cs2111");
    expect(visited.lastVisited?.moduleSlug).toBe("m1");
    expect(visited.lastVisited?.at).toBeTruthy();
  });
});
