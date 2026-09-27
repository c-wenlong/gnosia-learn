import { parse } from "yaml";

/**
 * Writing the three YAML shapes the export produces, by hand.
 *
 * A general YAML serialiser would round-trip the data, which is all parity
 * needs, but it would also restyle every file it touched: flow lists become
 * block lists, the blank line between topics goes, and the header and domain
 * dividers are lost, since comments are not data. The export is what a person
 * reads and diffs after the cut-over, and until then `catalog export --out .`
 * should leave `git diff` empty, so the files are written in the house style
 * they are authored in today (docs/CONTENT-MIGRATION.md edge case 8).
 *
 * Only scalars go through a rule, and the rule is checked rather than trusted:
 * a value is written plain when parsing it back gives the same string, and
 * double-quoted otherwise. JSON's escapes are a subset of YAML's double-quoted
 * ones, so `JSON.stringify` is a correct double-quoted scalar.
 */

/** Characters that change a plain scalar's meaning at its start. */
const INDICATOR_START = /^[-?:,[\]{}#&*!|>'"%@`\s]/;

/** A string as a YAML scalar in block context: `key: <here>` or `- <here>`. */
export function blockScalar(value: string): string {
  if (isPlainSafe(value, false)) return value;
  return JSON.stringify(value);
}

/** A string as a YAML scalar inside a flow collection: `[<here>, ...]`. */
export function flowScalar(value: string): string {
  if (isPlainSafe(value, true)) return value;
  return JSON.stringify(value);
}

function isPlainSafe(value: string, flow: boolean): boolean {
  if (value === "" || value !== value.trim()) return false;
  if (INDICATOR_START.test(value) || /[\n\r\t]/.test(value)) return false;
  if (value.includes(": ") || value.endsWith(":") || value.includes(" #")) return false;
  if (flow && /[,[\]{}]/.test(value)) return false;
  // The last word: whatever the rules above missed (`true`, `1.0`, `null`,
  // `~`), a parse that does not hand back the same string is not plain.
  try {
    const back = flow ? (parse(`[${value}]`) as unknown[])[0] : (parse(`k: ${value}`) as { k: unknown }).k;
    return back === value;
  } catch {
    return false;
  }
}

/** `[a, b, c]`, the style every short list in `content/` uses. */
export function flowList(values: readonly string[]): string {
  return `[${values.map(flowScalar).join(", ")}]`;
}

/** `{kind: broader, to: slug}`, one relation per line. */
export function flowMapping(entries: readonly (readonly [string, string])[]): string {
  return `{${entries.map(([key, value]) => `${key}: ${flowScalar(value)}`).join(", ")}}`;
}

/** Indentation by columns. */
export function pad(columns: number): string {
  return " ".repeat(columns);
}
