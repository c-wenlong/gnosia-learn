// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { SheetFocus as SheetFocusOf } from "./SheetFocus";

const SheetFocus = SheetFocusOf as (props: { label: string; returnTo: string }) => ReturnType<typeof SheetFocusOf>;

/**
 * The inspector sheet takes focus as it opens and hands it back to More as it
 * closes (the Greptile review of #596), but not to a More hidden at this
 * width, which jsdom says by giving it no client rects.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  document.body.innerHTML = "";
});

/** The More button, on screen or hidden, and the sheet it opened. */
function open(onScreen: boolean): { more: HTMLButtonElement; close: () => void } {
  const more = document.createElement("button");
  more.setAttribute("aria-label", "More actions");
  // jsdom lays nothing out: say whether the button is on screen.
  more.getClientRects = () => (onScreen ? [{}] : []) as unknown as DOMRectList;
  document.body.append(more);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let mounted = true;
  cleanups.push(() => {
    if (mounted) act(() => root.unmount());
  });
  act(() =>
    root.render(createElement(SheetFocus, { label: "Diagram details", returnTo: 'button[aria-label="More actions"]' }, createElement("p", null, "Inspector"))),
  );
  const close = () => {
    mounted = false;
    act(() => root.unmount());
  };
  return { more, close };
}

describe("SheetFocus", () => {
  it("focuses the sheet on open and the opening button on close", () => {
    const { more, close } = open(true);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Diagram details");
    close();
    expect(document.activeElement).toBe(more);
  });

  it("does not hand focus back to a button hidden at this width", () => {
    const { more, close } = open(false);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Diagram details");
    close();
    expect(document.activeElement).not.toBe(more);
  });
});
