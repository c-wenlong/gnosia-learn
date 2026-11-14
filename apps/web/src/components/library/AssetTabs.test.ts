import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AssetDerivations, AssetRef, AssetWithTopics } from "@hermes/catalog/state";

import { libraryHref, type ExplainedConcept } from "@/lib/library";
import { assetTabItems, type AssetTabsInput } from "./AssetTabs";

const asset = {
  id: "note:learn/concepts/x.md",
  kind: "note",
  path: "learn/concepts/x.md",
  url: null,
  title: "X",
  bytes: 10,
  sourceRepo: "hermes",
  topics: ["t"],
} as unknown as AssetWithTopics;

const none: AssetDerivations = { sources: [], derived: [] } as unknown as AssetDerivations;
const base = { asset, titles: {}, concepts: [], related: [], derivations: none, indexed: "2026-09-29" };

/** The markup one tab's content draws, as the page shows it. */
function tab(input: AssetTabsInput, id: string): string {
  const item = assetTabItems(input).find((t) => t.id === id);
  expect(item, `tab "${id}"`).toBeDefined();
  return renderToStaticMarkup(item!.content as ReactElement);
}

describe("assetTabItems", () => {
  it("always has Explains and Details, and leaves out an empty Related or Files", () => {
    expect(assetTabItems(base).map((t) => t.id)).toEqual(["explains", "details"]);
  });

  it("adds Related and Files with their counts when there is something in them", () => {
    const row = { id: "a", kind: "video" } as unknown as AssetRef;
    const items = assetTabItems({
      ...base,
      related: [asset, asset],
      derivations: { sources: [row], derived: [row, row] } as unknown as AssetDerivations,
    });
    expect(items.map((t) => [t.id, t.count])).toEqual([
      ["explains", 0],
      ["related", 2],
      ["files", 3],
      ["details", undefined],
    ]);
  });
});

describe("the Explains tab", () => {
  const concept = (over: Partial<ExplainedConcept>): ExplainedConcept => ({
    slug: "c",
    title: "Bayes",
    bucket: "learning",
    pL: null,
    observations: 0,
    ...over,
  });

  it("says a concept with no evidence is not started, never a prior as a measurement", () => {
    const html = tab({ ...base, concepts: [concept({ observations: 0, pL: 0.3 })] }, "explains");
    expect(html).toContain("not started");
    expect(html).not.toContain("0.30");
  });

  it("shows the measured p(L) once a concept has evidence", () => {
    const html = tab({ ...base, concepts: [concept({ observations: 2, pL: 0.3 })] }, "explains");
    expect(html).toContain("0.30");
    expect(html).not.toContain("not started");
  });
});

describe("the Related tab", () => {
  it("offers no See all for an asset under more than one topic", () => {
    const twoTopics = { ...asset, topics: ["a", "b"] } as unknown as AssetWithTopics;
    const html = tab({ ...base, asset: twoTopics, related: [asset] }, "related");
    expect(html).not.toContain("See all under this topic");
  });

  it("links the topic's own library page for an asset under exactly one", () => {
    const html = tab({ ...base, related: [asset] }, "related");
    expect(html).toContain("See all under this topic");
    expect(html).toContain(`href="${libraryHref({ topic: "t" })}"`);
  });
});

describe("the Files tab", () => {
  const companion = {
    sources: [],
    derived: [{ id: "t:x", kind: "transcript", path: "out/x.transcript.json", url: null, title: "X", bytes: 10, sourceRepo: "hermes" } as unknown as AssetRef],
  } as unknown as AssetDerivations;

  it("calls a video's produced files its companions", () => {
    const video = { ...asset, kind: "video" } as unknown as AssetWithTopics;
    const html = tab({ ...base, asset: video, derivations: companion }, "files");
    expect(html).toContain("Companion files");
    expect(html).not.toContain("Produced from this");
  });

  it("calls another kind's produced files what it produced", () => {
    const html = tab({ ...base, derivations: companion }, "files");
    expect(html).toContain("Produced from this");
    expect(html).not.toContain("Companion files");
  });
});
