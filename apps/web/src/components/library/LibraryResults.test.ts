// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryPage } from "@/lib/library-pages";

/**
 * The Library's paged list (L9 of docs/proposals/library-by-type-and-day.md):
 * the sentinel a screen ahead, one request at a time, the placeholders in the
 * layout's shape while a page loads, Show older for a keyboard, a quiet retry
 * line, the previewer's loader, and back and forward restoring the pages.
 * The server function is a stand-in, and so is `IntersectionObserver`.
 */

const libraryPage = vi.hoisted(() => vi.fn());
vi.mock("@/app/(app)/library/page-action", () => ({ libraryPage }));

const { LibraryResults } = await import("./LibraryResults");
const { LibraryMoreContext } = await import("./library-more");

type Page = LibraryPage<ReactNode>;

/** The observers the list made, so a test can say the sentinel came into range. */
const observers: Array<{ callback: IntersectionObserverCallback; options?: IntersectionObserverInit }> = [];
/** Where the sentinel is from the top of the viewport; far by default, so nothing loads until a test says. */
let sentinelTop = 10_000;

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  class FakeObserver {
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      observers.push({ callback, options });
    }
    observe() {}
    disconnect() {}
  }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeObserver;
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (this.hasAttribute("data-library-sentinel")) return { top: sentinelTop } as DOMRect;
    return original.call(this);
  };
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

function rowNodes(prefix: string, n: number, from = 0): ReactNode[] {
  return Array.from({ length: n }, (_, i) =>
    createElement("li", { key: `${prefix}${from + i}` }, createElement("a", { href: `/library/${prefix}${from + i}` }, `${prefix} ${from + i}`)),
  );
}

