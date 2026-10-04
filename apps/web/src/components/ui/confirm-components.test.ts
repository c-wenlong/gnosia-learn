// @vitest-environment jsdom
import { act, createElement, Fragment, useRef, useState, type ReactElement, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { Collapse } from "./Collapse";
import { ConfirmFold } from "./ConfirmFold";
import { InlineConfirm } from "./InlineConfirm";

/**
 * The confirms' focus rules, which are what makes them safe to put in front
 * of something destructive: focus goes to the press that loses nothing when
 * the opener leaves, comes back to the opener only from inside the confirm,
 * and is never pulled from where the person moved it.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
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
  return container;
}

const buttons = (root: ParentNode) => [...root.querySelectorAll("button")];
const button = (root: ParentNode, text: string) => {
  const found = buttons(root).find((b) => b.textContent === text);
  if (found === undefined) throw new Error(`no button "${text}"`);
  return found;
};
const press = (target: HTMLElement) =>
  act(() => {
    target.focus();
    target.click();
  });
const key = (target: HTMLElement, name: string) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
  });

/* -------------------------------------------------------------------------- */

interface FoldHarness {
  /** The toggle folds away while the confirm is open (a row that gives way to it). */
  togglesAway?: boolean;
  onConfirm?: (controls: { close: () => void; setBusy: (busy: boolean) => void }) => void;
  /** Which ref the fold returns focus to, read on every render. */
  returnTo?: (refs: { toggle: RefObject<HTMLButtonElement | null>; other: RefObject<HTMLButtonElement | null> }, open: boolean) => RefObject<HTMLButtonElement | null>;
}

function Fold({ togglesAway = false, onConfirm, returnTo }: FoldHarness) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const other = useRef<HTMLButtonElement>(null);
  const toggleButton = createElement(
    "button",
    { ref: toggle, type: "button", "aria-controls": "fold", onClick: () => setOpen((was) => !was) },
    "Reset",
  );
  return createElement(
    Fragment,
    null,
    togglesAway ? createElement(Collapse, { open: !open }, toggleButton) : toggleButton,
    createElement("button", { ref: other, type: "button" }, "Elsewhere"),
    createElement(ConfirmFold, {
      open,
      id: "fold",
      label: "Confirm reset",
      message: "Clear everything? This cannot be undone.",
      confirmLabel: "Reset all",
      busy,
      onConfirm: () => (onConfirm ?? (({ close }) => close()))({ close: () => setOpen(false), setBusy }),
      onCancel: () => setOpen(false),
      returnFocusTo: returnTo ? returnTo({ toggle, other }, open) : toggle,
    }),
  );
}

