import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_KNOWLEDGE_BASE } from "@/lib/kb/types";

// The app reads courses from the database only; this suite tests logic over
// real course data, so it reads the export tree instead (`@/test/content-files`).
// `outage` stands the courses read in for a database that does not answer,
// which refuses content reads as well as the knowledge base's.
const outage = vi.hoisted(() => ({ on: false }));
vi.mock("@/data/source", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/data/source")>();
  const { fileContentSource } = await import("@/test/content-files");
  return {
    ...actual,
    contentSource: () => {
      const source = fileContentSource();
      if (!outage.on) return source;
      return {
        ...source,
        courses: async () => {
          throw new actual.ContentUnavailableError("unreachable", null, "The catalog database could not be read.");
        },
      };
    },
  };
});

/**
 * `/learn` renders when the database is unreachable, and says which kind of
 * empty it is.
 *
 * The page is an async server component, so it is awaited into an element tree
 * and rendered to static markup — everything below it is synchronous. That is
 * enough to check the branch, which is the thing that would otherwise only be
 * discovered by someone loading the page with the catalog unreadable.
 */
const loadKnowledgeBase = vi.hoisted(() => vi.fn());

vi.mock("@/lib/kb/load", () => ({
  loadKnowledgeBase,
  dueConcepts: () => [],
}));

// The ready highlight reads the owner's recent courses (G5 of docs/proposals/knowledge-map.md).
const recentCourses = vi.hoisted(() => vi.fn(async () => [] as string[]));
vi.mock("@/lib/owner", () => ({ currentOwner: async () => "local" }));
vi.mock("@/lib/recent-courses", () => ({ readRecentCourses: recentCourses }));

// The topic vocabulary places concepts in domains (D1 of docs/proposals/domain-map.md).
const getTopics = vi.hoisted(() => vi.fn(async () => [] as unknown[]));
vi.mock("@/data/topics", () => ({ getTopics }));

async function render(params: Record<string, string> = {}): Promise<string> {
  const { default: LearnPage } = await import("./page");
  return renderToStaticMarkup(await LearnPage({ searchParams: Promise.resolve(params) }));
}