function page(pieces: Array<[string, number, number]>, next: string | null, remaining: number, prefix = "r", from = 0): Page {
  let at = from;
  return {
    state: "ok",
    ...(from === 0 ? { order: [...new Set(pieces.map(([key]) => key))] } : {}),
    pieces: pieces.map(([key, count, n]) => {
      const rows = rowNodes(prefix, n, at);
      at += n;
      return { group: { key, label: key, count }, section: null, rows };
    }),
    next,
    remaining,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  libraryPage.mockReset();
  observers.length = 0;
  sentinelTop = 10_000;
  window.sessionStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function mount(props: Partial<Parameters<typeof LibraryResults>[0]> = {}, more: { current: unknown } | null = null) {
  const element = createElement(LibraryResults, {
    href: "/library?view=list",
    view: "list",
    label: "Assets",
    first: page([["4 Oct", 3, 2]], "c1", 3),
    more: "Show older",
    ...props,
  });
  await act(async () => {
    root.render(more === null ? element : createElement(LibraryMoreContext, { value: more as never }, element));
  });
}

/** The sentinel comes within a screen of the viewport. */
async function scrollNear() {
  sentinelTop = 100;
  await act(async () => {
    for (const { callback } of observers) callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
  });
}

const headings = () => [...container.querySelectorAll("h2")].map((h) => h.textContent);
const links = () => [...container.querySelectorAll("a[href]")].map((a) => a.textContent);
const button = (name: string) => [...container.querySelectorAll("button")].find((b) => b.textContent === name);

describe("LibraryResults", () => {
  it("names each group by its own heading, even for keys that differ only in punctuation", async () => {
    await mount({ first: page([["topic:a.b", 1, 1], ["topic:a-b", 1, 1]], null, 0) });
    const sections = [...container.querySelectorAll("section[aria-labelledby]")];
    expect(sections).toHaveLength(2);
    const ids = sections.map((s) => s.getAttribute("aria-labelledby"));
    expect(new Set(ids).size).toBe(2);
    for (const [i, section] of sections.entries()) {
      expect(container.querySelectorAll(`[id="${ids[i]}"]`)).toHaveLength(1);
      expect(section.querySelector("h2")?.id).toBe(ids[i]);
    }
  });

  it("draws the first page under its headings with their whole counts, and watches a screen ahead", async () => {
    await mount();
    expect(headings()).toEqual(["4 Oct(3)"]);
    expect(links()).toEqual(["r 0", "r 1"]);
    expect(button("Show older")).toBeDefined();
    expect(observers[0].options?.rootMargin).toBe("0px 0px 100% 0px");
    expect(libraryPage).not.toHaveBeenCalled();
  });

  it("loads the next page when the sentinel comes near, once, with placeholders until it lands", async () => {
    let answer: (page: Page) => void = () => undefined;
    libraryPage.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    await mount();
    await scrollNear();
    await scrollNear();
    expect(libraryPage).toHaveBeenCalledTimes(1);
    // With the first page's group order, which later pages keep.
    expect(libraryPage).toHaveBeenCalledWith("/library?view=list", "c1", ["4 Oct"]);
    expect(container.querySelector("section")?.getAttribute("aria-busy")).toBe("true");
    // Three rows are left, so three row placeholders, inside the group they continue.
    expect(container.querySelectorAll('[data-skeleton="row"]')).toHaveLength(3);
    expect(container.querySelector("h2 + ul")?.querySelectorAll('[data-skeleton="row"]')).toHaveLength(3);
    sentinelTop = 10_000;
    await act(async () => answer(page([["4 Oct", 3, 1], ["3 Oct", 2, 2]], null, 0, "r", 2)));
    expect(container.querySelectorAll("[data-skeleton]")).toHaveLength(0);
    // The day it went on with keeps one heading.
    expect(headings()).toEqual(["4 Oct(3)", "3 Oct(2)"]);
    expect(links()).toEqual(["r 0", "r 1", "r 2", "r 3", "r 4"]);
    expect(button("Show older")).toBeUndefined();
  });

  it("goes on to the next page while the reader is still within a screen of the end", async () => {
    libraryPage
      .mockResolvedValueOnce(page([["4 Oct", 9, 3]], "c2", 4, "r", 2))
      .mockResolvedValueOnce(page([["4 Oct", 9, 4]], null, 0, "r", 5));
    await mount({ first: page([["4 Oct", 9, 2]], "c1", 7) });
    await scrollNear();
    await act(async () => undefined);
    expect(libraryPage.mock.calls.map((c) => c[1])).toEqual(["c1", "c2"]);
    expect(links()).toHaveLength(9);
  });

  it("shows card placeholders in the grid, a screen's worth at most", async () => {
    libraryPage.mockImplementation(() => new Promise(() => undefined));
    await mount({ view: "grid", first: page([["4 Oct", 80, 50]], "c1", 30) });
    await scrollNear();
    expect(container.querySelectorAll('[data-skeleton="card"]')).toHaveLength(6);
  });

  it("loads with Show older, and moves focus to the first row it brought", async () => {
    libraryPage.mockResolvedValueOnce(page([["4 Oct", 3, 1]], null, 0, "r", 2));
    await mount();
    await act(async () => button("Show older")?.click());
    expect(libraryPage).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.textContent).toBe("r 2");
  });

  it("says Show more where the rows do not run newest first", async () => {
    await mount({ more: "Show more" });
    expect(button("Show more")).toBeDefined();
  });

  it("says quietly when a page did not load, and tries again", async () => {
    libraryPage.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(page([["4 Oct", 3, 1]], null, 0, "r", 2));
    await mount();
    await act(async () => button("Show older")?.click());
    expect(container.textContent).toContain("The next rows did not load.");
    expect(container.querySelectorAll("[data-skeleton]")).toHaveLength(0);
    await act(async () => button("Try again")?.click());
    expect(libraryPage).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toContain("did not load");
    expect(links()).toHaveLength(3);
  });

  it("treats an unreachable catalog as a failed load", async () => {
    libraryPage.mockResolvedValueOnce({ state: "unreachable" });
    await mount();
    await act(async () => button("Show older")?.click());
    expect(container.textContent).toContain("The next rows did not load.");
  });

  it("says the Library changed when the cursor's place is gone", async () => {
    libraryPage.mockResolvedValueOnce({ state: "stale" });
    await mount();
    await act(async () => button("Show older")?.click());
    expect(container.textContent).toContain("The library changed since this page was drawn.");
    expect(button("Reload")).toBeDefined();
    expect(button("Show older")).toBeUndefined();
  });

  it("hands the previewer a loader that resolves once the rows are drawn", async () => {
    libraryPage.mockResolvedValueOnce(page([["4 Oct", 3, 1]], null, 0, "r", 2));
    const more: { current: null | (() => Promise<boolean>) } = { current: null };
    await mount({}, more);
    expect(more.current).not.toBeNull();
    // Asked inside act, awaited outside it: the answer waits for the commit act flushes.
    let asked: Promise<boolean> | undefined;
    await act(async () => {
      asked = more.current?.();
    });
    expect(await asked).toBe(true);
    expect(links()).toContain("r 2");
    // Nothing left: nothing added.
    await act(async () => {
      asked = more.current?.();
    });
    expect(await asked).toBe(false);
  });

  it("draws the pages it held again on back, then scrolls to where the reader was", async () => {
    window.sessionStorage.setItem("library-pages:/library?view=list", JSON.stringify({ pages: 3, y: 2400 }));
    libraryPage
      .mockResolvedValueOnce(page([["4 Oct", 9, 3]], "c2", 4, "r", 2))
      .mockResolvedValueOnce(page([["4 Oct", 9, 2]], "c3", 2, "r", 5));
    window.history.replaceState(null, "", "/library?view=list");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await mount({ first: page([["4 Oct", 9, 2]], "c1", 7) });
    await act(async () => undefined);
    expect(libraryPage.mock.calls.map((c) => c[1])).toEqual(["c1", "c2"]);
    expect(links()).toHaveLength(7);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 2400, behavior: "instant" });
    expect(JSON.parse(window.sessionStorage.getItem("library-pages:/library?view=list") ?? "{}").pages).toBe(3);
  });

  it("starts at the first page when the back went to another page", async () => {
    window.sessionStorage.setItem("library-pages:/library?view=list", JSON.stringify({ pages: 3, y: 2400 }));
    window.history.replaceState(null, "", "/home");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await mount({ first: page([["4 Oct", 9, 2]], "c1", 7) });
    expect(libraryPage).not.toHaveBeenCalled();
    expect(links()).toHaveLength(2);
  });

  it("does not retry a failed load from the sentinel, only from Try again", async () => {
    libraryPage.mockRejectedValueOnce(new Error("offline"));
    await mount();
    await scrollNear();
    expect(libraryPage).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("The next rows did not load.");
    await scrollNear();
    expect(libraryPage).toHaveBeenCalledTimes(1);
  });

  it("lets the previewer wait for a page already on its way", async () => {
    let answer: (page: Page) => void = () => undefined;
    libraryPage.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    const more: { current: null | (() => Promise<boolean>) } = { current: null };
    await mount({}, more);
    await scrollNear();
    let asked: Promise<boolean> | undefined;
    await act(async () => {
      asked = more.current?.();
    });
    expect(libraryPage).toHaveBeenCalledTimes(1);
    await act(async () => answer(page([["4 Oct", 3, 1]], null, 0, "r", 2)));
    expect(await asked).toBe(true);
    expect(links()).toContain("r 2");
  });

  it("keeps the count of pages drawn for back and forward", async () => {
    libraryPage.mockResolvedValueOnce(page([["4 Oct", 3, 1]], null, 0, "r", 2));
    await mount();
    await act(async () => button("Show older")?.click());
    expect(JSON.parse(window.sessionStorage.getItem("library-pages:/library?view=list") ?? "{}")).toMatchObject({ pages: 2 });
  });

  it("draws a course's modules under their own headings, with their counts", async () => {
    const first: Page = {
      state: "ok",
      pieces: [
        { group: { key: "course:cs", label: "CS3230", detail: "Algorithms", count: 3 }, section: { key: "", label: "Whole course", count: 1 }, rows: rowNodes("a", 1) },
        { group: { key: "course:cs", label: "CS3230", detail: "Algorithms", count: 3 }, section: { key: "w2", label: "Week 2", count: 2 }, rows: rowNodes("b", 1) },
      ],
      next: "c1",
      remaining: 1,
    };
    let answer: (page: Page) => void = () => undefined;
    libraryPage.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    await mount({ first });
    expect(headings()).toEqual(["CS3230 Algorithms(3)"]);
    expect([...container.querySelectorAll("h3")].map((h) => h.textContent)).toEqual(["Whole course(1)", "Week 2(2)"]);
    await act(async () => button("Show older")?.click());
    // The placeholders go in the last module, where the next rows land.
    const sections = container.querySelectorAll("h3 + ul");
    expect(sections[1].querySelectorAll("[data-skeleton]")).toHaveLength(1);
    expect(sections[0].querySelectorAll("[data-skeleton]")).toHaveLength(0);
    await act(async () =>
      answer({
        state: "ok",
        pieces: [{ group: { key: "course:cs", label: "CS3230", detail: "Algorithms", count: 3 }, section: { key: "w2", label: "Week 2", count: 2 }, rows: rowNodes("b", 1, 1) }],
        next: null,
        remaining: 0,
      }),
    );
    expect([...container.querySelectorAll("h3")].map((h) => h.textContent)).toEqual(["Whole course(1)", "Week 2(2)"]);
    expect(container.querySelectorAll("h3 + ul")[1].querySelectorAll("a")).toHaveLength(2);
  });

  it("takes the server's new first page after a refresh under the same URL", async () => {
    await mount({ first: page([["4 Oct", 3, 3]], null, 0, "old") });
    expect(links()).toEqual(["old 0", "old 1", "old 2"]);
    // An unstar on a Favorites only view: the refresh sends a first page with one row fewer.
    await mount({ first: page([["4 Oct", 2, 2]], null, 0, "new") });
    expect(links()).toEqual(["new 0", "new 1"]);
    expect(headings()).toEqual(["4 Oct(2)"]);
  });

  it("keeps the later pages after a refresh while they still follow the new first page", async () => {
    libraryPage.mockResolvedValueOnce(page([["4 Oct", 4, 2]], null, 0, "r", 2));
    await mount({ first: page([["4 Oct", 4, 2]], "c1", 2) });
    await act(async () => button("Show older")?.click());
    expect(links()).toEqual(["r 0", "r 1", "r 2", "r 3"]);
    // A rename on the first page: the same cursor follows it, so page two stays.
    await mount({ first: page([["4 Oct", 4, 2]], "c1", 2, "renamed") });
    expect(links()).toEqual(["renamed 0", "renamed 1", "r 2", "r 3"]);
    // The first page now ends somewhere else: the held pages no longer follow it.
    await mount({ first: page([["4 Oct", 3, 2]], "c2", 1, "moved") });
    expect(links()).toEqual(["moved 0", "moved 1"]);
  });
});
