// @vitest-environment jsdom
import { act, createElement, createRef, Fragment, useState, type ComponentProps, type ReactElement } from "react";
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
  /** While open, name Elsewhere as where focus returns; the closing render names the toggle. */
  elsewhereWhileOpen?: boolean;
}

function Fold({ togglesAway = false, onConfirm, elsewhereWhileOpen = false }: FoldHarness) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Held refs made once, which the hooks lint does not take for reads during render.
  const [toggle] = useState(() => createRef<HTMLButtonElement>());
  const [other] = useState(() => createRef<HTMLButtonElement>());
  const toggleButton = createElement(
    "button",
    { ref: toggle, type: "button", "aria-controls": "fold", onClick: () => setOpen((was) => !was) },
    "Reset",
  );
  return createElement(
    Fragment,
    null,
    togglesAway ? createElement(Collapse, { open: !open } as ComponentProps<typeof Collapse>, toggleButton) : toggleButton,
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
      returnFocusTo: elsewhereWhileOpen && open ? other : toggle,
    }),
  );
}

describe("ConfirmFold", () => {
  it("folds open under its toggle with focus on Cancel, and Cancel gives focus back", () => {
    const root = mount(createElement(Fold));
    const fold = document.getElementById("fold")!;
    expect(fold.hasAttribute("inert")).toBe(true);
    expect(fold.querySelector('[role="group"]')?.getAttribute("aria-label")).toBe("Confirm reset");

    press(button(root, "Reset"));
    expect(fold.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(button(fold, "Cancel"));

    press(button(fold, "Cancel"));
    expect(fold.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(button(root, "Reset"));
  });

  it("leaves focus where the person put it when the fold opens from elsewhere", () => {
    function Remote() {
      const [open, setOpen] = useState(false);
      const [toggle] = useState(() => createRef<HTMLButtonElement>());
      return createElement(
        Fragment,
        null,
        createElement("button", { ref: toggle, type: "button" }, "Reset"),
        createElement("button", { type: "button", onClick: () => setOpen(true) }, "Open from here"),
        createElement(ConfirmFold, {
          open,
          id: "remote",
          label: "Confirm",
          message: "Sure?",
          confirmLabel: "Yes",
          onConfirm: () => undefined,
          onCancel: () => setOpen(false),
          returnFocusTo: toggle,
        }),
      );
    }
    const root = mount(createElement(Remote));
    press(button(root, "Open from here"));
    expect(document.getElementById("remote")!.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(button(root, "Open from here"));
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
    let controls: { close: () => void; setBusy: (busy: boolean) => void } = { close: () => undefined, setBusy: () => undefined };
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
    let controls: { close: () => void; setBusy: (busy: boolean) => void } = { close: () => undefined, setBusy: () => undefined };
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
    const root = mount(createElement(Fold, { elsewhereWhileOpen: true }));
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

  it("uncontrolled, keeps the question up while the confirmed work runs, then gives focus back to the press", () => {
    function Work() {
      const [busy, setBusy] = useState(false);
      return createElement(
        Fragment,
        null,
        createElement(InlineConfirm, {
          label: "Discard",
          question: "Sure?",
          confirmLabel: "Discard it",
          busyLabel: "Discarding",
          busy,
          onConfirm: () => setBusy(true),
        }),
        createElement("button", { type: "button", tabIndex: -1, onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(), onClick: () => setBusy(false) }, "Finish"),
      );
    }
    const root = mount(createElement(Work));
    press(button(root, "Discard"));
    press(button(root, "Discard it"));
    // The trigger would be disabled now, and could not hold focus; nor can
    // the confirming press, so Keep it holds it while the work runs.
    expect(button(root, "Discarding").disabled).toBe(true);
    expect(document.activeElement).toBe(button(root, "Keep it"));
    // The work ends without anyone pressing anything in the row.
    act(() => button(root, "Finish").click());
    expect(button(root, "Discard").disabled).toBe(false);
    expect(document.activeElement).toBe(button(root, "Discard"));
  });

  it("uncontrolled, Keep it pressed while the work runs gives focus to the trigger once the work ends", () => {
    function Work() {
      const [busy, setBusy] = useState(false);
      return createElement(
        Fragment,
        null,
        createElement(InlineConfirm, {
          label: "Discard",
          question: "Sure?",
          confirmLabel: "Discard it",
          busyLabel: "Discarding",
          busy,
          onConfirm: () => setBusy(true),
        }),
        createElement("button", { type: "button", tabIndex: -1, onClick: () => setBusy(false) }, "Finish"),
      );
    }
    const root = mount(createElement(Work));
    press(button(root, "Discard"));
    press(button(root, "Discard it"));
    press(button(root, "Keep it"));
    // The trigger is back but disabled: focus has nowhere to go yet.
    expect(button(root, "Discard").disabled).toBe(true);
    act(() => button(root, "Finish").click());
    expect(button(root, "Discard").disabled).toBe(false);
    expect(document.activeElement).toBe(button(root, "Discard"));
  });
});