describe("/learn", () => {
  beforeEach(() => {
    vi.resetModules();
    outage.on = false;
  });

  it("says the database is unreachable rather than showing an empty base", async () => {
    // A real outage: the courses read is refused as well as the knowledge base's.
    outage.on = true;
    loadKnowledgeBase.mockResolvedValue({ kb: EMPTY_KNOWLEDGE_BASE, reachable: false });
    const html = await render();

    expect(html).toContain("Knowledge base unavailable");
    expect(html).toContain("catalog -- status");
    expect(html).not.toContain("No concepts yet");
  });

  it("says so too when only the knowledge base read failed", async () => {
    loadKnowledgeBase.mockResolvedValue({ kb: EMPTY_KNOWLEDGE_BASE, reachable: false });
    expect(await render()).toContain("Knowledge base unavailable");
  });

  it("says the base is empty when it really is", async () => {
    loadKnowledgeBase.mockResolvedValue({ kb: EMPTY_KNOWLEDGE_BASE, reachable: true });
    const html = await render();

    expect(html).toContain("No concepts yet");
    expect(html).not.toContain("Knowledge base unavailable");
  });

  it("renders the concepts when there are some", async () => {
    loadKnowledgeBase.mockResolvedValue({
      reachable: true,
      kb: {
        indexedAt: "2026-09-13T00:00:00.000Z",
        stats: { total: 1, mastered: 0, learning: 1, untouched: 0 },
        frontier: ["alpha"],
        edges: [],
        concepts: [
          {
            id: "alpha",
            title: "Alpha",
            summary: "The first one.",
            requires: [],
            assumes: [],
            pL: 0.6,
            mastery: "shaky" as const,
            observations: 1,
            correct: 1,
            lastSeen: null,
            due: null,
            lapses: 0,
            leech: false,
            topics: [],
            domain: "fixtures",
          },
        ],
      },
    });
    // The map is the default view (G1 of docs/proposals/knowledge-map.md) and
    // opens on a card per domain (D2 of docs/proposals/domain-map.md). With no
    // topic row, the concept's domain is its folder (D1).
    const html = await render();
    expect(html).toContain("1 concept · 0 mastered · 1 learning · 0 not started");
    expect(html).toContain('data-domain-card="fixtures"');
    expect(html).not.toContain("data-domain-graph");

    // A domain draws its picture; a concept named in the URL opens its domain, selected.
    const domain = await render({ domain: "fixtures" });
    expect(domain).toContain('aria-label="Fixtures map, 1 concept in 1 topic"');
    expect(domain).toMatch(/data-concept="alpha"[^>]*aria-pressed="false"/);
    const named = await render({ concept: "alpha" });
    expect(named).toContain('aria-label="Fixtures map, 1 concept in 1 topic"');
    expect(named).toMatch(/data-concept="alpha"[^>]*aria-pressed="true"/);
    expect(named).toContain('href="/learn/alpha"');

    // The table is one press away, and `view=table` opens it: the row, its link
    // to the workspace, and the graph card.
    const table = await render({ view: "table" });
    expect(table).toContain("Alpha");
    expect(table).toContain('href="/learn/alpha"');
    expect(table).toContain("Neighbourhood graph of Alpha");
    expect(table).not.toContain("data-domain-graph");
  });

  it("says so when the topics cannot be read, rather than passing folders off as domains", async () => {
    loadKnowledgeBase.mockResolvedValue({
      reachable: true,
      kb: {
        indexedAt: null,
        stats: { total: 1, mastered: 0, learning: 0, untouched: 1 },
        frontier: [],
        edges: [],
        concepts: [
          { id: "alpha", title: "Alpha", summary: "", requires: [], assumes: [], pL: 0.1, mastery: "gap" as const, observations: 0, correct: 0, lastSeen: null, due: null, lapses: 0, leech: false, topics: [], domain: "fixtures", topic: "t" },
        ],
      },
    });
    getTopics.mockRejectedValueOnce(new Error("database down"));
    const html = await render();
    expect(html).toContain("Topics could not be read");
    expect(await render()).not.toContain("Topics could not be read");
  });

  it("selects the concept the query string names", async () => {
    loadKnowledgeBase.mockResolvedValue({
      reachable: true,
      kb: {
        indexedAt: null,
        stats: { total: 2, mastered: 0, learning: 0, untouched: 2 },
        frontier: ["alpha"],
        edges: [{ from: "alpha", to: "beta", kind: "requires" }],
        concepts: ["alpha", "beta"].map((id) => ({
          id,
          title: id === "alpha" ? "Alpha" : "Beta",
          summary: "",
          requires: id === "beta" ? ["alpha"] : [],
          assumes: [],
          pL: 0.1,
          mastery: "gap" as const,
          observations: 0,
          correct: 0,
          lastSeen: null,
          due: null,
          lapses: 0,
          leech: false,
          topics: [],
          domain: null,
        })),
      },
    });
    const html = await render({ concept: "beta", view: "graph" });

    // The map opens Beta's domain, Beta ringed on it (D2 of docs/proposals/domain-map.md).
    expect(html).toContain('aria-label="Other map, 2 concepts in 1 topic"');
    expect(html).toMatch(/data-concept="beta"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/data-concept="alpha"[^>]*aria-pressed="false"/);
  });

  it("marks the ready concepts of the recent courses on the map, and only those", async () => {
    const concept = (id: string, topics: string[], requires: string[] = []) => ({
      id,
      title: id,
      summary: "",
      requires,
      assumes: [],
      pL: 0.1,
      mastery: "gap" as const,
      observations: 0,
      correct: 0,
      lastSeen: null,
      due: null,
      lapses: 0,
      leech: false,
      topics,
      domain: null,
    });
    loadKnowledgeBase.mockResolvedValue({
      reachable: true,
      kb: {
        indexedAt: null,
        stats: { total: 3, mastered: 0, learning: 0, untouched: 3 },
        frontier: [],
        edges: [{ from: "root", to: "next", kind: "requires" }],
        // root and next are taught in CP4284's first topic; loose is in no course and serves none.
        concepts: [concept("root", ["cp4284-m1-t1"]), concept("next", ["cp4284-m1-t1"], ["root"]), concept("loose", [])],
      },
    });
    recentCourses.mockResolvedValueOnce(["cp4284"]);
    const html = await render({ concept: "loose" });
    expect(html).toMatch(/data-concept="root"[^>]*data-ready="true"/);
    expect(html).toMatch(/data-concept="next"[^>]*data-ready="false"/);
    expect(html).toMatch(/data-concept="loose"[^>]*data-ready="false"/);

    // With no recent course, nothing is marked.
    const none = await render({ concept: "loose" });
    expect(none).not.toMatch(/data-ready="true"/);
  });
});
