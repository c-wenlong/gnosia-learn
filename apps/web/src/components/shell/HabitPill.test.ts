// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { HabitPill } from "./HabitPill";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const mounted: Array<() => void> = [];

afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      createElement(
        HabitPill,
        {
          dot: "var(--streak)",
          name: "2 day streak. Studied today. 1 free miss left this week.",
          details: ["Studied today.", "1 free miss left this week."],
        },
        "2",
      ),
    ),
  );
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

const press = (el: Element) => act(() => (el as HTMLElement).click());

describe("HabitPill", () => {
  it("is a button whose name carries the facts, closed at first", () => {
    const host = mount();
    const button = host.querySelector("button") as HTMLButtonElement;
    expect(button.getAttribute("aria-label")).toBe("2 day streak. Studied today. 1 free miss left this week.");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(host.textContent).not.toContain("free miss");
  });

  it("shows the facts when pressed, and hides them when pressed again", () => {
    const host = mount();
    const button = host.querySelector("button") as HTMLButtonElement;
    press(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const panel = host.querySelector(`#${CSS.escape(button.getAttribute("aria-controls") ?? "")}`);
    expect([...(panel?.querySelectorAll("p") ?? [])].map((p) => p.textContent)).toEqual([
      "Studied today.",
      "1 free miss left this week.",
    ]);
    press(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on Escape and gives focus back to the pill", () => {
    const host = mount();
    const button = host.querySelector("button") as HTMLButtonElement;
    act(() => button.focus());
    press(button);
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });

  it("closes when focus moves outside, and then leaves focus where it went", () => {
    const host = mount();
    const outside = document.createElement("button");
    document.body.append(outside);
    mounted.push(() => outside.remove());
    const button = host.querySelector("button") as HTMLButtonElement;
    act(() => button.focus());
    press(button);
    act(() => outside.focus());
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(outside);
  });

  it("does not pull focus back on Escape when focus is elsewhere", () => {
    const host = mount();
    const outside = document.createElement("input");
    document.body.append(outside);
    mounted.push(() => outside.remove());
    const button = host.querySelector("button") as HTMLButtonElement;
    press(button);
    // Opened by a pointer, so focus never entered: it sits on the input.
    act(() => outside.focus());
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(outside);
  });

  it("stays open when focus moves within it", () => {
    const host = mount();
    const button = host.querySelector("button") as HTMLButtonElement;
    act(() => button.focus());
    press(button);
    const panel = host.querySelector(`#${CSS.escape(button.getAttribute("aria-controls") ?? "")}`) as HTMLElement;
    panel.tabIndex = -1;
    act(() => panel.focus());
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("closes on a press outside it", () => {
    const host = mount();
    const button = host.querySelector("button") as HTMLButtonElement;
    press(button);
    act(() => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });
});
