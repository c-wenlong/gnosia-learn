import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { ownValue } from "./own-key";

const WEB_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PROTOTYPE_KEYS = ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf", "isPrototypeOf"];

describe("ownValue", () => {
  it("returns a key the record holds", () => {
    expect(ownValue({ graphs: "Graphs" }, "graphs")).toBe("Graphs");
  });

  it("returns undefined for a key the record does not hold", () => {
    expect(ownValue({ graphs: "Graphs" }, "trees")).toBeUndefined();
  });

  it.each(PROTOTYPE_KEYS)("returns undefined for %s, which a bare index reaches through the prototype", (key) => {
    const titles: Record<string, string> = { graphs: "Graphs" };
    // The bug this guards: the bare lookup is not undefined.
    expect(titles[key]).toBeDefined();
    expect(ownValue(titles, key)).toBeUndefined();
  });

  it("works on a record built by Object.fromEntries", () => {
    const titles = Object.fromEntries([["graphs", "Graphs"]]);
    expect(ownValue(titles, "constructor")).toBeUndefined();
    expect(ownValue(titles, "graphs")).toBe("Graphs");
  });

  it("returns a prototype-named key the record holds as its own", () => {
    const titles: Record<string, string> = { constructor: "Constructors" };
    expect(ownValue(titles, "constructor")).toBe("Constructors");
  });
});

/**
 * The records keyed by a slug someone else chose, and the files that read
 * them. `?topic=` on `/library` reaches `titles` straight from the URL; the
 * rest are keyed by rows or wikilinks, which are no more under this code's
 * control. A bare `record[name]` on any of them comes back here.
 */
const GUARDED: Record<string, readonly string[]> = {
  "app/(app)/library/page.tsx": ["titles", "concepts"],
  "app/(app)/library/[id]/page.tsx": ["notes"],
  "components/library/AssetTabs.tsx": ["titles"],
  "lib/concept-workspace.ts": ["cards"],
};

describe("slug-keyed records are read through ownValue", () => {
  it.each(Object.entries(GUARDED))("%s", (file, names) => {
    const source = readFileSync(path.join(WEB_SRC, file), "utf8");
    for (const name of names) {
      // A numeric index (`concepts[0]` on an array) is not a keyed lookup.
      const bare = source.match(new RegExp(`\\b${name}\\[(?!\\d)[^\\]]*\\]`, "g")) ?? [];
      expect(bare, `${file} indexes ${name} directly`).toEqual([]);
    }
  });
});
