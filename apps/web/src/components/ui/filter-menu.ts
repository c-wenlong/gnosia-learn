/**
 * The option model behind `FilterMenu`, React-free so a test can call it and
 * a server component can build the options it hands to one (AGENTS.md: a
 * `"use client"` module's exports are client references, functions included).
 *
 * A filter menu is one URL-or-state value chosen from a short list. The first
 * option is the "All" choice by convention: picking it is how a filter is
 * cleared, so there is no separate clear button to find.
 */

/** One row in a filter menu's listbox. */
export interface FilterOption<V extends string = string> {
  value: V;
  /** The row's text, and what typeahead matches against. */
  label: string;
  /** What the trigger prints for this option when it differs from `label`: "All" for "All kinds". */
  short?: string;
  /** Printed muted at the right of the row: how many things picking it shows. */
  count?: number;
  /** A muted second line under the label, for what a short label stands for. */
  detail?: string;
  /** Shown but not pickable — a tier the harness has no model for, said so on the row. */
  disabled?: boolean;
  /**
   * The heading of the section this row sits in. Consecutive options with the
   * same section are one group; an option with none sits in the unheaded
   * group at the top.
   */
  section?: string;
}

/** Options split into runs that share a section, in order. */
export interface FilterSection<V extends string = string> {
  heading: string | null;
  /** The options, each with its index in the flat list (the keyboard walks that list). */
  options: { option: FilterOption<V>; index: number }[];
}

export function sectionsOf<V extends string>(options: readonly FilterOption<V>[]): FilterSection<V>[] {
  const out: FilterSection<V>[] = [];
  options.forEach((option, index) => {
    const heading = option.section ?? null;
    const last = out.at(-1);
    if (last !== undefined && last.heading === heading) last.options.push({ option, index });
    else out.push({ heading, options: [{ option, index }] });
  });
  return out;
}

/**
 * "Type: Video", or "Type: All" for the default. A value that matches no
 * option prints as itself, so a hand-typed URL still says what it filtered on.
 */
export function triggerText<V extends string>(label: string, options: readonly FilterOption<V>[], value: V): string {
  return `${label}: ${valueText(options, value)}`;
}

/** The chosen option's text alone, for a trigger that sits beside its own label. */
export function valueText<V extends string>(options: readonly FilterOption<V>[], value: V): string {
  const chosen = options.find((o) => o.value === value);
  return chosen === undefined ? value : (chosen.short ?? chosen.label);
}

/**
 * Where the highlight goes for a navigation key, or null for a key that is not
 * one. Arrows stop at the ends rather than wrapping, as the ARIA listbox
 * pattern's default does; Home and End jump there.
 */
export function nextIndexForKey(key: string, index: number, count: number): number | null {
  if (count === 0) return null;
  const last = count - 1;
  switch (key) {
    case "ArrowDown":
      return index < 0 ? 0 : Math.min(index + 1, last);
    case "ArrowUp":
      return index < 0 ? last : Math.max(index - 1, 0);
    case "Home":
    case "PageUp":
      return 0;
    case "End":
    case "PageDown":
      return last;
    default:
      return null;
  }
}

/**
 * Typeahead: the option a typed prefix lands on, or null when none matches.
 *
 * `buffer` is everything typed since the last pause. One character, or the
 * same character repeated, moves to the *next* option starting with it after
 * `from`, wrapping, so pressing C again walks CP4281, CS3216, CS4248. A longer
 * prefix ("cs4") matches from the current option on, so the highlight stays
 * put while the prefix still fits it. Case-insensitive.
 */
export function typeaheadIndex(labels: readonly string[], from: number, buffer: string): number | null {
  const typed = buffer.toLowerCase();
  if (typed === "" || labels.length === 0) return null;
  const repeated = [...typed].every((c) => c === typed[0]);
  const prefix = repeated ? typed[0] : typed;
  const start = repeated ? from + 1 : Math.max(from, 0);
  for (let step = 0; step < labels.length; step += 1) {
    const i = (((start + step) % labels.length) + labels.length) % labels.length;
    if (labels[i].toLowerCase().startsWith(prefix)) return i;
  }
  return null;
}
