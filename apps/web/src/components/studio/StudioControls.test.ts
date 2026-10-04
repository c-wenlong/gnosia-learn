// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DEFAULT_VIEW, type TopicChip } from "@/lib/studio-view";

/**
 * The strip's menus, each a kit `Popover` of links: the choice in force is
 * ticked and `aria-current`, a plain pick closes the menu with the focus back
 * on its button, a modified click (a new tab) leaves it open, and the topics
 * past five are reachable from "+N".
 */

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown; scroll?: boolean; prefetch?: boolean | null }) => {
    const attributes: Record<string, unknown> = { ...rest };
    delete attributes.scroll;
    delete attributes.prefetch;
    return createElement("a", { href, ...attributes }, children as never);
  },
}));

const { DisplayMenu, SortMenu, StripMenu, TopicChips } = await import("./StudioControls");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

// jsdom does not navigate; a link's default is cancelled after React has seen the click.
const stay = (event: MouseEvent) => event.preventDefault();
const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  document.removeEventListener("click", stay);
  delete document.documentElement.dataset.motion;
});

function mount(element: ReactElement) {
  // Reduced, so a closed menu is gone at once rather than after its fade.
  document.documentElement.dataset.motion = "reduce";
  document.addEventListener("click", stay);
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  act(() => root.render(element));
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  const button = (name: RegExp) => [...container.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")].find((b) => name.test(b.getAttribute("aria-label") ?? b.textContent ?? ""))!;
  const rows = () =>
    [...container.querySelectorAll<HTMLAnchorElement>("[popover] a")].map((a) => `${a.textContent}${a.getAttribute("aria-current") === "true" ? " (current)" : ""}`);
  const row = (text: string) => [...container.querySelectorAll<HTMLAnchorElement>("[popover] a")].find((a) => a.textContent?.startsWith(text))!;
  return { container, button, rows, row };
}

describe("the studio's strip menus", () => {
  it("lists Sort's choices in groups, the ones in force current, and closes on a plain pick with the focus on its button", () => {
    const { button, rows, row } = mount(createElement(SortMenu, { view: DEFAULT_VIEW }));
    const sort = button(/^Sort/);
    expect(sort.getAttribute("aria-expanded")).toBe("false");
    act(() => sort.click());
    expect(sort.getAttribute("aria-expanded")).toBe("true");
    expect(rows()).toEqual(["Last modified (current)", "Created", "Title", "Newest first (current)", "Oldest first"]);
    const groups = [...document.querySelectorAll("[popover] [role=group]")];
    expect(groups.map((group) => document.getElementById(group.getAttribute("aria-labelledby")!)?.textContent)).toEqual(["Sort by", "Order"]);

    act(() => row("Title").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })));
    expect(sort.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector("[popover]")).toBeNull();
    expect(document.activeElement).toBe(sort);
  });

  it("stays open for a modified click, which opens the row in a new tab", () => {
    const { button, row } = mount(createElement(SortMenu, { view: DEFAULT_VIEW }));
    const sort = button(/^Sort/);
    act(() => sort.click());
    act(() => row("Created").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, metaKey: true })));
    expect(sort.getAttribute("aria-expanded")).toBe("true");
  });

  it("ticks Concept chips in Display while the chips show", () => {
    const { button, rows } = mount(createElement(DisplayMenu, { view: { ...DEFAULT_VIEW, chips: true } }));
    act(() => button(/^Display/).click());
    expect(rows()).toContain("Concept chips (current)");
  });

  it("puts the topics past five behind +N, named for a screen reader, with their counts", () => {
    const chips: TopicChip[] = Array.from({ length: 7 }, (_, i) => ({ slug: `t${i}`, label: `Topic ${i}`, domain: null, count: i + 1 }));
    const { button, rows } = mount(createElement(TopicChips, { chips, view: { ...DEFAULT_VIEW, topics: ["t6"] } }));
    const more = button(/more topics/);
    expect(more.textContent).toBe("+2");
    expect(more.getAttribute("aria-label")).toBe("2 more topics");
    act(() => more.click());
    expect(rows()).toEqual(["Topic 56", "Topic 67 (current)"]);
  });

  it("runs a form row's action and closes, with the focus back on its button (the canvas page's More)", async () => {
    const ran: string[] = [];
    const action = async (data: FormData) => {
      ran.push(String(data.get("name")));
    };
    const verb = createElement(
      "form",
      { action },
      createElement("input", { type: "hidden", name: "name", value: "dot-product" }),
      createElement("button", { type: "submit" }, "Verify"),
    );
    const { button } = mount(createElement(StripMenu, { label: "More", name: "More actions" } as Parameters<typeof StripMenu>[0], verb));
    const more = button(/^More actions/);
    act(() => more.click());
    expect(more.getAttribute("aria-expanded")).toBe("true");

    // `requestSubmit`, as a press on the row does: the harness cancels every
    // click's default so a link does not navigate, which would cancel this too.
    const submit = document.querySelector<HTMLButtonElement>("[popover] button[type=submit]")!;
    await act(async () => submit.form!.requestSubmit(submit));
    expect(ran).toEqual(["dot-product"]);
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector("[popover]")).toBeNull();
    expect(document.activeElement).toBe(more);
  });
});

