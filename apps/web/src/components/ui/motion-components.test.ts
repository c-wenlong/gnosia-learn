// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FilterMenu } from "./FilterMenu";
import { LiveStatus } from "./LiveStatus";

/**
 * The kit's moving parts: a FilterMenu's list stays for its way out (inert,
 * and not what the trigger points at), unless motion is reduced; a
 * LiveStatus announces through a line that is always in the page and keeps
 * its last words on screen while it folds away.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom lays nothing out, so it has no scrolling to do.
  Element.prototype.scrollIntoView ??= () => undefined;
});
beforeEach(() => vi.useFakeTimers());

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  vi.useRealTimers();
  delete document.documentElement.dataset.motion;
});

function mount(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  act(() => root.render(element));
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return { container, draw: (next: ReactElement) => act(() => root.render(next)) };
}

const menu = () =>
  createElement(FilterMenu<string>, {
    label: "Type",
    options: [
      { value: "", label: "All" },
      { value: "video", label: "Video" },
    ],
    value: "",
    defaultValue: "",
    onChange: () => undefined,
  });

describe("FilterMenu", () => {
  it("pops the list in, and keeps it inert for its way out before it goes", () => {
    const { container } = mount(menu());
    const trigger = container.querySelector("button")!;
    act(() => trigger.click());
    const list = container.querySelector('[role="listbox"]')!;
    expect(list.className).toContain("animate-pop-in");
    expect(document.activeElement).toBe(list);
    expect(trigger.getAttribute("aria-controls")).toBe(list.id);

    act(() => trigger.click());
    expect(container.querySelector('[role="listbox"]')).toBe(list);
    expect(list.hasAttribute("inert")).toBe(true);
    expect(list.className).toContain("animate-pop-out");
    expect(trigger.hasAttribute("aria-controls")).toBe(false);
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it("takes the list away at once when motion is reduced", () => {
    document.documentElement.dataset.motion = "reduce";
    const { container } = mount(menu());
    const trigger = container.querySelector("button")!;
    act(() => trigger.click());
    act(() => trigger.click());
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });
});

describe("LiveStatus", () => {
  it("announces through an sr-only line, and keeps its last words visible while it folds", () => {
    const { container, draw } = mount(createElement(LiveStatus, { text: null }));
    const live = container.querySelector('[aria-live="polite"]')!;
    const fold = container.querySelector(".grid")!;
    expect(live.className).toContain("sr-only");
    expect(fold.hasAttribute("inert")).toBe(true);

    draw(createElement(LiveStatus, { text: "Saved", tone: "ok" }));
    expect(live.textContent).toBe("Saved");
    expect(fold.hasAttribute("inert")).toBe(false);
    expect(fold.querySelector('[aria-hidden="true"]')?.textContent).toBe("Saved");

    draw(createElement(LiveStatus, { text: null }));
    expect(live.textContent).toBe("");
    expect(fold.hasAttribute("inert")).toBe(true);
    expect(fold.querySelector('[aria-hidden="true"]')?.textContent).toBe("Saved");
  });
});
