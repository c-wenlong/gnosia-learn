/**
 * The rules behind `Combobox`, React-free for the reason `filter-menu.ts` is
 * (AGENTS.md: a `"use client"` module's exports are client references).
 */

import type { FilterOption } from "./filter-menu";

/**
 * The suggestions for what is typed: every option whose label holds it,
 * ignoring case, the ones that start with it first and each group in the
 * list's own order. An empty field suggests everything. Matching anywhere in
 * the label rather than only at its start is what lets "sonnet" find
 * `anthropic/claude-sonnet-4`.
 */
export function suggestionsFor<V extends string>(options: readonly FilterOption<V>[], typed: string): FilterOption<V>[] {
  const query = typed.trim().toLowerCase();
  if (query === "") return [...options];
  const starts: FilterOption<V>[] = [];
  const holds: FilterOption<V>[] = [];
  for (const option of options) {
    const label = option.label.toLowerCase();
    if (label.startsWith(query)) starts.push(option);
    else if (label.includes(query)) holds.push(option);
  }
  return [...starts, ...holds];
}

/**
 * Where the highlight goes for an arrow, or null for any other key. Unlike
 * a listbox's, the highlight can be on no row at all (-1): that is the field
 * holding what was typed, so Enter takes the typed words and not a
 * suggestion. Down from the field goes to the first row and Up to the last;
 * past either end goes back to the field, as the ARIA combobox pattern's list
 * autocomplete does.
 */
export function nextSuggestion(key: string, index: number, count: number): number | null {
  if (count === 0 || (key !== "ArrowDown" && key !== "ArrowUp")) return null;
  if (key === "ArrowDown") return index >= count - 1 ? -1 : index + 1;
  return index < 0 ? count - 1 : index - 1;
}
