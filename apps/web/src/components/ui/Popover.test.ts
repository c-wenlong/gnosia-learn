// @vitest-environment jsdom
import { act, createElement, Fragment, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { Dialog, type DialogProps } from "./Dialog";
import { FilterMenu } from "./FilterMenu";
import { Menu as KitMenu, MenuItem } from "./Menu";
import { Popover, type PopoverCloseReason } from "./Popover";
import { Select } from "./Select";

/**
 * The kit `Popover`: shown in the top layer, closed by a press outside, by
 * the focus leaving, and by Escape one layer at a time (the innermost only,
 * the press cancelled and stopped so nothing around it closes too), the focus
 * going back to what opened it, and kept inert for its way out.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom lays nothing out, so it has no scrolling to do.
  Element.prototype.scrollIntoView ??= () => undefined;
});

const shown: Element[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  shown.length = 0;
  HTMLElement.prototype.showPopover = function (this: HTMLElement) {
    shown.push(this);
  };
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  vi.useRealTimers();
  delete document.documentElement.dataset.motion;
});

/** A button that toggles a popover holding one row and whatever else is passed. */
function Menu({ name, closed, children }: { name: string; closed: (reason: PopoverCloseReason) => void; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  // The anchor through state rather than `useRef`, which the hooks lint
  // refuses to see handed to `createElement` during render.
  const [button, setButton] = useState<HTMLButtonElement | null>(null);
  const anchor = useMemo(() => ({ current: button }), [button]);
  return createElement(
    Fragment,
    null,
    createElement("button", { ref: setButton, type: "button", "data-anchor": name, onClick: () => setOpen((was) => !was) }, name),
    createElement(
      Popover,
      {
        anchorRef: anchor,
        open,
        onOpenChange: (_open: boolean, reason: PopoverCloseReason) => {
          closed(reason);
          setOpen(false);
        },
        id: `${name}-panel`,
        "aria-activedescendant": `${name}-row`,
        "data-panel": name,
      } as ComponentProps<typeof Popover>,
      createElement("button", { type: "button", id: `${name}-row`, "data-row": name }, `${name} row`),
      children,
    ),
  );
}

function mount(element: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const outside = document.createElement("button");
  outside.textContent = "outside";
  document.body.append(outside);
  const root: Root = createRoot(container);
  act(() => root.render(element));
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
    outside.remove();
  });
  const q = <T extends HTMLElement>(selector: string) => container.querySelector<T>(selector);
  const anchor = (name: string) => q<HTMLButtonElement>(`[data-anchor="${name}"]`)!;
  const panel = (name: string) => q<HTMLElement>(`[data-panel="${name}"]`);
  const escape = (init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true, ...init });
    act(() => void (document.activeElement ?? document.body).dispatchEvent(event));
    return event;
  };
  return { anchor, panel, outside, escape };
}

