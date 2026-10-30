import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryPage } from "@/lib/library-pages";

/**
 * `libraryPage`, the server function the Library's list asks for its next
 * page (L9 of docs/proposals/library-by-type-and-day.md), against the page
 * that drew the first: the same filters read from the view's URL, the rows
 * after the cursor drawn as the page draws them, a heading's whole count, and
 * `stale` or `unreachable` when there is no page to give.
 *
 * 130 notes over two days: 120 on 4 Oct and 10 on 3 Oct, so the first page
 * splits the big day (rounding up would pass the cap) and the second goes on
 * under it.
 */
const loadLibrary = vi.hoisted(() => vi.fn());
vi.mock("@/lib/asset-library", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/asset-library")>()),
  loadLibrary,
  loadFavorites: async () => new Set<string>(),
  loadAssetAccess: async () => ({ served: new Set<string>(), posters: new Set<string>() }),
  loadSearchText: async () => ({ texts: new Map(), sources: {}, searchedText: false, skipped: 0 }),
}));
vi.mock("@/lib/learner-store", () => ({ loadKnowledgeBase: async () => ({ reachable: true, kb: { concepts: [] } }) }));
// A signed-in request: the view is kept per owner (`loadLibraryView`).
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));
vi.mock("@/data/courses", () => ({ getCourses: async () => [] }));
vi.mock("@/data/topics", () => ({ getTopics: async () => [] }));
vi.mock("@/components/library/RowMenu", () => ({ RowMenu: () => null }));

function note(day: string, i: number, title = `Note ${String(i).padStart(3, "0")}`) {
  return {
    id: `note:${day}-${String(i).padStart(3, "0")}`,
    kind: "note",
    path: null,
    url: null,
    bytes: 100,
    title,
    sourceRepo: "gnosia",
    topics: [],
    createdAt: new Date(Date.parse(`${day}T20:00:00Z`) - i * 60_000).toISOString(),
    updatedAt: `${day}T20:00:00Z`,
    editedAt: null,
  };
}

const ROWS = [
  ...Array.from({ length: 120 }, (_, i) => note("2026-10-04", i)),
  ...Array.from({ length: 10 }, (_, i) => note("2026-10-03", i)),
];

function library(rows = ROWS, reachable = true) {
  return {
    rows,
    counts: [{ kind: "note", count: rows.length }],
    reachable,
    truncated: false,
    titles: {},
    concepts: {},
    parents: {},
  };
}

async function first(href: string) {
  const { loadLibraryView, renderLibraryPage } = await import("@/components/library/library-view");
  const params = Object.fromEntries(new URLSearchParams(href.split("?")[1] ?? ""));
  const page = renderLibraryPage(await loadLibraryView(params), null);
  if (page.state !== "ok") throw new Error("stale");
  return page;
}

function html(page: LibraryPage<ReactNode>): string {
  return renderToStaticMarkup(createElement(Fragment, null, ...page.pieces.flatMap((p) => p.rows)));
}

/** Moves the clock on, so a kept view is past its minute. */
function later(ms: number) {
  vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + ms });
}

const titles = (markup: string) => [...markup.matchAll(/>(Note \d{3})</g)].map(([, t]) => t);

