import { describe, expect, it } from "vitest";
import type { AssetDerivations, AssetRef, AssetWithTopics } from "@self-learn/catalog/state";

import { assetTabItems } from "./AssetTabs";

const asset = {
  id: "note:learn/concepts/x.md",
  kind: "note",
  path: "learn/concepts/x.md",
  url: null,
  title: "X",
  bytes: 10,
  sourceRepo: "self-learn",
  topics: ["t"],
} as unknown as AssetWithTopics;

const none: AssetDerivations = { sources: [], derived: [] } as unknown as AssetDerivations;
const base = { asset, titles: {}, concepts: [], related: [], derivations: none, indexed: "2026-09-29" };

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
