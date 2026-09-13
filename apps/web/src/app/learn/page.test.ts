import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_KNOWLEDGE_BASE } from "@/lib/kb/types";

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

async function render(): Promise<string> {
  const { default: LearnPage } = await import("./page");
  return renderToStaticMarkup(await LearnPage());
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

    expect(html).toContain("Alpha");
    expect(html).toContain("The first one.");
    expect(html).toContain("frontier");
  });
});