describe("ConfirmFold", () => {
  it("folds open under a toggle that stays, leaving focus on it, and Cancel gives focus back", () => {
    const root = mount(createElement(Fold));
    const fold = document.getElementById("fold")!;
    expect(fold.hasAttribute("inert")).toBe(true);
    expect(fold.querySelector('[role="group"]')?.getAttribute("aria-label")).toBe("Confirm reset");

    press(button(root, "Reset"));
    expect(fold.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(button(root, "Reset"));

    press(button(fold, "Cancel"));
    expect(fold.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(button(root, "Reset"));
  });

  it("puts focus on Cancel when the toggle folded away as it opened", () => {
    const root = mount(createElement(Fold, { togglesAway: true }));
    press(button(root, "Reset"));
    expect(document.activeElement).toBe(button(document.getElementById("fold")!, "Cancel"));
  });

  it("gives focus back after a confirm only from inside the fold, never from where the person moved it", () => {
    let close = () => undefined as void;
    const root = mount(createElement(Fold, { onConfirm: (controls) => (close = controls.close) }));
    press(button(root, "Reset"));
    press(button(document.getElementById("fold")!, "Reset all"));
    // The work runs on; meanwhile the person goes elsewhere.
    act(() => button(root, "Elsewhere").focus());
    act(() => close());
    expect(document.getElementById("fold")!.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(button(root, "Elsewhere"));
  });

  it("disables both presses while busy, and a failure gives the dropped focus back to the press", () => {
    let controls = { close: () => undefined as void, setBusy: (_: boolean) => undefined as void };
    const root = mount(createElement(Fold, { onConfirm: (given) => ((controls = given), given.setBusy(true)) }));
    press(button(root, "Reset"));
    const fold = document.getElementById("fold")!;
    press(button(fold, "Reset all"));
    expect(button(fold, "Reset all").disabled).toBe(true);
    expect(button(fold, "Cancel").disabled).toBe(true);
    // A browser drops focus from a button that goes disabled.
    act(() => (document.activeElement as HTMLElement).blur());

    act(() => controls.setBusy(false));
    expect(fold.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(button(fold, "Reset all"));
  });

  it("closes on Escape from inside, unless busy", () => {
    let controls = { close: () => undefined as void, setBusy: (_: boolean) => undefined as void };
    const root = mount(createElement(Fold, { onConfirm: (given) => (controls = given) }));
    press(button(root, "Reset"));
    const fold = document.getElementById("fold")!;
    press(button(fold, "Reset all"));
    act(() => controls.setBusy(true));
    key(button(fold, "Cancel"), "Escape");
    expect(fold.hasAttribute("inert")).toBe(false);

    act(() => controls.setBusy(false));
    key(button(fold, "Cancel"), "Escape");
    expect(fold.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(button(root, "Reset"));
  });

  it("returns focus to the target named on the render that closes", () => {
    const root = mount(createElement(Fold, { returnTo: ({ toggle, other }, open) => (open ? other : toggle) }));
    press(button(root, "Reset"));
    // Open, it names Elsewhere; the closing render names Reset, and Reset wins.
    press(button(document.getElementById("fold")!, "Cancel"));
    expect(document.activeElement).toBe(button(root, "Reset"));
  });
});

/* -------------------------------------------------------------------------- */

describe("InlineConfirm", () => {
  it("swaps the press for its question, focus on Keep it, and Keep it swaps back onto the press", () => {
    const onConfirm = vi.fn();
    const root = mount(
      createElement(InlineConfirm, {
        label: "Discard",
        question: "The renders are deleted; the source is kept.",
        confirmLabel: "Discard it",
        onConfirm,
      }),
    );
    press(button(root, "Discard"));
    expect(buttons(root).map((b) => b.textContent)).toEqual(["Discard it", "Keep it"]);
    const group = root.querySelector('[role="group"]')!;
    expect(document.getElementById(group.getAttribute("aria-labelledby")!)?.textContent).toBe(
      "The renders are deleted; the source is kept.",
    );
    expect(group.className).toContain("animate-fade-in");
    expect(document.activeElement).toBe(button(root, "Keep it"));

    press(button(root, "Keep it"));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button(root, "Discard"));
  });

  it("acts on the confirming press, and puts the press back with focus on it", () => {
    const onConfirm = vi.fn();
    const root = mount(createElement(InlineConfirm, { label: "Forget", question: "Delete it?", confirmLabel: "Forget it", onConfirm, size: "text" }));
    press(button(root, "Forget"));
    expect(button(root, "Forget it").className).toContain("text-danger");
    press(button(root, "Forget it"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(button(root, "Forget"));
  });

  it("answers Escape with Keep it", () => {
    const root = mount(createElement(InlineConfirm, { label: "Discard", question: "Sure?", confirmLabel: "Discard it", onConfirm: () => undefined }));
    press(button(root, "Discard"));
    key(button(root, "Keep it"), "Escape");
    expect(document.activeElement).toBe(button(root, "Discard"));
  });

  function Controlled({ busy = false }: { busy?: boolean }) {
    const [open, setOpen] = useState(false);
    return createElement(
      Fragment,
      null,
      createElement("button", { type: "button", onClick: () => setOpen(true) }, "Start over elsewhere"),
      createElement(InlineConfirm, {
        label: "Start over",
        question: "Close this conversation for good?",
        confirmLabel: "Start over now",
        busyLabel: "Starting",
        busy,
        open,
        onOpenChange: setOpen,
        onConfirm: () => undefined,
        size: "text",
      }),
    );
  }

  it("leaves focus where it is when opened from elsewhere", () => {
    const root = mount(createElement(Controlled));
    press(button(root, "Start over elsewhere"));
    expect(button(root, "Start over now")).toBeTruthy();
    expect(document.activeElement).toBe(button(root, "Start over elsewhere"));
  });

  it("keeps the question up while busy, its press disabled and saying so, and the trigger disabled once put away", () => {
    function Busy() {
      const [busy, setBusy] = useState(false);
      return createElement(
        Fragment,
        null,
        createElement("button", { type: "button", onClick: () => setBusy(true) }, "Begin"),
        createElement(Controlled, { busy }),
      );
    }
    const root = mount(createElement(Busy));
    press(button(root, "Start over elsewhere"));
    press(button(root, "Begin"));
    expect(button(root, "Starting").disabled).toBe(true);
    press(button(root, "Keep it"));
    expect(button(root, "Start over").disabled).toBe(true);
  });
});
