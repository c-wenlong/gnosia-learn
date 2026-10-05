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
    sourceRepo: "self-learn",
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

const titles = (markup: string) => [...markup.matchAll(/>(Note \d{3})</g)].map(([, t]) => t);

describe("libraryPage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("HABIT_TIME_ZONE", "UTC");
    loadLibrary.mockReset();
    loadLibrary.mockResolvedValue(library());
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
    const one = await first("/library");
    loadLibrary.mockResolvedValue(library(ROWS.filter((r) => r.id.startsWith("note:2026-10-03"))));
    expect(await libraryPage("/library", one.next ?? "")).toEqual({ state: "stale" });
  });

  it("answers unreachable when the catalog does not answer", async () => {
    const { libraryPage } = await import("./page-action");
    const one = await first("/library");
    loadLibrary.mockResolvedValue(library([], false));
    expect(await libraryPage("/library", one.next ?? "")).toEqual({ state: "unreachable" });
  });

  it("keeps a repeated parameter as the page would", async () => {
    const { libraryPage } = await import("./page-action");
    const one = await first("/library?view=list");
    const two = await libraryPage("/library?view=list&view=grid", one.next ?? "");
    // `firstParam` takes the first, as the page does.
    expect(two.state === "ok" && html(two)).toContain("group/item");
  });
});
