// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { libraryTabs } from "@/lib/library";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { LibraryToolbar, type LibraryMenu } from "./LibraryToolbar";

/**
 * The Library's type row is the kit's `SegmentedControl` in links mode: a
 * group of real links, each keeping the other filters, the chosen one
 * `aria-current`, a plain click taken in-page and a modified click left to the
 * browser.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const mounted: Array<() => void> = [];
beforeEach(() => push.mockClear());
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

const sort: LibraryMenu = {
  label: "Sort",
  param: "sort",
  value: "",
  defaultValue: "",
  options: [
    { value: "", label: "Newest" },
    { value: "title", label: "Title" },
  ],
};

function toolbar(kind: string | null, withOthers: boolean) {
  const counts = [{ kind: "video", count: 2 }, ...(withOthers ? [{ kind: "transcript", count: 1 }] : [])];
  return mount(
    createElement(LibraryToolbar, {
      heading: createElement("h1", null, "Library"),
      filters: { kind, course: "cs3230", q: "graphs" },
      tabs: libraryTabs(counts),
      tab: kind ?? "",
      menus: [],
      sort,
      search: null,
      layout: null,
    }),
  );
}

const typeRow = (c: HTMLElement) => c.querySelector<HTMLElement>('[role="group"][aria-label="Type"]')!;
const links = (c: HTMLElement) => [...typeRow(c).querySelectorAll<HTMLAnchorElement>("a")];
/**
 * Clicks, and says whether the toolbar took the click over (`prevented`)
 * before the browser's default, which here is jsdom's unimplemented navigation
 * and is stopped so the run stays quiet.
 */
const click = (el: Element, init: MouseEventInit = {}) => {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
  let prevented = false;
  const settle = (e: Event) => {
    prevented = e.defaultPrevented;
    e.preventDefault();
  };
  document.addEventListener("click", settle);
  act(() => {
    el.dispatchEvent(event);
  });
  document.removeEventListener("click", settle);
  return { prevented };
};

describe("LibraryToolbar's type row", () => {
  it("is a group of links, every tab in it, Others only with a companion file", () => {
    expect(links(toolbar(null, false)).map((a) => a.textContent)).toEqual([
      "All",
      "Videos",
      "Diagrams",
      "Notes",
      "Sessions",
      "Links",
    ]);
    expect(links(toolbar(null, true)).map((a) => a.textContent)).toContain("Others");
  });

  it("keeps every other filter in each href and marks the chosen tab aria-current", () => {
    const c = toolbar("video", true);
    const row = links(c);
    expect(row.map((a) => a.getAttribute("href"))).toEqual([
      "/library?course=cs3230&q=graphs",
      "/library?kind=video&course=cs3230&q=graphs",
      "/library?kind=diagram_svg&course=cs3230&q=graphs",
      "/library?kind=note&course=cs3230&q=graphs",
      "/library?kind=session&course=cs3230&q=graphs",
      "/library?kind=link&course=cs3230&q=graphs",
      "/library?kind=other&course=cs3230&q=graphs",
    ]);
    expect(row.filter((a) => a.getAttribute("aria-current") === "page").map((a) => a.textContent)).toEqual(["Videos"]);
    expect(typeRow(c).querySelector("[data-segment-thumb]")).not.toBeNull();
  });

  it("takes a plain click in-page and pushes the href without scrolling", () => {
    const c = toolbar("video", false);
    const notes = links(c).find((a) => a.textContent === "Notes")!;
    const event = click(notes);
    expect(event.prevented).toBe(true);
    expect(push).toHaveBeenCalledWith("/library?kind=note&course=cs3230&q=graphs", { scroll: false });
  });

  it("leaves the current tab alone, and a modified click to the browser", () => {
    const c = toolbar("video", false);
    const videos = links(c).find((a) => a.textContent === "Videos")!;
    click(videos);
    expect(push).not.toHaveBeenCalled();

    const notes = links(c).find((a) => a.textContent === "Notes")!;
    const event = click(notes, { metaKey: true });
    expect(event.prevented).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("clears the kind from the URL on All", () => {
    const c = toolbar("note", false);
    click(links(c).find((a) => a.textContent === "All")!);
    expect(push).toHaveBeenCalledWith("/library?course=cs3230&q=graphs", { scroll: false });
  });

  it("stays the kit's control: no hand-built strip of links comes back", () => {
    const c = toolbar("note", true);
    // The kit's SegmentedControl in links mode: a group with its sliding
    // thumb, each tab a link, the current one marked for assistive tech.
    expect(c.querySelector("nav")).toBeNull();
    const thumb = c.querySelector("[data-segment-thumb]");
    expect(thumb).not.toBeNull();
    const group = thumb!.closest('[role="group"]')!;
    expect([...group.querySelectorAll("a")].map((a) => a.textContent)).toEqual(links(c).map((a) => a.textContent));
    expect(group.querySelector('a[aria-current="page"]')?.textContent).toContain("Notes");
    // The old strip drew its own bold-copy width trick.
    expect(c.querySelector(".invisible.col-start-1")).toBeNull();
  });
});
