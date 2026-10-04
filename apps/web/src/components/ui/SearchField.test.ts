// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { SearchField } from "./SearchField";

/**
 * The kit's clear button: it empties the field and leaves the focus in it,
 * and a press on it never takes the focus away first, so a field that acts on
 * blur (Home's Ask box closes its list) is not closed under the next words
 * (Greptile on #368).
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

function mount() {
  let blurs = 0;
  function Harness() {
    const [value, setValue] = useState("tcp");
    return createElement(SearchField, {
      label: "Search",
      value,
      onChange: (event) => setValue(event.target.value),
      onClear: () => setValue(""),
      onBlur: () => {
        blurs += 1;
      },
    });
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  act(() => root.render(createElement(Harness)));
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return { container, blurs: () => blurs };
}

describe("SearchField's clear button", () => {
  it("keeps the focus in the field through the press, and empties it", () => {
    const { container, blurs } = mount();
    const field = container.querySelector("input")!;
    act(() => field.focus());
    const clear = container.querySelector<HTMLButtonElement>('button[aria-label="Clear the search"]')!;
    const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    act(() => void clear.dispatchEvent(press));
    expect(press.defaultPrevented).toBe(true);
    act(() => clear.click());
    expect(field.value).toBe("");
    expect(document.activeElement).toBe(field);
    expect(blurs()).toBe(0);
    // Gone with the last word.
    expect(container.querySelector('button[aria-label="Clear the search"]')).toBeNull();
  });
});
