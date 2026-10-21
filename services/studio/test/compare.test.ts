import { describe, expect, it } from "vitest";

import {
  buildComparison,
  delta,
  diffLints,
  lintKey,
  lintRefs,
  sideFromGate,
  type LintRef,
  type Side,
} from "../src/diagram/compare";

/**
 * The comparison's arithmetic, which is the half of phase 4 that can be wrong
 * quietly.
 *
 * A screenshot that fails is visible. A Fixed list that counts a lint as fixed
 * because it moved to another shape is a sentence on a panel that reads
 * perfectly and says the opposite of what happened, and the only way to catch
 * that is here.
 */

const side = (patch: Partial<Side> = {}): Side => ({
  shapes: 10,
  bindings: 4,
  lints: [],
  svgBytes: 1000,
  shot: true,
  at: "2026-09-19T00:00:00.000Z",
  ...patch,
});

const ref = (rule: string, shape: string | null): LintRef => ({
  rule,
  shape,
  message: "",
  severity: "error",
});

describe("reading inspect's lints", () => {
  it("makes one row per shape a rule names", () => {
    expect(
      lintRefs([{ rule: "text-overflow", shapeIds: ["shape:a", "shape:b"], message: "too long" }]),
    ).toEqual([
      { rule: "text-overflow", shape: "shape:a", message: "too long", severity: "error" },
      { rule: "text-overflow", shape: "shape:b", message: "too long", severity: "error" },
    ]);
  });

  it("keeps a document-level rule as one row with no shape", () => {
    expect(lintRefs([{ rule: "missing-topic", shapeIds: [], severity: "warn" }])).toEqual([
      { rule: "missing-topic", shape: null, message: "", severity: "warn" },
    ]);
  });

  it("defaults an absent severity to error, which is what exits 3", () => {
    expect(lintRefs([{ rule: "overlap", shapeIds: ["shape:a"] }])[0]?.severity).toBe("error");
  });

  it("survives a report with no lints at all", () => {
    expect(lintRefs(undefined)).toEqual([]);
  });
});

describe("the key a lint is compared on", () => {
  it("is the rule and the shape, and not the message", () => {
    const moved = { ...ref("overlap", "shape:a"), message: "overlaps by 4px" };
    const same = { ...ref("overlap", "shape:a"), message: "overlaps by 11px" };
    expect(lintKey(moved)).toBe(lintKey(same));
  });
});

describe("Fixed and New", () => {
  it("calls a lint that survived neither", () => {
    const lint = ref("overlap", "shape:a");
    expect(diffLints([lint], [lint])).toEqual({ fixed: [], added: [] });
  });

  it("calls a lint that is gone fixed", () => {
    const { fixed, added } = diffLints([ref("overlap", "shape:a")], []);
    expect(fixed.map((entry) => entry.rule)).toEqual(["overlap"]);
    expect(added).toEqual([]);
  });

  /**
   * The case the whole key is for. Matching on the rule alone would report this
   * as unchanged, which is the one thing a person scanning the list is trying
   * to find out.
   */
  it("calls a lint that moved to another shape both fixed and new", () => {
    const { fixed, added } = diffLints([ref("overlap", "shape:a")], [ref("overlap", "shape:b")]);
    expect(fixed.map((entry) => entry.shape)).toEqual(["shape:a"]);
    expect(added.map((entry) => entry.shape)).toEqual(["shape:b"]);
  });

  it("reports a rule that spread from one shape to two as one new row", () => {
    const { fixed, added } = diffLints(
      [ref("text-overflow", "shape:a")],
      [ref("text-overflow", "shape:a"), ref("text-overflow", "shape:b")],
    );
    expect(fixed).toEqual([]);
    expect(added.map((entry) => entry.shape)).toEqual(["shape:b"]);
  });
});

describe("the comparison as a whole", () => {
  it("has an empty difference while the after side is unknown", () => {
    const built = buildComparison(side({ lints: [ref("overlap", "shape:a")] }), null);
    expect(built.after).toBeNull();
    expect(built.fixed).toEqual([]);
    expect(built.added).toEqual([]);
  });

  /**
   * A job drawing a diagram that does not exist has no before, and every lint
   * it left is new rather than unexplained.
   */
  it("treats a job with no before as every lint being new", () => {
    const built = buildComparison(null, side({ lints: [ref("overlap", "shape:a")] }));
    expect(built.before).toBeNull();
    expect(built.added).toHaveLength(1);
    expect(built.fixed).toEqual([]);
  });

  it("carries the hash the before side was read at, and never invents one", () => {
    expect(buildComparison(null, null).beforeHash).toBeNull();
    expect(buildComparison(null, null, { beforeHash: "abc" }).beforeHash).toBe("abc");
  });
});

describe("the delta", () => {
  it("is null when either side does not have the number", () => {
    expect(delta(null, 4)).toBeNull();
    expect(delta(4, null)).toBeNull();
    expect(delta(undefined, undefined)).toBeNull();
  });

  it("is signed the way a reader expects", () => {
    expect(delta(10, 14)).toBe(4);
    expect(delta(14, 10)).toBe(-4);
  });
});

describe("the after side, from what the gate already measured", () => {
  it("takes the counts and the lints off the gate rather than asking again", () => {
    const built = sideFromGate({
      shapes: 44,
      bindings: 12,
      lintList: [{ rule: "overlap", shapeIds: ["shape:a"], message: "x" }],
      svg: { bytes: 213_000 },
      shot: true,
      checkedAt: "2026-09-19T00:00:00.000Z",
    });
    expect(built).toEqual({
      shapes: 44,
      bindings: 12,
      lints: [{ rule: "overlap", shape: "shape:a", message: "x", severity: "error" }],
      svgBytes: 213_000,
      shot: true,
      at: "2026-09-19T00:00:00.000Z",
    });
  });

  /** A gate recorded before phase 4 carries none of the three new fields. */
  it("reads an older gate result without throwing", () => {
    expect(sideFromGate({ shapes: 3, svg: null, checkedAt: "x" })).toEqual({
      shapes: 3,
      bindings: null,
      lints: [],
      svgBytes: null,
      shot: false,
      at: "x",
    });
  });
});
