// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ASK_START_KEY, askTutorHref, type AskEntry } from "@/lib/ask-core";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { AskBox } = await import("./AskBox");

/**
 * Home's Ask box: an ARIA combobox over the matches `/api/learner/ask` finds
 * and a tutor option for the text as typed. The list closes at once when focus
 * leaves (the kit Popover's focusout), and its first Escape closes it and
 * keeps the text.
 */

const entry = (key: string, title: string): AskEntry => ({ key, href: `/learn/${key}`, kind: "concept", title, detail: null });
const MATCHES = [entry("recurrences", "Recurrences"), entry("recursion", "Recursion")];

const fetchMock = vi.fn();

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom lays nothing out; the highlighted row is scrolled into view.
  Element.prototype.scrollIntoView ??= () => undefined;
  // The kit Popover is a `popover` element, which jsdom does not implement.
  const proto = HTMLElement.prototype as unknown as { showPopover?: () => void; hidePopover?: () => void };
  proto.showPopover ??= () => undefined;
  proto.hidePopover ??= () => undefined;
});

let root: Root | null = null;
beforeEach(() => {
  vi.useFakeTimers();
  push.mockReset();
  window.sessionStorage.clear();
  fetchMock.mockReset().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ results: MATCHES }), { status: 200 })));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  vi.unstubAllGlobals();
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

/** Let the debounce fire and the answer land. */
const answered = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });

const key = (target: HTMLElement, name: string) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
  });

describe("AskBox", () => {
  it("lists the matches and the tutor, and moves the highlight with the arrow keys", async () => {
    const { container, field } = mount();
    act(() => field.focus());
    type(field, "rec");
    await answered();
    const options = [...container.ownerDocument.querySelectorAll<HTMLElement>('[role="option"]')];
    expect(options.map((o) => o.textContent)).toEqual(["Recurrences", "Recursion", "Ask the tutor about “rec”"]);
    expect(field.getAttribute("aria-activedescendant")).toBe(options[0]!.id);

    key(field, "ArrowDown");
    expect(field.getAttribute("aria-activedescendant")).toBe(options[1]!.id);
    key(field, "ArrowUp");
    key(field, "ArrowUp");
    // Up from the first wraps to the tutor at the end.
    expect(field.getAttribute("aria-activedescendant")).toBe(options[2]!.id);
  });

  it("opens the highlighted match on Enter", async () => {
    const { field } = mount();
    act(() => field.focus());
    type(field, "rec");
    await answered();
    key(field, "Enter");
    expect(push).toHaveBeenCalledWith("/learn/recurrences");
    expect(window.sessionStorage.getItem(ASK_START_KEY)).toBeNull();
  });

  it("opens the tutor, not the last text's match, on an Enter while the next answer is on its way", async () => {
    const { field } = mount();
    act(() => field.focus());
    type(field, "rec");
    await answered();
    type(field, "recu");
    // No time passes: the matches are for "rec", and the tutor is all there is for "recu".
    key(field, "Enter");
    expect(push).toHaveBeenCalledWith(askTutorHref("recu"));
    expect(window.sessionStorage.getItem(ASK_START_KEY)).toBe("recu");
  });

  it("closes the list on the first Escape and keeps the text, and clears it on the second", async () => {
    const { container, field } = mount();
    act(() => field.focus());
    type(field, "rec");
    await answered();
    expect(field.getAttribute("aria-expanded")).toBe("true");

    key(field, "Escape");
    expect(field.getAttribute("aria-expanded")).toBe("false");
    expect(field.value).toBe("rec");

    key(field, "Escape");
    expect(field.value).toBe("");
    expect(container.querySelector('[role="combobox"]')).toBe(field);
  });

  it("closes the list at once when focus leaves, and opens it again when focus comes back", async () => {
    const { field } = mount();
    act(() => field.focus());
    type(field, "rec");
    await answered();
    expect(field.getAttribute("aria-expanded")).toBe("true");

    act(() => field.blur());
    expect(field.getAttribute("aria-expanded")).toBe("false");
    act(() => field.focus());
    expect(field.getAttribute("aria-expanded")).toBe("true");
  });
});