describe("libraryPage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("HABIT_TIME_ZONE", "UTC");
    loadLibrary.mockReset();
    loadLibrary.mockResolvedValue(library());
    vi.useRealTimers();
  });

  it("draws the page after the cursor, under the day it goes on with, with the day's whole count", async () => {
    const { libraryPage } = await import("./page-action");
    const one = await first("/library?view=list");
    expect(one.pieces.map((p) => [p.group.label, p.group.count, p.rows.length])).toEqual([["4 Oct", 120, 50]]);
    const two = await libraryPage("/library?view=list", one.next ?? "");
    if (two.state !== "ok") throw new Error(two.state);
    expect(two.pieces.map((p) => [p.group.label, p.group.count, p.rows.length])).toEqual([["4 Oct", 120, 70]]);
    const markup = html(two);
    // List rows, the page's own markup for them.
    expect(markup).toContain('<li class="group/item animate-fade-in');
    expect(titles(markup)[0]).toBe("Note 050");
    const three = await libraryPage("/library?view=list", two.next ?? "");
    if (three.state !== "ok") throw new Error(three.state);
    expect(three.pieces.map((p) => [p.group.label, p.group.count, p.rows.length])).toEqual([["3 Oct", 10, 10]]);
    expect(three.next).toBeNull();
  });

  it("reads the filters and layout from the view's URL", async () => {
    const { libraryPage } = await import("./page-action");
    const one = await first("/library?sort=title");
    const two = await libraryPage("/library?sort=title", one.next ?? "");
    if (two.state !== "ok") throw new Error(two.state);
    // The grid's cards, and the title order inside the day.
    expect(html(two)).not.toContain("group/item");
    expect(titles(html(two))).toEqual([...titles(html(two))].sort());
    // A search that matches one row has no next page to give.
    const searched = await first("/library?q=Note%20007");
    expect(searched.next).toBeNull();
  });

  it("answers stale for a cursor that does not parse or whose day has gone", async () => {
    const { libraryPage } = await import("./page-action");
    expect(await libraryPage("/library", "not a cursor")).toEqual({ state: "stale" });
    expect(await libraryPage(42 as unknown as string, "{}")).toEqual({ state: "stale" });
    const fine = await first("/library");
    expect(await libraryPage("/library", fine.next ?? "", "nope" as unknown as string[])).toEqual({ state: "stale" });
    // The first page's order, sent back, is the order kept.
    expect(fine.order).toEqual(["2026-10-04", "2026-10-03"]);
    expect((await libraryPage("/library", fine.next ?? "", fine.order)).state).toBe("ok");
    const one = await first("/library");
    loadLibrary.mockResolvedValue(library(ROWS.filter((r) => r.id.startsWith("note:2026-10-03"))));
    // Past the minute the page's view is reused for, so the catalog is read again.
    later(61_000);
    expect(await libraryPage("/library", one.next ?? "")).toEqual({ state: "stale" });
  });

  it("reuses the view the page worked out for the pages after it, for a minute", async () => {
    const { libraryPage } = await import("./page-action");
    const one = await first("/library?view=list");
    expect(loadLibrary).toHaveBeenCalledTimes(1);
    const two = await libraryPage("/library?view=list", one.next ?? "");
    if (two.state !== "ok") throw new Error(two.state);
    await libraryPage("/library?view=list", two.next ?? "");
    expect(loadLibrary).toHaveBeenCalledTimes(1);
    // Another view is its own read.
    await libraryPage("/library?view=list&sort=title", one.next ?? "");
    expect(loadLibrary).toHaveBeenCalledTimes(2);
    // The page itself always reads, so a refresh after a write is fresh.
    await first("/library?view=list");
    expect(loadLibrary).toHaveBeenCalledTimes(3);
    later(61_000);
    await libraryPage("/library?view=list", one.next ?? "");
    expect(loadLibrary).toHaveBeenCalledTimes(4);
  });

  it("answers unreachable when the catalog does not answer", async () => {
    const { libraryPage } = await import("./page-action");
    const one = await first("/library");
    loadLibrary.mockResolvedValue(library([], false));
    later(61_000);
    expect(await libraryPage("/library", one.next ?? "")).toEqual({ state: "unreachable" });
  });

  it("walks more rows than the old read limit to the end, each once, every heading's count the rows under it", async () => {
    // 1,200 notes over 30 days, past the 1,000 the read used to stop at.
    const many = Array.from({ length: 1_200 }, (_, i) =>
      note(`2026-09-${String(1 + (i % 30)).padStart(2, "0")}`, i, `Note ${String(i).padStart(4, "0")}`),
    );
    loadLibrary.mockResolvedValue(library(many));
    const { libraryPage } = await import("./page-action");
    for (const href of ["/library?view=list", "/library", "/library?group=conversation", "/library?group=course&view=list"]) {
      const one = await first(href);
      const pages: LibraryPage<ReactNode>[] = [one];
      for (let next = one.next; next !== null; ) {
        const page = await libraryPage(href, next, one.order);
        if (page.state !== "ok") throw new Error(`${href}: ${page.state}`);
        pages.push(page);
        next = page.next;
      }
      const drawn = pages.flatMap((page) => [...html(page).matchAll(/>(Note \d{4})</g)].map(([, t]) => t));
      expect(drawn, href).toHaveLength(1_200);
      expect(new Set(drawn).size, href).toBe(1_200);
      // A heading's count is its whole group, on every page that holds part of it.
      const headings = new Map<string, number>();
      const under = new Map<string, number>();
      for (const piece of pages.flatMap((page) => page.pieces)) {
        headings.set(piece.group.key, piece.group.count);
        under.set(piece.group.key, (under.get(piece.group.key) ?? 0) + piece.rows.length);
      }
      expect(Object.fromEntries(under), href).toEqual(Object.fromEntries(headings));
      expect([...headings.values()].reduce((sum, n) => sum + n, 0), href).toBe(1_200);
    }
  });

  it("keeps a repeated parameter as the page would", async () => {
    const { libraryPage } = await import("./page-action");
    const one = await first("/library?view=list");
    const two = await libraryPage("/library?view=list&view=grid", one.next ?? "");
    // `firstParam` takes the first, as the page does.
    expect(two.state === "ok" && html(two)).toContain("group/item");
  });
});
