// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { Combobox } from "./Combobox";

/**
 * The model box's field: focus stays in it, typing filters, the arrows move a
 * highlight it points at, Enter on a row takes it and Enter on none is the
 * form's, Escape closes the list before anything else hears it, an input
 * method's keys are its own, and whatever is typed stays the value.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom lays nothing out, so it has no scrolling to do.
  Element.prototype.scrollIntoView ??= () => undefined;
});

const OPTIONS = [
  { value: "openai/gpt-5", label: "openai/gpt-5" },
  { value: "anthropic/claude-sonnet-4", label: "anthropic/claude-sonnet-4", detail: "free" },
  { value: "sonnet-mini", label: "sonnet-mini" },
];

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

function mount(onSubmit = vi.fn()) {
  const values: string[] = [];
  function Harness() {
    const [value, setValue] = useState("");
    return createElement(
      "form",
      {
        onSubmit: (event: SubmitEvent) => {
          event.preventDefault();
          onSubmit(value);
        },
      },
      createElement(Combobox<string>, {
        id: "model",
        label: "Model",
        options: OPTIONS,
        value,
        onChange: (next: string) => {
          values.push(next);
          setValue(next);
        },
      }),
    );
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  act(() => root.render(createElement(Harness)));
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  const field = container.querySelector<HTMLInputElement>("input")!;
  act(() => field.focus());
  const list = () => container.querySelector<HTMLElement>('[role="listbox"]');
  const rows = () => [...container.querySelectorAll<HTMLElement>('[role="option"]')].map((row) => row.dataset.value);
  /** A key on the field; whether the field's handler cancelled it. */
  const press = (key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
    act(() => void field.dispatchEvent(event));
    return event.defaultPrevented;
  };
  const type = (text: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(field, text);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  return { container, field, list, rows, press, type, values };
}

describe("Combobox", () => {
  it("is a combobox the label names, with its list shut until asked", () => {
    const { field, list } = mount();
    expect(field.getAttribute("role")).toBe("combobox");
    expect(field.getAttribute("aria-autocomplete")).toBe("list");
    expect(field.getAttribute("aria-expanded")).toBe("false");
    expect(field.id).toBe("model");
    expect(list()).toBeNull();
  });

  it("filters on what is typed, and shows the detail on a row", () => {
    const { field, list, rows, type } = mount();
    type("sonnet");
    expect(field.getAttribute("aria-expanded")).toBe("true");
    expect(field.getAttribute("aria-controls")).toBe(list()!.id);
    expect(rows()).toEqual(["sonnet-mini", "anthropic/claude-sonnet-4"]);
    expect(list()!.textContent).toContain("free");
    expect(document.activeElement).toBe(field);
  });

  it("moves a highlight with the arrows and takes the row on Enter, without submitting", () => {
    const submit = vi.fn();
    const { field, list, press, type, values } = mount(submit);
    type("sonnet");
    expect(field.hasAttribute("aria-activedescendant")).toBe(false);
    press("ArrowDown");
    press("ArrowDown");
    const active = document.getElementById(field.getAttribute("aria-activedescendant")!)!;
    expect(active.dataset.value).toBe("anthropic/claude-sonnet-4");
    expect(press("Enter")).toBe(true);
    expect(values.at(-1)).toBe("anthropic/claude-sonnet-4");
    expect(field.value).toBe("anthropic/claude-sonnet-4");
    expect(field.getAttribute("aria-expanded")).toBe("false");
    expect(list() === null || list()!.hasAttribute("inert")).toBe(true);
    expect(submit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(field);
  });

  it("keeps any typed id: Enter with no row highlighted is the form's", () => {
    const { field, press, type } = mount();
    type("my-own/model");
    expect(field.value).toBe("my-own/model");
    // Nothing matches, so there is no list to take the Enter.
    expect(press("Enter")).toBe(false);
  });

  it("closes the list on Escape without letting the press go further, and lets the next one through", () => {
    const { field, press, type } = mount();
    const reached = vi.fn();
    window.addEventListener("keydown", reached);
    type("gpt");
    expect(press("Escape")).toBe(true);
    expect(field.getAttribute("aria-expanded")).toBe("false");
    expect(reached).not.toHaveBeenCalled();
    expect(press("Escape")).toBe(false);
    expect(reached).toHaveBeenCalledTimes(1);
    window.removeEventListener("keydown", reached);
    expect(field.value).toBe("gpt");
  });

  it("leaves an input method's Enter and arrows alone", () => {
    const { field, press, type, values } = mount();
    type("sonnet");
    press("ArrowDown");
    const before = field.getAttribute("aria-activedescendant");
    expect(press("ArrowDown", { isComposing: true })).toBe(false);
    expect(field.getAttribute("aria-activedescendant")).toBe(before);
    expect(press("Enter", { keyCode: 229 })).toBe(false);
    expect(values.at(-1)).toBe("sonnet");
  });

  it("opens every row from the chevron, highlighting none until a key moves it", () => {
    const { container, field, rows } = mount();
    const chevron = container.querySelector<HTMLButtonElement>('button[aria-label="Model suggestions"]')!;
    expect(chevron.tabIndex).toBe(-1);
    act(() => chevron.click());
    expect(rows()).toEqual(OPTIONS.map((o) => o.value));
    expect(field.hasAttribute("aria-activedescendant")).toBe(false);
    expect(document.activeElement).toBe(field);
  });
});

describe("the list's placement", () => {
  it("is measured again whenever the list's own size changes, and stops watching once it closes", () => {
    const watched: Element[] = [];
    let callback: (() => void) | null = null;
    let disconnected = 0;
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(run: () => void) {
        callback = run;
      }
      observe(target: Element) {
        watched.push(target);
      }
      unobserve() {}
      disconnect() {
        disconnected += 1;
      }
    } as unknown as typeof ResizeObserver;
    try {
      const { list, press, type } = mount();
      type("sonnet");
      // A list filtered to the same number of taller rows changes size, not count.
      expect(watched).toEqual([list()]);
      expect(callback).not.toBeNull();
      act(() => callback!());
      press("Escape");
      expect(disconnected).toBe(1);
    } finally {
      globalThis.ResizeObserver = original;
    }
  });
});
