import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_KNOWLEDGE_BASE } from "@/lib/kb/types";

// The app reads courses from the database only; this suite tests logic over
// real course data, so it reads the export tree instead (`@/test/content-files`).
vi.mock("@/data/source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/source")>()),
  contentSource: (await import("@/test/content-files")).fileContentSource,
}));

/**
 * `/learn` renders when the database is unreachable, and says which kind of
 * empty it is.
 *
 * The page is an async server component, so it is awaited into an element tree
 * and rendered to static markup — everything below it is synchronous. That is
 * enough to check the branch, which is the thing that would otherwise only be
 * discovered by someone loading the page with Postgres down.
 */
const loadKnowledgeBase = vi.hoisted(() => vi.fn());

vi.mock("@/lib/kb/load", () => ({
  loadKnowledgeBase,
  dueConcepts: () => [],
}));

async function render(params: Record<string, string> = {}): Promise<string> {
  const { default: LearnPage } = await import("./page");
  return renderToStaticMarkup(await LearnPage({ searchParams: Promise.resolve(params) }));
}

describe("/learn", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("says the database is unreachable rather than showing an empty base", async () => {
    loadKnowledgeBase.mockResolvedValue({ kb: EMPTY_KNOWLEDGE_BASE, reachable: false });
    const html = await render();

    expect(html).toContain("Knowledge base unavailable");
    expect(html).toContain("catalog -- status");
    expect(html).not.toContain("No concepts yet");
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
    const html = await render();

    // The row, its link to the workspace, and the graph card with the frontier
    // concept selected by default.
    expect(html).toContain("Alpha");
    expect(html).toContain('href="/learn/alpha"');
    expect(html).toContain("1 concept · 0 mastered · 1 learning · 0 untouched");
    expect(html).toContain("Neighbourhood graph of Alpha");
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

    expect(html).toContain("Course graph of Beta");
  });
});
