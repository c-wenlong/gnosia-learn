/**
 * A runner's words as the studio shows them. Pure, so every studio module
 * shares one copy rather than each capitalising in its own way.
 */

/** The text trimmed, with a capital first. "" stays "". */
export function capitalised(text: string): string {
  const trimmed = text.trim();
  return trimmed === "" ? trimmed : trimmed[0]!.toUpperCase() + trimmed.slice(1);
}

/** The runner's refusal text as a sentence: a capital first, a full stop last. "" stays "". */
export function sentence(text: string): string {
  const capital = capitalised(text);
  if (capital === "") return capital;
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
}
