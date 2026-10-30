// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { AskBox } = await import("./AskBox");

/** Home's Ask box: the list it opens under the field, and the beat it waits after a blur. */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom lays nothing out; the highlighted row is scrolled into view.
  Element.prototype.scrollIntoView ??= () => undefined;
});

let root: Root | null = null;
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  vi.useRealTimers();
  document.body.replaceChildren();
});

function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(createElement(AskBox)));
  const field = container.querySelector<HTMLInputElement>('[role="combobox"]')!;
  return { container, field };
}

/** Type into a controlled input the way React hears it. */
function type(field: HTMLInputElement, text: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    set.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("AskBox", () => {
  it("keeps the list open when focus leaves the field and comes back within the beat", () => {
    const { field } = mount();
    act(() => field.focus());
    // One character: the tutor option alone, and no search to wait for.
    type(field, "R");
    expect(field.getAttribute("aria-expanded")).toBe("true");

    act(() => field.blur());
    act(() => vi.advanceTimersByTime(60));
    act(() => field.focus());
    act(() => vi.advanceTimersByTime(500));
    expect(field.getAttribute("aria-expanded")).toBe("true");
  });

  it("closes the list a beat after the field loses focus, and leaves no timer behind on unmount", () => {
    const { field } = mount();
    act(() => field.focus());
    type(field, "R");
    act(() => field.blur());
    act(() => vi.advanceTimersByTime(200));
    expect(field.getAttribute("aria-expanded")).toBe("false");

    act(() => field.focus());
    act(() => field.blur());
    act(() => root!.unmount());
    root = null;
    expect(vi.getTimerCount()).toBe(0);
  });
});
