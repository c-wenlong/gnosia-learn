// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { Dialog, DIALOG_CLOSE_MS, dialogClasses, type DialogProps } from "./Dialog";
import { usePresence } from "./use-presence";

/**
 * The kit dialog every modal in the app is drawn with: shown while mounted,
 * Escape and a press that starts and ends on the backdrop ask to close, focus
 * goes back where it was, and a caller closing in motion keeps it for one
 * beat unless motion is reduced.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom's dialog does not open itself. This does what a browser's does
  // that the tests rely on: it opens, and focuses the first button inside.
  const proto = HTMLDialogElement.prototype as unknown as { showModal: () => void; close: () => void };
  proto.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
    this.querySelector<HTMLElement>("button")?.focus();
  };
  proto.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

beforeEach(() => vi.useFakeTimers());

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  vi.useRealTimers();
  delete document.documentElement.dataset.motion;
  document.body.replaceChildren();
});

function mount(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  act(() => root.render(element));
  let gone = false;
  const unmount = () => {
    if (gone) return;
    gone = true;
    act(() => root.unmount());
    container.remove();
  };
  mounted.push(unmount);
  return { container, draw: (next: ReactElement) => act(() => root.render(next)), unmount };
}

function dialogOf(props: Partial<DialogProps> = {}, inside: ReactElement = createElement("button", { type: "button" }, "Close")) {
  return createElement(Dialog, { label: "Settings", onClose: () => undefined, ...props } as DialogProps, inside);
}

const dialog = (container: HTMLElement) => container.querySelector("dialog")!;

/** A press and its click, as a browser reports them: the click lands where the press ended. */
function press(down: Element, up: Element = down) {
  act(() => {
    down.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    up.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** An element jsdom would call laid out: it has boxes, as one on screen does. */
function onScreenButton(name: string) {
  const button = document.createElement("button");
  button.textContent = name;
  button.getClientRects = () => [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList;
  document.body.append(button);
  return button;
}

describe("Dialog", () => {
  it("opens as a modal while mounted, named by its label or a heading, focusing a marked field", () => {
    const { container } = mount(
      dialogOf({}, createElement("div", null, createElement("button", { type: "button" }, "Close"), createElement("input", { "data-autofocus": "" }))),
    );
    expect(dialog(container).hasAttribute("open")).toBe(true);
    expect(dialog(container).getAttribute("aria-label")).toBe("Settings");
    expect(document.activeElement).toBe(container.querySelector("input"));

    const named = mount(createElement(Dialog, { labelledBy: "title", onClose: () => undefined } as DialogProps, createElement("h2", { id: "title" }, "A note")));
    expect(dialog(named.container).getAttribute("aria-labelledby")).toBe("title");
    expect(dialog(named.container).hasAttribute("aria-label")).toBe(false);
  });

  it("asks to close on Escape, and keeps the element open for the caller to decide", () => {
    const onClose = vi.fn();
    const { container } = mount(dialogOf({ onClose }));
    const cancel = new Event("cancel", { cancelable: true });
    act(() => {
      dialog(container).dispatchEvent(cancel);
    });
    expect(cancel.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on a press on the backdrop, not inside, and not on a selection dragged out to it", () => {
    const onClose = vi.fn();
    const { container } = mount(dialogOf({ onClose }, createElement("p", null, "The words.")));
    const words = container.querySelector("p")!;

    press(words);
    expect(onClose).not.toHaveBeenCalled();
    // Started in the words and ended on the backdrop: a text selection.
    press(words, dialog(container));
    expect(onClose).not.toHaveBeenCalled();

    press(dialog(container));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks nothing while it is on its way out", () => {
    const onClose = vi.fn();
    const { container } = mount(dialogOf({ onClose, closing: true }));
    expect(dialog(container).hasAttribute("data-closing")).toBe(true);
    act(() => {
      dialog(container).dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    press(dialog(container));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("gives focus back to what had it, or to `returnFocus` when that has gone", () => {
    const opener = onScreenButton("Settings");
    opener.focus();
    const first = mount(dialogOf());
    expect(document.activeElement).not.toBe(opener);
    first.unmount();
    expect(document.activeElement).toBe(opener);

    const fallback = onScreenButton("New chat");
    opener.focus();
    const second = mount(dialogOf({ returnFocus: () => fallback }));
    opener.remove();
    second.unmount();
    expect(document.activeElement).toBe(fallback);
  });

  it("gives focus to its `opener` on close, whatever had it on open", () => {
    const opener = onScreenButton("Expand");
    const elsewhere = onScreenButton("Raw file");
    elsewhere.focus();
    const { unmount } = mount(dialogOf({ opener: () => opener }));
    unmount();
    expect(document.activeElement).toBe(opener);
  });

  it("holds the page still while open when asked, and lets it go after", () => {
    const { container, unmount } = mount(dialogOf({ lockScroll: true }));
    expect(dialog(container).hasAttribute("open")).toBe(true);
    expect(document.documentElement.style.overflow).toBe("hidden");
    unmount();
    expect(document.documentElement.style.overflow).toBe("");

    mount(dialogOf());
    expect(document.documentElement.style.overflow).toBe("");
  });
});

/** A caller closing in motion, as `ExpandablePanel` does. */
function Presence({ open }: { open: boolean }) {
  const { mounted, leaving } = usePresence(open, DIALOG_CLOSE_MS);
  return mounted ? dialogOf({ closing: leaving }) : null;
}

describe("Dialog in motion", () => {
  it("stays for one beat on its way out, marked as closing, then goes", () => {
    const { container, draw } = mount(createElement(Presence, { open: true }));
    expect(dialog(container).hasAttribute("data-closing")).toBe(false);
    draw(createElement(Presence, { open: false }));
    expect(dialog(container).hasAttribute("data-closing")).toBe(true);
    act(() => vi.advanceTimersByTime(DIALOG_CLOSE_MS - 1));
    expect(container.querySelector("dialog")).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(container.querySelector("dialog")).toBeNull();
  });

  it("goes at once, and moves nothing, when motion is reduced", () => {
    document.documentElement.dataset.motion = "reduce";
    const { container, draw } = mount(createElement(Presence, { open: true }));
    draw(createElement(Presence, { open: false }));
    expect(container.querySelector("dialog")).toBeNull();
    // The rise and fade, the backdrop's included, stand still for that reader.
    const classes = dialogClasses().split(" ");
    expect(classes).toContain("motion-reduce:transition-none");
    expect(classes).toContain("motion-reduce:backdrop:transition-none");
  });

  it("rises and fades in with its backdrop, and back out while closing, over the beat", () => {
    const classes = dialogClasses().split(" ");
    for (const name of [
      "duration-200",
      "starting:open:opacity-0",
      "starting:open:translate-y-2",
      "starting:open:backdrop:opacity-0",
      "data-closing:opacity-0",
      "data-closing:backdrop:opacity-0",
    ]) {
      expect(classes).toContain(name);
    }
    expect(DIALOG_CLOSE_MS).toBe(200);
  });

  it("is the whole screen on a phone and a sized panel from 768px, `tall` taking the whole height", () => {
    expect(dialogClasses({ size: "compact" })).toContain("md:w-[560px]");
    expect(dialogClasses()).toContain("lg:w-[720px]");
    expect(dialogClasses({ size: "wide" })).toContain("lg:w-[min(960px,calc(100vw-64px))]");
    expect(dialogClasses({ size: "reading" })).toContain("md:w-[min(64rem,calc(100vw-48px))]");
    expect(dialogClasses({ size: "reading", tall: true })).toContain("md:h-[calc(100dvh-64px)]");
    expect(dialogClasses({ tall: true })).toContain("md:h-[calc(100dvh-96px)]");
    expect(dialogClasses({ tall: true })).not.toContain("md:h-auto");
    for (const size of ["compact", "default", "wide", "reading"] as const) {
      const classes = dialogClasses({ size }).split(" ");
      expect(classes).toEqual(expect.arrayContaining(["h-dvh", "w-full", "rounded-none", "md:rounded-2xl"]));
    }
  });
});

/**
 * Every modal is the kit's. Two hand-written ones had drifted apart in their
 * backdrop, border, radius, motion and close beat before this (#359).
 */
describe("dialogs", () => {
  it("leaves no <dialog> element outside the kit", () => {
    const src = join(dirname(fileURLToPath(import.meta.url)), "../..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) && /^\s*<dialog\b/m.test(readFileSync(path, "utf8"))) {
          offenders.push(relative(src, path));
        }
      }
    };
    walk(src);
    expect(offenders).toEqual(["components/ui/Dialog.tsx"]);
  });
});