describe("Popover", () => {
  it("shows its box in the top layer, fixed, popping in, and leaves the focus where it was", () => {
    const { anchor, panel } = mount(createElement(Menu, { name: "a", closed: () => undefined }));
    expect(panel("a")).toBeNull();
    anchor("a").focus();
    act(() => anchor("a").click());
    const box = panel("a")!;
    expect(box.getAttribute("popover")).toBe("manual");
    expect(box.className).toContain("fixed");
    expect(box.className).toContain("animate-pop-in");
    expect(box.getAttribute("tabindex")).toBe("-1");
    expect(box.dataset.side).toBe("bottom");
    expect(shown).toContain(box);
    expect(document.activeElement).toBe(anchor("a"));
  });

  it("closes on a press outside, but not on its anchor or inside it", () => {
    const closed = vi.fn();
    const { anchor, panel, outside } = mount(createElement(Menu, { name: "a", closed }));
    act(() => anchor("a").click());
    act(() => void panel("a")!.querySelector("button")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    act(() => void anchor("a").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    expect(closed).not.toHaveBeenCalled();
    act(() => void outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    expect(closed).toHaveBeenCalledWith("outside");
  });

  it("closes when the focus leaves both it and its anchor, and not as it moves between them", () => {
    const closed = vi.fn();
    const { anchor, panel, outside } = mount(createElement(Menu, { name: "a", closed }));
    act(() => anchor("a").click());
    act(() => panel("a")!.querySelector<HTMLButtonElement>("button")!.focus());
    act(() => anchor("a").focus());
    expect(closed).not.toHaveBeenCalled();
    act(() => outside.focus());
    expect(closed).toHaveBeenCalledWith("blur");
  });

  it("is inert on its way out, pointed at by nothing, and gone once the exit has run", () => {
    const { anchor, panel } = mount(createElement(Menu, { name: "a", closed: () => undefined }));
    act(() => anchor("a").click());
    const box = panel("a")!;
    expect(box.id).toBe("a-panel");
    expect(box.getAttribute("aria-activedescendant")).toBe("a-row");
    act(() => anchor("a").click());
    expect(panel("a")).toBe(box);
    expect(box.hasAttribute("inert")).toBe(true);
    expect(box.className).toContain("animate-pop-out");
    expect(box.hasAttribute("id")).toBe(false);
    expect(box.hasAttribute("aria-activedescendant")).toBe(false);
    act(() => vi.advanceTimersByTime(120));
    expect(panel("a")).toBeNull();
  });

  it("goes at once when motion is reduced", () => {
    document.documentElement.dataset.motion = "reduce";
    const { anchor, panel } = mount(createElement(Menu, { name: "a", closed: () => undefined }));
    act(() => anchor("a").click());
    act(() => anchor("a").click());
    expect(panel("a")).toBeNull();
  });
});

describe("Popover's Escape", () => {
  it("closes the innermost layer only, with the focus back on its anchor, and lets nothing around it hear", () => {
    const closed = vi.fn();
    const heard = vi.fn();
    window.addEventListener("keydown", heard);
    try {
      const { anchor, panel, escape } = mount(
        createElement(Menu, { name: "outer", closed }, createElement(Menu, { name: "inner", closed })),
      );
      act(() => anchor("outer").click());
      act(() => anchor("inner").click());
      act(() => panel("inner")!.querySelector<HTMLButtonElement>("button")!.focus());

      // Cancelled, as a modal <dialog>'s close request would be, and stopped
      // before the drawer's window listener.
      expect(escape().defaultPrevented).toBe(true);
      expect(closed).toHaveBeenCalledTimes(1);
      expect(panel("inner")!.hasAttribute("inert")).toBe(true);
      expect(panel("outer")!.hasAttribute("inert")).toBe(false);
      expect(document.activeElement).toBe(anchor("inner"));
      expect(heard).not.toHaveBeenCalled();

      expect(escape().defaultPrevented).toBe(true);
      expect(closed).toHaveBeenCalledTimes(2);
      expect(panel("outer")!.hasAttribute("inert")).toBe(true);
      expect(heard).not.toHaveBeenCalled();

      // Nothing open: the press is the page's again.
      expect(escape().defaultPrevented).toBe(false);
      expect(heard).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("keydown", heard);
    }
  });

  it("leaves the focus where it was when it was outside the box, as in a field that kept it", () => {
    const { anchor, escape } = mount(createElement(Menu, { name: "a", closed: () => undefined }));
    act(() => anchor("a").click());
    anchor("a").focus();
    escape();
    expect(document.activeElement).toBe(anchor("a"));
  });

  it("leaves a press an input method is composing with alone", () => {
    const closed = vi.fn();
    const { anchor, escape } = mount(createElement(Menu, { name: "a", closed }));
    act(() => anchor("a").click());
    expect(escape({ isComposing: true }).defaultPrevented).toBe(false);
    expect(closed).not.toHaveBeenCalled();
  });
});

describe("Popover's placement", () => {
  it("sits under its anchor at fixed coordinates, and follows it when the anchor or the box changes size", () => {
    let observed: (() => void) | null = null;
    const watched: Element[] = [];
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(run: () => void) {
        observed = run;
      }
      observe(target: Element) {
        watched.push(target);
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    // A 1024 by 768 window and a box 200 wide and 150 tall, as a browser would lay them out.
    const root = document.documentElement;
    const sizes: Array<[object, string, number | (() => number)]> = [
      [root, "clientWidth", 1024],
      [root, "clientHeight", 768],
      [HTMLElement.prototype, "offsetWidth", function (this: HTMLElement) { return this.dataset.panel ? 200 : 0; } as unknown as () => number],
      [HTMLElement.prototype, "offsetHeight", function (this: HTMLElement) { return this.dataset.panel ? 150 : 0; } as unknown as () => number],
      [HTMLElement.prototype, "clientHeight", function (this: HTMLElement) { return this.dataset.panel ? 146 : 0; } as unknown as () => number],
      [HTMLElement.prototype, "scrollHeight", function (this: HTMLElement) { return this.dataset.panel ? 146 : 0; } as unknown as () => number],
    ];
    const saved = sizes.map(([target, key]) => [target, key, Object.getOwnPropertyDescriptor(target, key)] as const);
    for (const [target, key, value] of sizes) {
      Object.defineProperty(target, key, { configurable: true, get: typeof value === "function" ? value : () => value });
    }
    try {
      const { anchor, panel } = mount(createElement(Menu, { name: "a", closed: () => undefined }));
      let rect = { top: 100, bottom: 132, left: 40, right: 140, width: 100, height: 32 };
      anchor("a").getBoundingClientRect = () => rect as DOMRect;
      act(() => anchor("a").click());
      const box = panel("a")!;
      expect(watched).toEqual([box, anchor("a")]);
      expect([box.style.top, box.style.left]).toEqual(["140px", "40px"]);
      expect(box.className).toContain("origin-top-left");

      // The anchor moves (a row above it grew): the observer places the box again.
      rect = { top: 600, bottom: 632, left: 900, right: 1000, width: 100, height: 32 };
      act(() => observed!());
      // No room under it, so over it, flush: 600 - 8 - 150; and shifted left to 1024 - 16 - 200.
      expect([box.style.top, box.style.left]).toEqual(["442px", "808px"]);
      expect(box.dataset.side).toBe("top");
      expect(box.className).toContain("origin-bottom-left");
    } finally {
      for (const [target, key, descriptor] of saved) {
        if (descriptor === undefined) delete (target as Record<string, unknown>)[key];
        else Object.defineProperty(target, key, descriptor);
      }
      globalThis.ResizeObserver = original;
    }
  });
});

describe("Popover's Escape inside the kit Dialog", () => {
  // jsdom's dialog neither opens itself nor turns an Escape into a close
  // request. A browser does both: `showModal()` opens it, and once an Escape
  // keydown has been dispatched, its default action, when nobody cancelled it
  // (stopping it does not count), is a `cancel` event on the open modal
  // dialog, which the kit Dialog answers with `onClose`.
  const escapeAsBrowser = () => {
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => {
      (document.activeElement ?? document.body).dispatchEvent(event);
      if (!event.defaultPrevented) document.querySelector("dialog[open]")?.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    return event;
  };
  beforeAll(() => {
    // Left in place: the dialogs are unmounted, and closed, after this block's hooks.
    const proto = HTMLDialogElement.prototype as unknown as { showModal: () => void; close: () => void };
    proto.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    proto.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
  });

  const options = [
    { value: "a", label: "A" },
    { value: "b", label: "B" },
  ];
  const cases: Array<[string, ReactNode, "listbox" | "menu"]> = [
    ["a Select", createElement(Select<string>, { label: "Motion", options, value: "a", onChange: () => undefined }), "listbox"],
    ["a FilterMenu", createElement(FilterMenu<string>, { label: "Type", options, value: "a", defaultValue: "a", onChange: () => undefined }), "listbox"],
    [
      "a Menu",
      createElement(
        KitMenu,
        { label: "More actions", trigger: "More", triggerClassName: "" } as ComponentProps<typeof KitMenu>,
        createElement(MenuItem, { onSelect: () => undefined } as ComponentProps<typeof MenuItem>, "Copy link"),
      ),
      "menu",
    ],
  ];

  for (const [name, menu, role] of cases) {
    it(`closes ${name} on the first Escape and leaves the dialog open; the next one asks the dialog to close`, () => {
      const onClose = vi.fn();
      mount(createElement(Dialog, { label: "Settings", onClose, children: menu } satisfies DialogProps));
      const dialog = document.querySelector("dialog")!;
      const trigger = dialog.querySelector<HTMLButtonElement>(`button[aria-haspopup="${role}"]`)!;
      act(() => trigger.click());
      const list = dialog.querySelector(`[role="${role}"]`)!;
      expect(list.contains(document.activeElement)).toBe(true);

      expect(escapeAsBrowser().defaultPrevented).toBe(true);
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(trigger);
      expect(onClose).not.toHaveBeenCalled();
      expect(dialog.open).toBe(true);

      escapeAsBrowser();
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  }
});
