import { describe, expect, it } from "vitest";

import { placePositions, POSITION_STEP, PositionGapError, renumbered } from "../src/content/positions";

/**
 * Sparse positions (D22), without a database: which rows keep their numbers,
 * and where the rest go.
 */

const place = (order: string[], existing: Record<string, number> = {}) =>
  Object.fromEntries(placePositions(order, new Map(Object.entries(existing))));

/** The keys whose number differs from `before`: what an import would write a revision for. */
const moved = (before: Record<string, number>, after: Record<string, number>) =>
  Object.keys(after).filter((key) => before[key] !== after[key]);

describe("placePositions", () => {
  it("numbers a list with no history in steps of 1000", () => {
    expect(place(["a", "b", "c"])).toEqual({ a: 1000, b: 2000, c: 3000 });
    expect(POSITION_STEP).toBe(1000);
  });

  it("keeps every number when nothing moved", () => {
    const before = { a: 1000, b: 2000, c: 3000 };
    expect(place(["a", "b", "c"], before)).toEqual(before);
  });

  it("gives a row added at the top a number of its own and moves nothing else", () => {
    const before = place(["a", "b", "c"]);
    const after = place(["new", "a", "b", "c"], before);
    expect(moved(before, after)).toEqual(["new"]);
    expect(after["new"]).toBeLessThan(after["a"] as number);
  });

  it("puts a row added in the middle between its neighbours, and one at the end past the last", () => {
    const before = place(["a", "b", "c"]);
    const after = place(["a", "x", "b", "c", "z"], before);
    expect(moved(before, after)).toEqual(["x", "z"]);
    expect(after).toMatchObject({ x: 1500, z: 4000 });
  });

  it("spreads several new rows evenly inside one gap", () => {
    expect(place(["a", "p", "q", "r", "b"], { a: 1000, b: 2000 })).toEqual({
      a: 1000,
      p: 1250,
      q: 1500,
      r: 1750,
      b: 2000,
    });
  });

  it("moves only the row that moved", () => {
    const keys = Array.from({ length: 86 }, (_, i) => `t${i}`);
    const before = place(keys);
    const reordered = [...keys];
    const [taken] = reordered.splice(40, 1);
    reordered.splice(3, 0, taken as string);
    const after = place(reordered, before);
    expect(moved(before, after)).toEqual(["t40"]);
    // And the order written back is the order given.
    expect(Object.entries(after).sort((a, b) => a[1] - b[1]).map(([k]) => k)).toEqual(reordered);
  });

  it("moves one of two rows that swapped, not both and not their neighbours", () => {
    const before = place(["a", "b", "c", "d"]);
    const after = place(["a", "c", "b", "d"], before);
    expect(moved(before, after)).toHaveLength(1);
    expect(Object.entries(after).sort((x, y) => x[1] - y[1]).map(([k]) => k)).toEqual(["a", "c", "b", "d"]);
  });

  it("ignores the positions of rows that left the list", () => {
    expect(place(["a", "c"], { a: 1000, b: 2000, c: 3000 })).toEqual({ a: 1000, c: 3000 });
  });

  it("numbers afresh a list whose rows all share one position, as a list never positioned does", () => {
    expect(place(["a", "b", "c"], { a: 0, b: 0, c: 0 })).toEqual({ a: 1000, b: 2000, c: 3000 });
  });

  it("re-places two rows that share a number and keeps the rest", () => {
    const after = place(["a", "b", "c", "d"], { a: 1000, b: 2000, c: 2000, d: 4000 });
    expect(after).toMatchObject({ a: 1000, d: 4000 });
    expect(after["b"]).toBeLessThan(after["c"] as number);
    expect(after["c"]).toBeLessThan(4000);
  });

  it("extends past either end without ever running out", () => {
    let positions = place(["a"]);
    const order = ["a"];
    for (let i = 0; i < 50; i += 1) {
      order.unshift(`h${i}`);
      order.push(`t${i}`);
      const next = place(order, positions);
      expect(moved(positions, next).sort()).toEqual([`h${i}`, `t${i}`]);
      positions = next;
    }
  });

  it("refuses a gap too narrow for what must go in it, naming both sides", () => {
    expect(() => place(["a", "x", "b"], { a: 1000, b: 1001 })).toThrow(PositionGapError);
    try {
      place(["a", "x", "y", "b"], { a: 1000, b: 1002 });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PositionGapError);
      expect(error).toMatchObject({ after: "a", before: "b", rows: ["x", "y"] });
    }
    // Ten insertions at one spot fit in a step of 1000; the gap only closes
    // after about as many halvings as the step has bits.
    let positions = place(["a", "b"]);
    const order = ["a", "b"];
    let inserted = 0;
    for (;;) {
      order.splice(1, 0, `x${inserted}`);
      try {
        positions = place(order, positions);
        inserted += 1;
      } catch (error) {
        expect(error).toBeInstanceOf(PositionGapError);
        break;
      }
    }
    expect(inserted).toBeGreaterThanOrEqual(9);
  });

  it("refuses a list that names a key twice", () => {
    expect(() => place(["a", "b", "a"])).toThrow(/names a key twice: a/);
  });
});

describe("renumbered", () => {
  it("is the fresh numbering, in the order given", () => {
    expect(Object.fromEntries(renumbered(["c", "a", "b"]))).toEqual({ c: 1000, a: 2000, b: 3000 });
  });
});
