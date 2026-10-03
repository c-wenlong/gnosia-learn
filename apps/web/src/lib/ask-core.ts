/**
 * The Ask box's search (docs/proposals/home-page.md, part 1): what a query
 * matches among the concepts, courses, modules and videos, ranked by how it
 * matches each title.
 *
 * Pure and React-free, so the route and a test share it; `ask.ts` reads the
 * entries. Titles only: a summary or a transcript would match too much for a
 * box whose job is to find the thing you named, and the library's own search
 * already reads transcripts.
 */

export type AskKind = "concept" | "course" | "module" | "video";

export interface AskEntry {
  kind: AskKind;
  /** Unique across kinds: `concept:softmax`, `module:cs3230/m6`. */
  key: string;
  title: string;
  /** "CS3230", "CS3230 · Module 6", a concept's folder; null for none. */
  detail: string | null;
  href: string;
  /** More words the entry answers to: a course's code, a concept's slug. */
  aliases?: readonly string[];
}

/** Longest query the route reads; a pasted paragraph is not a title. */
export const MAX_ASK_QUERY = 200;

/** Lower case, accents folded, every run of anything but letters and digits one space. */
export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Kinds in the order a tie goes: what you learn, then where it is taught, then what to watch. */
const KIND_ORDER: Record<AskKind, number> = { concept: 0, module: 1, course: 2, video: 3 };

/**
 * How well `query` (normalized) matches `text` (normalized), or 0 for not at
 * all: the whole text, then its start, then the start of a word in it, then
 * every query word starting a word of the text in any order, then anywhere.
 */
function score(query: string, text: string): number {
  if (text === "" || query === "") return 0;
  if (text === query) return 100;
  if (text.startsWith(query)) return 80;
  if (` ${text}`.includes(` ${query}`)) return 60;
  const words = text.split(" ");
  const parts = query.split(" ");
  if (parts.every((part) => words.some((word) => word.startsWith(part)))) return 40;
  if (text.includes(query)) return 20;
  return 0;
}

/**
 * The best `limit` entries for `query`, best first. A query of fewer than two
 * characters matches nothing: one letter would list half the catalog.
 */
export function rankAsk(query: string, entries: readonly AskEntry[], limit = 8): AskEntry[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  return entries
    .map((entry) => ({
      entry,
      score: Math.max(score(q, normalize(entry.title)), ...(entry.aliases ?? []).map((a) => score(q, normalize(a)) - 1)),
    }))
    .filter((s) => s.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        KIND_ORDER[a.entry.kind] - KIND_ORDER[b.entry.kind] ||
        a.entry.title.length - b.entry.title.length ||
        a.entry.title.localeCompare(b.entry.title),
    )
    .slice(0, limit)
    .map((s) => s.entry);
}

/** Where a miss goes: a tutor chat on the text as typed. */
export function askTutorHref(query: string): string {
  return `/ask?q=${encodeURIComponent(query.trim().slice(0, MAX_ASK_QUERY))}`;
}
