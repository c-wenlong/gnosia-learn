// @vitest-environment jsdom
import { act, createElement, type FunctionComponent, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { Menu, MenuDivider, MenuGroup, MenuItem } from "./Menu";

/**
 * The kit `Menu` as a keyboard user meets it: it opens on the button with
 * focus on an item, the arrows move and wrap, Escape and a choice put focus
 * back on the button, Tab and a press outside close it, a list of choices
 * opens on the checked one, and its clicks and keys stay inside it.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

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

const key = (target: Element, k: string) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  });

function setup(onSelect = vi.fn(), outer = vi.fn()) {
  const host = mount(
    createElement(
      "div",
      { onClick: outer, onKeyDown: outer },
      el(
        Menu,
        { label: "More actions", trigger: "…", triggerClassName: "t" },
        el(MenuItem, { icon: "next", href: "/library/a" }, "Open"),
        el(MenuDivider, null),
        el(MenuItem, { onSelect }, "Copy link"),
        el(MenuItem, { onSelect: () => "keep" as const }, "Download"),
      ),
    ),
  );
  const button = host.querySelector("button[aria-haspopup]") as HTMLButtonElement;
  return { host, button, onSelect, outer };
}

/** The components with their children as arguments, which their prop types name as required. */
const el = (type: unknown, props: Record<string, unknown> | null, ...children: ReactNode[]) =>
  createElement(type as FunctionComponent<Record<string, unknown>>, props, ...children);

const items = (host: Element) => [...host.querySelectorAll<HTMLElement>('[role^="menuitem"]')];
const label = (el: Element | null) => el?.textContent?.trim();

describe("Menu", () => {
  it("is a closed menu button until pressed, then a menu focused on its first item", () => {
    const { host, button } = setup();
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-label")).toBe("More actions");
    expect(host.querySelector('[role="menu"]')).toBeNull();

    act(() => button.click());
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const menu = host.querySelector('[role="menu"]');
    expect(menu?.getAttribute("id")).toBe(button.getAttribute("aria-controls"));
    expect(items(host).map(label)).toEqual(["Open", "Copy link", "Download"]);
    expect(items(host).every((item) => item.tabIndex === -1)).toBe(true);
    expect(host.querySelector('[role="separator"]')).not.toBeNull();
    expect(label(document.activeElement)).toBe("Open");
  });

  it("moves with the arrows and wraps, jumps with Home and End, and finds an item by its letter", () => {
    const { host, button } = setup();
    act(() => button.click());
    const menu = host.querySelector('[role="menu"]') as HTMLElement;
    key(menu, "ArrowDown");
    expect(label(document.activeElement)).toBe("Copy link");
    key(menu, "ArrowDown");
    key(menu, "ArrowDown");
    expect(label(document.activeElement)).toBe("Open");
    key(menu, "ArrowUp");
    expect(label(document.activeElement)).toBe("Download");
    key(menu, "Home");
    expect(label(document.activeElement)).toBe("Open");
    key(menu, "End");
    expect(label(document.activeElement)).toBe("Download");
    key(menu, "c");
    expect(label(document.activeElement)).toBe("Copy link");
  });

  it("opens on the last item with Up on the button", () => {
    const { button } = setup();
    act(() => button.focus());
    key(button, "ArrowUp");
    expect(label(document.activeElement)).toBe("Download");
  });

  it("closes on Escape with focus back on the button", () => {
    const { host, button } = setup();
    act(() => button.click());
    key(host.querySelector('[role="menu"]') as HTMLElement, "Escape");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });

  it("runs a choice, closes and refocuses the button, unless the choice keeps it open", () => {
    const { host, button, onSelect } = setup();
    act(() => button.click());
    act(() => items(host)[1]?.click());
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);

    act(() => button.click());
    act(() => items(host)[2]?.click());
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("chooses a link with Space as well as Enter", () => {
    const { host, button } = setup();
    act(() => button.click());
    const link = items(host)[0] as HTMLAnchorElement;
    const clicked = vi.fn((event: Event) => event.preventDefault());
    link.addEventListener("click", clicked);
    key(link, " ");
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("closes on Tab and on a press outside, without taking focus back", () => {
    const { host, button } = setup();
    act(() => button.click());
    key(host.querySelector('[role="menu"]') as HTMLElement, "Tab");
    expect(button.getAttribute("aria-expanded")).toBe("false");

    act(() => button.click());
    act(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps its clicks and keys from the row around it", () => {
    const { host, button, outer } = setup();
    act(() => button.click());
    key(host.querySelector('[role="menu"]') as HTMLElement, "ArrowDown");
    act(() => items(host)[1]?.click());
    expect(outer).not.toHaveBeenCalled();
  });

  it("opens a list of choices on the checked one, ticked, under its heading", () => {
    const host = mount(
      el(
        Menu,
        { label: "View options", trigger: "≡", triggerClassName: "t" },
        el(MenuGroup, { label: "Group by" }, el(MenuItem, { checked: false }, "Day"), el(MenuItem, { checked: true }, "Course")),
      ),
    );
    act(() => (host.querySelector("button[aria-haspopup]") as HTMLButtonElement).click());
    const group = host.querySelector('[role="group"]');
    expect(document.getElementById(group?.getAttribute("aria-labelledby") ?? "")?.textContent).toBe("Group by");
    expect(items(host).map((item) => [item.getAttribute("role"), item.getAttribute("aria-checked")])).toEqual([
      ["menuitemradio", "false"],
      ["menuitemradio", "true"],
    ]);
    expect(label(document.activeElement)).toBe("Course");
  });
});
