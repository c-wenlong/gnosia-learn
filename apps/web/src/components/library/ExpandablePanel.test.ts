// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { ExpandablePanel } from "./ExpandablePanel";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom's dialog does not open itself; this is the part the panel relies on.
  const proto = HTMLDialogElement.prototype as unknown as {
    showModal: () => void;
    close: () => void;
  };
  proto.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

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
    expect(document.documentElement.style.overflow).toBe("hidden");
  });

  it("closes from the corner button, and gives the page its scroll and focus back", () => {
    const host = render();
    act(() => button(host, "Expand note.md").click());
    act(() => button(host, "Close").click());
    expect(dialog(host)).toBeNull();
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.activeElement).toBe(button(host, "Expand note.md"));
  });

  it("closes on Escape and on a click outside, but not on a click inside", () => {
    const host = render();
    act(() => button(host, "Expand note.md").click());
    pressAndClick(dialog(host)!.querySelector(".words")!);
    expect(dialog(host)).not.toBeNull();

    pressAndClick(dialog(host)!);
    expect(dialog(host)).toBeNull();

    act(() => button(host, "Expand note.md").click());
    act(() => {
      dialog(host)!.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
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
