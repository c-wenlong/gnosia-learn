// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CLOSE_MS, ExpandablePanel } from "./ExpandablePanel";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom's dialog does not open itself. This does what a browser's does
  // that the panel relies on: it opens, and moves focus to the first button
  // inside, so the test of focus coming back starts from focus being away.
  const proto = HTMLDialogElement.prototype as unknown as {
    showModal: () => void;
    close: () => void;
  };
  proto.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
    this.querySelector<HTMLElement>("button")?.focus();
  };
  proto.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

const mounted: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  vi.useRealTimers();
  delete document.documentElement.dataset.motion;
});

/** The popup fades for `CLOSE_MS` before the state closes it. */
function finishClosing() {
  act(() => {
    vi.advanceTimersByTime(CLOSE_MS);
  });
}

function render() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      createElement(
        ExpandablePanel,
        // Children as an argument, as the lint rule wants; the props type
        // requires them, hence the cast.
        { title: "note.md", label: "note.md" } as ComponentProps<typeof ExpandablePanel>,
        createElement("p", { className: "words" }, "The note."),
      ),
    ),
  );
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

const dialog = (host: HTMLElement) => host.querySelector("dialog");
const button = (host: HTMLElement, name: string) =>
  host.querySelector(`button[aria-label="${name}"]`) as HTMLButtonElement;

function pressAndClick(target: Element) {
  act(() => {
    target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("ExpandablePanel", () => {
  it("shows the words in the page, and opens them in a popup from the corner", () => {
    const host = render();
    expect(host.querySelectorAll(".words")).toHaveLength(1);
    expect(dialog(host)).toBeNull();

    act(() => button(host, "Expand note.md").click());
    expect(dialog(host)?.hasAttribute("open")).toBe(true);
    expect(dialog(host)?.querySelector(".words")?.textContent).toBe("The note.");
    // One copy at a time, so a note's heading ids are never doubled.
    expect(host.querySelectorAll(".words")).toHaveLength(1);
    expect(document.documentElement.style.overflow).toBe("hidden");
  });

  it("closes from the corner button, and gives the page its scroll and focus back", () => {
    const host = render();
    act(() => button(host, "Expand note.md").click());
    expect(document.activeElement).toBe(button(host, "Close"));
    act(() => button(host, "Close").click());
    finishClosing();
    expect(dialog(host)).toBeNull();
    expect(document.documentElement.style.overflow).toBe("");
    expect(host.querySelectorAll(".words")).toHaveLength(1);
    expect(document.activeElement).toBe(button(host, "Expand note.md"));
  });

  it("closes on Escape and on a click outside, but not on a click inside", () => {
    const host = render();
    act(() => button(host, "Expand note.md").click());
    pressAndClick(dialog(host)!.querySelector(".words")!);
    expect(dialog(host)).not.toBeNull();

    pressAndClick(dialog(host)!);
    finishClosing();
    expect(dialog(host)).toBeNull();

    act(() => button(host, "Expand note.md").click());
    act(() => {
      dialog(host)!.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    finishClosing();
    expect(dialog(host)).toBeNull();
  });

  it("fades out for a beat before it closes, and ignores a second close meanwhile", () => {
    const host = render();
    act(() => button(host, "Expand note.md").click());
    act(() => button(host, "Close").click());
    // Still there, fading, and no longer taking clicks.
    expect(dialog(host)?.className).toContain("opacity-0");
    expect(dialog(host)?.className).toContain("pointer-events-none");
    // The words stay in the popup while it fades: the card has none yet, so there is one copy.
    expect(host.querySelectorAll(".words")).toHaveLength(1);
    expect(dialog(host)?.querySelector(".words")).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(CLOSE_MS / 2);
    });
    act(() => {
      dialog(host)!.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    pressAndClick(dialog(host)!);
    expect(dialog(host)).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(CLOSE_MS / 2);
    });
    expect(dialog(host)).toBeNull();
    expect(document.activeElement).toBe(button(host, "Expand note.md"));
  });

  it("closes at once when motion is reduced", () => {
    document.documentElement.dataset.motion = "reduce";
    const host = render();
    act(() => button(host, "Expand note.md").click());
    act(() => button(host, "Close").click());
    expect(dialog(host)).toBeNull();
  });

  it("does not close when a selection dragged out of the words ends outside", () => {
    const host = render();
    act(() => button(host, "Expand note.md").click());
    const words = dialog(host)!.querySelector(".words")!;
    act(() => {
      words.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      dialog(host)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(dialog(host)).not.toBeNull();
  });
});
