import { describe, expect, it } from "vitest";

import { quizKey, type QuizKeyEvent } from "./quiz-keys";

/** A stand-in for the focused element: its tag, and whether it sits in a live control. */
function target(tagName: string, { editable = false, inControl = false } = {}): EventTarget {
  return { tagName, isContentEditable: editable, closest: () => (inControl ? {} : null) } as unknown as EventTarget;
}

const press = (key: string, over: Partial<QuizKeyEvent> = {}): QuizKeyEvent => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  target: target("BODY"),
  ...over,
});

describe("quizKey", () => {
  it("reads 1 to 4 as options 0 to 3, and nothing else as a number", () => {
    expect(quizKey(press("1"), false)?.number).toBe(0);
    expect(quizKey(press("4"), false)?.number).toBe(3);
    for (const key of ["0", "5", "a", " ", "Enter", "1.5"]) expect(quizKey(press(key), false)?.number).toBeNull();
  });

  it("says Enter and Space apart", () => {
    expect(quizKey(press("Enter"), false)).toEqual({ number: null, enter: true, space: false });
    expect(quizKey(press(" "), false)).toEqual({ number: null, enter: false, space: true });
  });

  it("leaves Enter and Space to a focused link or button, but not the numbers", () => {
    const onButton = { target: target("BUTTON", { inControl: true }) };
    expect(quizKey(press("Enter", onButton), false)).toEqual({ number: null, enter: false, space: false });
    expect(quizKey(press(" ", onButton), false)?.space).toBe(false);
    expect(quizKey(press("2", onButton), false)?.number).toBe(1);
  });

  it("is not the page's while a modifier is held or a write is in flight", () => {
    expect(quizKey(press("1", { metaKey: true }), false)).toBeNull();
    expect(quizKey(press("1", { ctrlKey: true }), false)).toBeNull();
    expect(quizKey(press("Enter", { altKey: true }), false)).toBeNull();
    expect(quizKey(press("1"), true)).toBeNull();
  });

  it("is typing in a field, not a key for the page", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) expect(quizKey(press("1", { target: target(tag) }), false)).toBeNull();
    expect(quizKey(press("Enter", { target: target("DIV", { editable: true }) }), false)).toBeNull();
  });

  it("reads a press with no target", () => expect(quizKey(press("3", { target: null }), false)?.number).toBe(2));
});
