// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { AskableTitle } from "./AskableTitle";
import { askFieldEscape } from "./AskPanel";

/**
 * Ask in the previewer and on an asset's page: a press on Ask puts the cursor
 * in the field, and Escape there closes the fold, keeps what was typed and
 * hands focus back to Ask, spending the key so the previewer's dialog stays
 * open. Escape on Ask itself is left alone, for the dialog to close on.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(createElement(AskableTitle, { heading: createElement("h1", null, "The TLB"), assetId: "note:tlb", subject: "note" })));
  const ask = container.querySelector<HTMLButtonElement>("button[aria-controls]");
  const field = container.querySelector("textarea");
  if (ask === null || field === null) throw new Error("Ask or its field is missing");
  return { ask, field };
}

function type(field: HTMLTextAreaElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  act(() => {
    setter?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function escape(on: HTMLElement): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  act(() => {
    on.dispatchEvent(event);
  });
  return event;
}

describe("Ask's field", () => {
  it("takes focus when Ask is pressed", () => {
    const { ask, field } = mount();
    act(() => ask.click());
    expect(ask.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(field);
  });

  it("closes the fold on Escape, keeps the question and gives focus back to Ask, spending the key", () => {
    const { ask, field } = mount();
    act(() => ask.click());
    type(field, "Why is the TLB a cache?");

    const first = escape(field);
    expect(first.defaultPrevented).toBe(true);
    expect(ask.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(ask);
    expect(field.value).toBe("Why is the TLB a cache?");

    // The second Escape, on Ask, is the dialog's to close on.
    expect(escape(ask).defaultPrevented).toBe(false);

    // Opened again, the question is still there.
    act(() => ask.click());
    expect(field.value).toBe("Why is the TLB a cache?");
    expect(document.activeElement).toBe(field);
  });
});

describe("askFieldEscape", () => {
  it("is Escape in the field, and not the one that ends a composition", () => {
    expect(askFieldEscape("Escape", true, false)).toBe(true);
    expect(askFieldEscape("Escape", false, false)).toBe(false);
    expect(askFieldEscape("Escape", true, true)).toBe(false);
    expect(askFieldEscape("Enter", true, false)).toBe(false);
  });
});
