// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { onScreen, rememberFocus } from "./focus";

/**
 * A drawer or dialog gives the focus back to whatever opened it, but only
 * while that is still on screen; otherwise to the fallback a caller names.
 */

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

/** A button jsdom treats as laid out or not: jsdom lays nothing out, so the boxes are stubbed. */
function button(label: string, laidOut = true): HTMLButtonElement {
  const element = document.createElement("button");
  element.textContent = label;
  document.body.append(element);
  vi.spyOn(element, "getClientRects").mockImplementation(() => (laidOut ? [{}] : []) as unknown as DOMRectList);
  return element;
}

describe("rememberFocus", () => {
  it("gives the focus back to the opener, without scrolling to it", () => {
    const opener = button("Open");
    const inside = button("Inside");
    opener.focus();
    const remembered = rememberFocus();
    expect(remembered.element).toBe(opener);
    inside.focus();
    const focus = vi.spyOn(opener, "focus");
    remembered.restore();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(opener);
  });

  it("does not give it to an opener that is gone or not laid out, and takes the fallback instead", () => {
    const hidden = button("Hidden", false);
    const fallback = button("New chat");
    hidden.focus();
    rememberFocus().restore(() => fallback);
    expect(document.activeElement).toBe(fallback);

    const removed = button("Removed");
    removed.focus();
    const remembered = rememberFocus();
    removed.remove();
    remembered.restore(() => fallback);
    expect(document.activeElement).toBe(fallback);
  });

  it("does not remember the body, and moves nothing with no fallback", () => {
    const other = button("Other");
    (document.activeElement as HTMLElement | null)?.blur();
    const remembered = rememberFocus();
    expect(remembered.element).toBeNull();
    other.focus();
    remembered.restore();
    expect(document.activeElement).toBe(other);
    remembered.restore(() => null);
    expect(document.activeElement).toBe(other);
  });
});

describe("onScreen", () => {
  it("is in the document and laid out", () => {
    expect(onScreen(button("Shown"))).toBe(true);
    expect(onScreen(button("Folded", false))).toBe(false);
    expect(onScreen(document.createElement("button"))).toBe(false);
  });
});
