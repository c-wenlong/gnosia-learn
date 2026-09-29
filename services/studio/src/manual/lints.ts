/**
 * The nine lint rules, each with when it fires and what fixes it.
 *
 * The static half of the manual's lint section. The names are checked against
 * the installed tool's own list (the `getLints` entry of `canvas api --json`)
 * every time the manual is assembled, and the tool's list wins: a rule this
 * table does not know is printed with "no fix recorded", and a rule the tool
 * no longer has is left out, so the agent is never told about a rule that does
 * not exist (M2 of docs/STUDIO-CHAT-FIRST.md).
 *
 * `fires` is from tldrawkc's `docs/HELPERS.md`, shortened; `fix` is what a
 * snippet does about it, in the helpers' own vocabulary.
 */

export interface LintRule {
  name: string;
  /** `warn` prints and never reaches the exit code; `error` makes `run` and `inspect` exit 3. */
  severity: "error" | "warn";
  fires: string;
  fix: string;
}

export const LINT_RULES: readonly LintRule[] = [
  {
    name: "friendless-arrow",
    severity: "error",
    fires: "An arrow is not bound at one or both ends.",
    fix:
      "Draw every connection with `helpers.connect(from, to)`, which binds both ends. An axis, " +
      "tick or guide is `helpers.line` or `helpers.stub`, which mute this rule by default.",
  },
  {
    name: "arrow-crosses-shape",
    severity: "error",
    fires:
      "An arrow's path runs more than 4 units inside a shape that is neither of its two ends. " +
      "Containers and the arrow's own parent are exempt.",
    fix:
      "Move the shape out of the way with `translate`, change the ends with `start`/`end` " +
      "(`'top'`, `'bottom'`...), move the bend with `mid`, or use `kind: 'arc'` with a `bend` " +
      "that clears it. Put `meta: { lintIgnore: ['arrow-crosses-shape'] }` only on a marker the " +
      "arrow is meant to pass through.",
  },
  {
    name: "overlapping-text",
    severity: "error",
    fires: "The label boxes of two text-bearing shapes intersect.",
    fix:
      "Move one of them: widen the `gap`, or place a heading with `above`/`below` against what it " +
      "labels. An arrow label on top of a box means the gap is too short for the label.",
  },
  {
    name: "overlapping-shapes",
    severity: "error",
    fires:
      "Two geo shapes overlap by more than 10 percent of the smaller one. Containers from " +
      "`boxShapes` are skipped.",
    fix:
      "Place with `after`/`below` and a `gap`, or lay the shapes out with `row`, `column` or " +
      "`grid`. To group shapes, draw a container with `boxShapes`, never a plain box behind them.",
  },
  {
    name: "off-page",
    severity: "error",
    fires: "A shape sits more than 10000 units from the origin in any direction.",
    fix:
      "Bring it back beside the rest with `translate`. Something that far away is usually a " +
      "coordinate typo, and it shrinks every export to unreadable.",
  },
  {
    name: "empty-label",
    severity: "error",
    fires: "A geo shape has no text and no fill and is not a container, so it reads as an unexplained outline.",
    fix:
      "Give it a label, give it a `fill`, remove it with `helpers.remove`, or, if it groups " +
      "shapes, redraw it as a `boxShapes` container.",
  },
  {
    name: "unreadable-label",
    severity: "error",
    fires:
      "A word in the label is wider than the shape, or a line of it runs outside the outline " +
      "(diamonds, ellipses, triangles and hexagons pinch).",
    fix:
      "Widen the shape (`w`), use a `rectangle` rather than a `diamond` or `ellipse` for a long " +
      "label, or shorten the label. Keep the brief's words; add a note rather than cutting them.",
  },
  {
    name: "missing-glyph",
    severity: "warn",
    fires: "The label's font has no glyph for a character in it, so the reader's machine picks the typeface.",
    fix:
      "Set `font: 'sans'` on that shape for Greek letters; write set notation " +
      "(`⇒ ∈ ∉ ⊂ ∪ ∩ ∀ ∃ ∧ ∨ ∇`) out in words, since no bundled font has it.",
  },
  {
    name: "missing-topic",
    severity: "warn",
    fires: "The document names no topic, so the catalog cannot file it.",
    fix:
      "Run `meta set <doc> --topic <slug>` with the brief's topic, or `helpers.meta({ topic: '<slug>' })` " +
      "in a snippet. `new` with `--topic` avoids it.",
  },
];

/** The rule names of the static table, in its order. */
export const STATIC_LINT_NAMES: readonly string[] = LINT_RULES.map((rule) => rule.name);
