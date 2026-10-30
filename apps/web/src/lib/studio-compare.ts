/**
 * What the comparison screen shows, decided here and nowhere else.
 *
 * Pure, the same way `studio-jobs.ts` and `studio-view.ts` are pure: no React,
 * no fetch. The panel is view code and untested by design, so the counts table
 * and the wording of an empty list live on this side of the line where they
 * can be a test.
 *
 * **Nothing here computes the comparison.** The runner did that, from the two
 * `inspect --json` runs it made, and it is on the job record — so this file
 * formats numbers and never derives one. The one thing it must not do is invent
 * a delta from a picture: the two PNGs are what a person looks at, and every
 * number beside them comes from the tool.
 */

import { formatBytes } from "@gnosia/tutor/asset-meta";

/** Mirrors `services/studio/src/diagram/compare.ts`. Structural, not imported. */
export interface LintRef {
  rule: string;
  shape: string | null;
  message: string;
  severity: "error" | "warn";
}

export interface ComparisonSide {
  shapes: number | null;
  bindings: number | null;
  lints: LintRef[];
  svgBytes: number | null;
  shot: boolean;
  at: string;
}

export interface Comparison {
  before: ComparisonSide | null;
  after: ComparisonSide | null;
  fixed: LintRef[];
  added: LintRef[];
  beforeHash: string | null;
  refreshedAt: string | null;
}

/* -------------------------------------------------------------------------- */
/* The counts table                                                           */
/* -------------------------------------------------------------------------- */

export interface CountRow {
  label: string;
  before: string;
  after: string;
  /** The signed delta, or null when one side does not have the number. */
  delta: string | null;
  /** Which way it moved, for the colour. `flat` covers zero and unknown. */
  direction: "up" | "down" | "flat";
}

/** `214 kB`, `1.4 MB`, as the library and the inspector size a file, or `—` with no size. */
function sizeText(bytes: number | null | undefined): string {
  return (typeof bytes === "number" ? formatBytes(bytes) : null) ?? "—";
}

function formatCount(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "—";
}

/**
 * A delta with its sign, and nothing when there is no honest one to show.
 *
 * A missing before is not a delta of zero: a first drawing has no previous
 * version, and `+44` against nothing would say a number that is not a
 * comparison. Null, and the row prints a dash.
 */
export function signed(
  before: number | null | undefined,
  after: number | null | undefined,
  format: (value: number | null) => string = formatCount,
): string | null {
  if (typeof before !== "number" || typeof after !== "number") return null;
  const difference = after - before;
  if (difference === 0) return "no change";
  return `${difference > 0 ? "+" : "−"}${format(Math.abs(difference))}`;
}

function direction(before: number | null | undefined, after: number | null | undefined): CountRow["direction"] {
  if (typeof before !== "number" || typeof after !== "number" || before === after) return "flat";
  return after > before ? "up" : "down";
}

/**
 * The design's three-row table: shapes, bindings, SVG bytes, with before, after
 * and the signed delta.
 *
 * Every number comes from the two `inspect` results the runner stored, which is
 * what "an honest shape delta" means: not from the two pictures, which cannot
 * be counted, and not from the agent, which is describing its own work.
 */
export function countRows(comparison: Comparison): CountRow[] {
  const before = comparison.before;
  const after = comparison.after;
  return [
    {
      label: "shapes",
      before: formatCount(before?.shapes),
      after: formatCount(after?.shapes),
      delta: signed(before?.shapes, after?.shapes),
      direction: direction(before?.shapes, after?.shapes),
    },
    {
      label: "bindings",
      before: formatCount(before?.bindings),
      after: formatCount(after?.bindings),
      delta: signed(before?.bindings, after?.bindings),
      direction: direction(before?.bindings, after?.bindings),
    },
    {
      label: "SVG bytes",
      before: sizeText(before?.svgBytes),
      after: sizeText(after?.svgBytes),
      delta: signed(before?.svgBytes, after?.svgBytes, sizeText),
      direction: direction(before?.svgBytes, after?.svgBytes),
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* The lint lists                                                             */
/* -------------------------------------------------------------------------- */

/** One row of the Fixed or New list: the rule, and the shape it names. */
export function lintLine(ref: LintRef): string {
  return ref.shape === null ? ref.rule : `${ref.rule} · ${ref.shape.replace(/^shape:/, "")}`;
}

/**
 * What an empty list says, in words rather than as a blank box.
 *
 * The design asks for this about New specifically — "an empty New list is said
 * in words" — and the same reasoning covers Fixed: a heading with nothing under
 * it reads as a list that failed to load.
 */
export function emptyLintLine(which: "fixed" | "added", comparison: Comparison): string {
  const hadBefore = comparison.before !== null;
  if (which === "added") {
    return hadBefore
      ? "No new lints: nothing the previous version was clean about is broken now."
      : "No lints at all on what was drawn.";
  }
  return hadBefore
    ? "Nothing was fixed: every lint the previous version had is still there."
    : "Nothing to fix: this diagram had no previous version.";
}

/* -------------------------------------------------------------------------- */
/* After an accept                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The last catalog failure, short enough to read inside a 320px banner.
 *
 * The runner records the whole of what the CLI printed, which is right — it is
 * the record, and a truncated one helps nobody at three in the morning. What a
 * banner needs is the first line of it. The real thing a Postgres that is down
 * produces here is a command echo followed by four lines of pretty-printed JSON
 * whose `error` is the empty string, and six lines of that drowns the sentence
 * above it that says what actually happened.
 *
 * Collapsed to one line and capped. The full text is on the record and in the
 * element's `title`, so nothing is lost, and `catalogErrors` is a list the panel
 * reads the newest of rather than printing all twenty.
 */
export function catalogErrorLine(errors: readonly string[] | undefined, cap = 140): string | null {
  const last = (errors ?? []).at(-1);
  if (last === undefined || last.trim() === "") return null;
  const flat = last.replace(/\s+/g, " ").trim();
  return flat.length <= cap ? flat : `${flat.slice(0, cap - 1)}…`;
}

/**
 * Why there is no before picture, said as the reason rather than as a blank.
 *
 * Two different facts, and conflating them would hide the interesting one. A
 * job in `new` mode had nothing to photograph, which is normal. A job that had
 * a target and still has no picture means the screenshot did not happen, which
 * is worth saying out loud.
 */
export function missingShotReason(
  which: "before" | "after",
  comparison: Comparison,
  mode: string | undefined,
): string {
  if (which === "before") {
    if (comparison.before === null) {
      return mode === "extend"
        ? "The committed file was not there when this job started."
        : "This diagram is new, so there is no before.";
    }
    return "The before screenshot was not written.";
  }
  if (comparison.after === null) return "The checks have not run yet.";
  return "The after screenshot was not written.";
}
