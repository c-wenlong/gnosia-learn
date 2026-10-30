import { describe, expect, it } from "vitest";
import { ownValue } from "../src/own-key";

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
