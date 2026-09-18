import { describe, expect, it } from "vitest";

import {
  countRows,
  emptyLintLine,
  formatBytes,
  gitAddLine,
  lintLine,
  missingShotReason,
  shotSrc,
  signed,
  type Comparison,
  type ComparisonSide,
} from "@/lib/studio-compare";

/**
 * How the comparison reads, which is view code's share of phase 4.
 *
 * The numbers themselves are the runner's and are tested there. What is tested
 * here is the thing a panel gets wrong quietly: a missing before printed as a
 * delta of zero, an empty list printed as a blank box, or a `git add` line
 * naming something that did not land.
 */

const side = (patch: Partial<ComparisonSide> = {}): ComparisonSide => ({
  shapes: 10,
  bindings: 4,
  lints: [],
  svgBytes: 200_000,
  shot: true,
  at: "2026-09-19T00:00:00.000Z",
  ...patch,
});

const comparison = (patch: Partial<Comparison> = {}): Comparison => ({
  before: side(),
  after: side({ shapes: 14 }),
  fixed: [],
  added: [],
  beforeHash: null,
  refreshedAt: null,
  ...patch,
});

describe("the counts table", () => {
  it("shows before, after and a signed delta on every row", () => {
    const rows = countRows(comparison());
    expect(rows.map((row) => row.label)).toEqual(["shapes", "bindings", "SVG bytes"]);
    expect(rows[0]).toMatchObject({ before: "10", after: "14", delta: "+4", direction: "up" });
  });

  it("says no change rather than +0", () => {
    expect(countRows(comparison()).find((row) => row.label === "bindings")?.delta).toBe("no change");
  });

  /**
   * A first drawing has no previous version, so `+44` against nothing would be
   * a number that is not a comparison.
   */
  it("shows no delta at all when there is no before", () => {
    const rows = countRows(comparison({ before: null }));
    expect(rows[0]).toMatchObject({ before: "—", after: "14", delta: null, direction: "flat" });
  });

  it("formats a byte delta in bytes rather than as a raw count", () => {
    const rows = countRows(
      comparison({ before: side({ svgBytes: 200_000 }), after: side({ svgBytes: 213_000 }) }),
    );
    expect(rows.find((row) => row.label === "SVG bytes")?.delta).toBe("+13 kB");
  });

  it("reads a job whose checks have not run as an unknown after side", () => {
    const rows = countRows(comparison({ after: null }));
    expect(rows.every((row) => row.after === "—" && row.delta === null)).toBe(true);
  });
});

describe("formatting", () => {
  it("prints bytes the way a file manager does", () => {
    expect(formatBytes(940)).toBe("940 B");
    expect(formatBytes(213_000)).toBe("213 kB");
    expect(formatBytes(1_400_000)).toBe("1.4 MB");
    expect(formatBytes(null)).toBe("—");
  });

  it("uses a real minus sign on a decrease", () => {
    expect(signed(14, 10)).toBe("−4");
  });
});

describe("a lint row", () => {
  it("names the rule and the shape, without the tldraw prefix", () => {
    expect(lintLine({ rule: "overlap", shape: "shape:a1", message: "", severity: "error" })).toBe(
      "overlap · a1",
    );
  });

  it("names only the rule for a document-level finding", () => {
    expect(lintLine({ rule: "missing-topic", shape: null, message: "", severity: "warn" })).toBe(
      "missing-topic",
    );
  });
});

describe("an empty list, said in words", () => {
  it("distinguishes nothing new from nothing at all", () => {
    expect(emptyLintLine("added", comparison())).toContain("No new lints");
    expect(emptyLintLine("added", comparison({ before: null }))).toContain("No lints at all");
  });

  it("says a first drawing had nothing to fix", () => {
    expect(emptyLintLine("fixed", comparison({ before: null }))).toContain("no previous version");
  });
});

describe("the git add line", () => {
  it("names exactly the files that landed", () => {
    expect(gitAddLine(["learn/assets/x.tldr", "learn/assets/x.svg"])).toBe(
      "git add learn/assets/x.tldr learn/assets/x.svg",
    );
  });

  /** An accept whose export had failed lands one file, and the line says one. */
  it("names one file when one landed", () => {
    expect(gitAddLine(["learn/assets/x.tldr"])).toBe("git add learn/assets/x.tldr");
  });

  it("is nothing at all when nothing landed", () => {
    expect(gitAddLine([])).toBeNull();
  });
});

describe("a missing picture", () => {
  it("says a new diagram has no before, which is not a failure", () => {
    expect(missingShotReason("before", comparison({ before: null }), "new")).toContain("is new");
  });

  it("says an extend job's missing target is a different fact", () => {
    expect(missingShotReason("before", comparison({ before: null }), "extend")).toContain(
      "was not there",
    );
  });

  it("says a screenshot that did not happen did not happen", () => {
    expect(missingShotReason("after", comparison({ after: side({ shot: false }) }), "new")).toContain(
      "not written",
    );
  });
});

describe("where a picture comes from", () => {
  it("goes through the app's own studio proxy", () => {
    expect(shotSrc("job 1", "before")).toBe("/studio/api/jobs/job%201/shot?which=before");
  });
});
