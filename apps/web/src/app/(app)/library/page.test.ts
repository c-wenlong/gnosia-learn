import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
// the toolbar is stood in for by its server-built parts: the heading, the
// search form and the layout switch. Its other props (the tabs, the menus)
// are recorded, so a test can read what the page handed it.
const toolbar = vi.hoisted(() => vi.fn());
// The row menu is a client component that needs the app router; a stand-in
// records the items the page decided for each row.
const rowMenu = vi.hoisted(() => vi.fn());
vi.mock("@/components/library/RowMenu", () => ({
  RowMenu: (props: { assetId: string }) => {
    rowMenu(props);
    return createElement("span", { "data-row-menu": props.assetId });
  },
}));
vi.mock("@/components/library/LibraryToolbar", () => ({
  LibraryToolbar: (props: { heading: ReactNode; search: ReactNode; layout: ReactNode }) => {
    toolbar(props);
    return createElement("section", null, props.heading, props.search, props.layout);
  },
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
    updatedAt: "2026-10-03T08:00:00Z",
    editedAt: null,
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
    // Revised by a person five days later: the row says so.
    updatedAt: "2026-10-04T09:00:00Z",
    editedAt: "2026-10-04T09:00:00Z",
  },
  {
    id: "session:2026-09-29-tlb",
    kind: "session",
    path: "learn/sessions/2026-09-29-tlb.md",
    url: null,
    bytes: 1_200,
    title: "Session log",
    sourceRepo: "self-learn",
    topics: [],
    createdAt: "2026-09-29T15:30:00Z",
    updatedAt: "2026-09-29T15:30:00Z",
    editedAt: null,
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
    // Rewritten by an import a month later: no person changed it, so no label.
    updatedAt: "2026-10-02T00:00:00Z",
    editedAt: null,
  },
  {
    id: "video:paging.vtt",
    kind: "captions",
    path: "out/os/paging.vtt",
    url: null,
    bytes: 900,
    title: null,
    sourceRepo: "manimkc",
    topics: ["operating-systems"],
    createdAt: "2026-10-03T08:00:00Z",
    updatedAt: "2026-10-03T08:00:00Z",
    editedAt: null,
  },
];

const PARENTS = {
  "video:paging": {
    places: [
      {
        course: "cs2106",
        code: "CS2106",
        courseTitle: "Operating Systems",
        module: "m7",
        moduleTitle: "Week 7: Virtual memory",
        position: 7,
        via: "item",
      },
    ],
    concepts: ["paging"],
    conversations: [],
    sessions: [],
  },
  "note:tlb": { places: [], concepts: ["tlb"], conversations: [], sessions: [] },
  "session:2026-09-29-tlb": {
    places: [],
    concepts: [],
    conversations: [],
    sessions: [{ id: "2026-09-29-tlb", title: "Teach session: the TLB" }],
  },
};

const CONCEPT = { title: "Paging", mastery: "shaky", pL: 0.4, observations: 2 };

async function render(params: Record<string, string> = {}): Promise<string> {
  const { default: LibraryPage } = await import("./page");
  return renderToStaticMarkup(await LibraryPage({ searchParams: Promise.resolve(params) }));
}

/** The layout toggle's link marked current: where it points and what it says. */
function currentLayout(html: string): { href: string; label: string } | null {
  const nav = html.match(/<div role="group" aria-label="Layout"[^>]*>.*?<\/div>/)?.[0] ?? "";
  const link = [...nav.matchAll(/<a ([^>]*)>(.*?)<\/a>/g)].find(([, attrs]) => attrs.includes('aria-current="page"'));
  if (link === undefined) return null;
  return { href: link[1].match(/href="([^"]*)"/)?.[1] ?? "", label: link[1].match(/aria-label="([^"]*)"/)?.[1] ?? "" };
}

/** The headings of the groups, in order, as "label (count)", a course's title after its code. */
function dayHeadings(html: string, level: "h2" | "h3" = "h2"): string[] {
  const heading = new RegExp(`<${level}(?: [^>]*)?>((?:(?!<${level}).)*?)<span[^>]*>\\((\\d+)\\)</span></${level}>`, "g");
  return [...html.matchAll(heading)].map(([, label, n]) => `${label.replace(/<[^>]*>/g, "").trim()} (${n})`);
}

describe("/library", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("HABIT_TIME_ZONE", "UTC");
    toolbar.mockClear();
    rowMenu.mockClear();
    loadLibrary.mockResolvedValue({
      rows: ROWS,
      counts: [
        { kind: "video", count: 1 },
        { kind: "note", count: 1 },
        { kind: "session", count: 1 },
        { kind: "link", count: 1 },
        { kind: "captions", count: 1 },
      ],
      reachable: true,
      truncated: false,
      titles: { "operating-systems": "Operating systems" },
      concepts: { "video:paging": ["paging"], "note:tlb": ["tlb"] },
      parents: PARENTS,
    });
    loadFavorites.mockReset();
    loadFavorites.mockResolvedValue(new Set(["note:tlb"]));
    loadKnowledgeBase.mockResolvedValue({
      reachable: true,
      kb: {
        concepts: [
          { id: "paging", requires: [], assumes: [], ...CONCEPT },
          { id: "tlb", requires: ["paging"], assumes: [], ...CONCEPT, title: "The TLB" },
        ],
      },
    });
  });

  it("renders the card grid by default, grouped by day, with Grid marked current", async () => {
    const html = await render();

    expect(html).toContain("[grid-template-columns:repeat(auto-fill");
    expect(currentLayout(html)).toEqual({ href: "/library", label: "Grid" });
    expect(dayHeadings(html)).toEqual(["3 Oct (1)", "29 Sept (2)", "1 Sept (1)"]);
    // The cards carry no time; that is the list's column.
    expect(html).not.toContain("08:00");
    // The companion caption track is not in All.
    expect(html).not.toContain("paging.vtt");
  });

  it("puts the count in the header and hands the toolbar the tabs, Others included", async () => {
    const html = await render();
    expect(html).toContain(">4 files</p>");
    const props = toolbar.mock.calls.at(-1)?.[0] as { tabs: { label: string }[]; tab: string; menus: { label: string }[] };
    expect(props.tabs.map((t) => t.label)).toEqual(["All", "Videos", "Diagrams", "Notes", "Sessions", "Links", "Others"]);
    expect(props.tab).toBe("");
    // The kind is a tab now, not a menu.
    expect(props.menus.map((m) => m.label)).toEqual(["Course"]);
  });

  it("lists the companions under Others, with a Kind menu that narrows them", async () => {
    const html = await render({ kind: "other", view: "list" });
    expect(html).toContain("paging.vtt");
    expect(html).not.toContain("Paging, step by step");
    expect(html).toContain(">1 file</p>");
    const props = toolbar.mock.calls.at(-1)?.[0] as { tab: string; menus: { label: string; value: string }[] };
    expect(props.tab).toBe("other");
    expect(props.menus.map((m) => [m.label, m.value])).toEqual([
      ["Kind", "other"],
      ["Course", ""],
    ]);

    // An old `?kind=captions` link opens the same tab, narrowed.
    await render({ kind: "captions" });
    const narrowed = toolbar.mock.calls.at(-1)?.[0] as { tab: string; menus: { label: string; value: string }[] };
    expect(narrowed.tab).toBe("other");
    expect(narrowed.menus[0]).toMatchObject({ label: "Kind", value: "captions" });
  });

  it("renders one row per asset with ?view=list, under its day, newest day first", async () => {
    const html = await render({ view: "list" });

    expect(html).not.toContain("[grid-template-columns:repeat(auto-fill");
    expect(currentLayout(html)).toEqual({ href: "/library?view=list", label: "List" });
    expect(dayHeadings(html)).toEqual(["3 Oct (1)", "29 Sept (2)", "1 Sept (1)"]);
    // One row each, fading in as it arrives.
    expect(html.match(/<li class="group\/item animate-fade-in/g)).toHaveLength(4);

    // Newest first inside a day too: the log (15:30) above the note (12:00).
    const order = ["Paging, step by step", "Session log", "The TLB", "OSTEP"].map((title) => html.indexOf(title));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("names where each row came from, and when it was made and edited", async () => {
    const html = await render({ view: "list" });

    // The video sits in a course module and explains Paging.
    expect(html).toContain("CS2106 · Week 7");
    expect(html).toContain(">Paging</span>");
    // The note explains itself, so its row says the mastery, not the title again.
    expect(html.split("The TLB").length - 1).toBe(1);
    expect(html).toContain("Learning");
    // The session log names its session.
    expect(html).toContain("Teach session: the TLB");
    // The link has no parent and shows its topic.
    expect(html).toContain("Operating systems");
    // Times in the owner's zone, and the edited day for the note a person
    // revised; the link an import rewrote says nothing.
    expect(html).toContain('<time dateTime="2026-10-03T08:00:00Z">08:00</time>');
    expect(html).toContain('<time dateTime="2026-10-04T09:00:00Z">edited 4 Oct</time>');
    expect(html.match(/edited /g)).toHaveLength(1);
  });

  it("sorts by title within each day, the days staying newest first", async () => {
    const html = await render({ view: "list", sort: "title" });
    expect(dayHeadings(html)).toEqual(["3 Oct (1)", "29 Sept (2)", "1 Sept (1)"]);
    expect(html.indexOf("Session log")).toBeLessThan(html.indexOf("The TLB"));
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
    expect(html).toContain("1 of 4 files");
    expect(html).toMatch(/<input[^>]*type="hidden"[^>]*name="favorites"[^>]*value="1"/);
  });

  it("counts a starred companion file beside the total, never inside it", async () => {
    loadLibrary.mockResolvedValueOnce({
      rows: [
        ...ROWS,
        { ...ROWS[1], id: "transcript:paging", kind: "transcript", title: "Paging transcript", path: "out/os/paging.json" },
      ],
      counts: [
        { kind: "video", count: 1 },
        { kind: "note", count: 1 },
        { kind: "link", count: 1 },
        { kind: "transcript", count: 1 },
      ],
      reachable: true,
      truncated: false,
      titles: {},
      concepts: {},
      parents: {},
    });
    loadFavorites.mockResolvedValueOnce(new Set(["note:tlb", "transcript:paging"]));
    const html = await render({ favorites: "1", view: "list" });
    expect(html).toContain("Paging transcript");
    expect(html).toContain("1 of 3 files · 1 starred companion file");
  });

  it("reads the stars once with the filter off too, for the rows' menus", async () => {
    await render();
    expect(loadFavorites).toHaveBeenCalledTimes(1);
  });

  it("says how to star something when nothing is starred, and says so when the stars cannot be read", async () => {
    loadFavorites.mockResolvedValueOnce(new Set());
    expect(await render({ favorites: "1" })).toContain("Nothing is starred yet. Press Favorite in a row");

    loadFavorites.mockResolvedValueOnce(null);
    const down = await render({ favorites: "1" });
    expect(down).toContain("Your stars could not be read just now");
    expect(down).toContain("No assets match");
  });

  it("groups by course with ?group=course, a heading per course and its modules inside, the rest last", async () => {
    const html = await render({ group: "course", view: "list" });
    expect(dayHeadings(html)).toEqual(["CS2106 Operating Systems (1)", "No course (3)"]);
    expect(dayHeadings(html, "h3")).toEqual(["Week 7: Virtual memory (1)"]);
    // A search keeps the grouping.
    expect(html).toMatch(/<input[^>]*type="hidden"[^>]*name="group"[^>]*value="course"/);
    // The layout switch carries it too.
    expect(html).toContain('href="/library?group=course"');
  });

  it("groups by concept with ?group=concept, in the prerequisite graph's order, with no concept last", async () => {
    const html = await render({ group: "concept" });
    expect(dayHeadings(html)).toEqual(["Paging (1)", "The TLB (1)", "No concept (2)"]);
    // The concept heading carries its mastery dot.
    const heading = html.match(/<h2 id="group-concept-paging".*?<\/h2>/)?.[0] ?? "";
    expect(heading).toContain('role="img"');
  });

  it("falls back to the day for a grouping it does not know", async () => {
    const html = await render({ group: "topic" });
    expect(dayHeadings(html)).toEqual(["3 Oct (1)", "29 Sept (2)", "1 Sept (1)"]);
    expect(html).not.toMatch(/name="group"/);
  });

  it("hands each row's menu the items that fit it, in the list and the grid alike", async () => {
    await render({ view: "list" });
    const items = (id: string) =>
      (rowMenu.mock.calls.map(([props]) => props) as { assetId: string; sections: { action: string; label: string; href?: string }[][] }[])
        .find((props) => props.assetId === id)
        ?.sections.flat()
        .map((item) => item.label);
    expect(items("video:paging")).toEqual([
      "Open",
      "Open the concept",
      "Open in course",
      "Rename",
      "Favorite",
      "Mark watched",
      "Copy link",
    ]);
    // Starred, not stored (so no Ask and no Download), its concept and no course.
    expect(items("note:tlb")).toEqual(["Open", "Open the concept", "Rename", "Unfavorite", "Mark read", "Copy link"]);
    expect(items("link:ostep")).toEqual(["Open", "Rename", "Favorite", "Mark read", "Copy link"]);

    rowMenu.mockClear();
    await render();
    expect(rowMenu.mock.calls.map(([props]) => (props as { assetId: string }).assetId)).toEqual([
      "video:paging",
      "session:2026-09-29-tlb",
      "note:tlb",
      "link:ostep",
    ]);
  });
});
