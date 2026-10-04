import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/library` in its two layouts, the grid and `?view=list`.
 *
 * The page is an async server component, awaited into an element tree and
 * rendered to static markup, as `/learn`'s suite does. The catalog reads are
 * mocked with three rows: a video that explains a concept, a note that
 * explains itself, and a link filed under a topic only, so each of the row's
 * three ways of naming what an asset is about shows up once.
 */
const loadLibrary = vi.hoisted(() => vi.fn());
const loadKnowledgeBase = vi.hoisted(() => vi.fn());
const loadFavorites = vi.hoisted(() => vi.fn());

vi.mock("@/lib/asset-library", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/asset-library")>()),
  loadLibrary,
  loadFavorites,
  loadAssetAccess: async () => ({ served: new Set<string>(), posters: new Set<string>() }),
  loadSearchText: async () => ({ texts: {}, sources: {}, searchedText: false, skipped: 0 }),
}));
vi.mock("@/lib/learner-store", () => ({ loadKnowledgeBase }));
vi.mock("@/data/courses", () => ({ getCourses: async () => [] }));
// The menus push through the app router, which static markup has none of, so
// the toolbar is stood in for by its two server-built halves: the search form
// and the layout switch. This suite is about the layouts.
vi.mock("@/components/library/LibraryToolbar", () => ({
  LibraryToolbar: ({ search, layout }: { search: ReactNode; layout: ReactNode }) =>
    createElement("section", null, search, layout),
}));

const ROWS = [
  {
    id: "video:paging",
    kind: "video",
    path: "out/os/paging.mp4",
    url: null,
    bytes: 4_400_000,
    title: "Paging, step by step",
    sourceRepo: "manimkc",
    topics: ["operating-systems"],
    createdAt: "2026-10-03T08:00:00Z",
  },
  {
    id: "note:tlb",
    kind: "note",
    path: "learn/concepts/os/tlb.md",
    url: null,
    bytes: 2_900,
    title: "The TLB",
    sourceRepo: "self-learn",
    topics: ["operating-systems"],
    createdAt: "2026-09-29T12:00:00Z",
  },
  {
    id: "link:ostep",
    kind: "link",
    path: null,
    url: "https://pages.cs.wisc.edu/~remzi/OSTEP/",
    bytes: null,
    title: "OSTEP",
    sourceRepo: "self-learn",
    topics: ["operating-systems"],
    createdAt: "2026-09-01T00:00:00Z",
  },
];

const CONCEPT = { title: "Paging", mastery: "shaky", pL: 0.4, observations: 2 };

async function render(params: Record<string, string> = {}): Promise<string> {
  const { default: LibraryPage } = await import("./page");
  return renderToStaticMarkup(await LibraryPage({ searchParams: Promise.resolve(params) }));
}

/** The layout toggle's link marked current: where it points and what it says. */
function currentLayout(html: string): { href: string; label: string } | null {
  const nav = html.match(/<nav aria-label="Layout".*?<\/nav>/)?.[0] ?? "";
  const link = [...nav.matchAll(/<a ([^>]*)>(.*?)<\/a>/g)].find(([, attrs]) => attrs.includes('aria-current="page"'));
  if (link === undefined) return null;
  return { href: link[1].match(/href="([^"]*)"/)?.[1] ?? "", label: link[1].match(/aria-label="([^"]*)"/)?.[1] ?? "" };
}

describe("/library", () => {
  beforeEach(() => {
    vi.resetModules();
    loadLibrary.mockResolvedValue({
      rows: ROWS,
      counts: [
        { kind: "video", count: 1 },
        { kind: "note", count: 1 },
        { kind: "link", count: 1 },
      ],
      reachable: true,
      truncated: false,
      titles: { "operating-systems": "Operating systems" },
      concepts: { "video:paging": ["paging"], "note:tlb": ["tlb"] },
    });
    loadFavorites.mockReset();
    loadFavorites.mockResolvedValue(new Set(["note:tlb"]));
    loadKnowledgeBase.mockResolvedValue({
      reachable: true,
      kb: {
        concepts: [
          { id: "paging", ...CONCEPT },
          { id: "tlb", ...CONCEPT, title: "The TLB" },
        ],
      },
    });
  });

  it("renders the card grid by default, with Grid marked current", async () => {
    const html = await render();

    expect(html).toContain("[grid-template-columns:repeat(auto-fill");
    expect(html).not.toContain("divide-y-2");
    expect(currentLayout(html)).toEqual({ href: "/library", label: "Grid" });
    // The cards carry no date; that is the list's column.
    expect(html).not.toContain("3 Oct 2026");
  });

  it("renders one row per asset with ?view=list, in the same order as the grid", async () => {
    const html = await render({ view: "list" });

    expect(html).toContain("divide-y-2");
    expect(html).not.toContain("[grid-template-columns:repeat(auto-fill");
    expect(currentLayout(html)).toEqual({ href: "/library?view=list", label: "List" });
    // One row each, fading in as it arrives (the list's rows are the only `<li>`s that do).
    expect(html.match(/<li class="animate-fade-in/g)).toHaveLength(3);

    const order = ["Paging, step by step", "The TLB", "OSTEP"].map((title) => html.indexOf(title));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("names each row's concept, its mastery, or its topic, and the day it was added", async () => {
    const html = await render({ view: "list" });

    // The video explains Paging, named beside it.
    expect(html).toContain(">Paging</span>");
    // The note explains itself, so its row says the mastery, not the title again.
    expect(html.split("The TLB").length - 1).toBe(1);
    expect(html).toContain("Learning");
    // The link explains nothing and shows its topic.
    expect(html).toContain("Operating systems");
    expect(html).toContain("3 Oct 2026");
    expect(html).toContain("29 Sept 2026");
    expect(html).toContain("Video · manim · 4.4 MB");
    expect(html).toContain("Link · pages.cs.wisc.edu");
  });

  it("keeps the list when a search is submitted, and the sort when the layout flips", async () => {
    const html = await render({ view: "list", sort: "title" });

    expect(html).toMatch(/<input[^>]*type="hidden"[^>]*name="sort"[^>]*value="title"/);
    expect(currentLayout(html)).toEqual({ href: "/library?sort=title&amp;view=list", label: "List" });
    expect(html).toContain('href="/library?sort=title"');
    expect(html).toMatch(/<input[^>]*type="hidden"[^>]*name="view"[^>]*value="list"/);
  });

  it("shows only the starred assets with ?favorites=1, and keeps the filter on a search", async () => {
    const html = await render({ favorites: "1", view: "list" });
    expect(html).toContain("The TLB");
    expect(html).not.toContain("Paging, step by step");
    expect(html).not.toContain("OSTEP");
    expect(html).toContain("1 of 3 assets");
    expect(html).toMatch(/<input[^>]*type="hidden"[^>]*name="favorites"[^>]*value="1"/);
  });

  it("does not read the stars when the filter is off", async () => {
    await render();
    expect(loadFavorites).not.toHaveBeenCalled();
  });

  it("says how to star something when nothing is starred, and says so when the stars cannot be read", async () => {
    loadFavorites.mockResolvedValueOnce(new Set());
    expect(await render({ favorites: "1" })).toContain("Nothing is starred yet. Press Favorite on an asset");

    loadFavorites.mockResolvedValueOnce(null);
    const down = await render({ favorites: "1" });
    expect(down).toContain("Your stars could not be read just now");
    expect(down).toContain("No assets match");
  });
});
