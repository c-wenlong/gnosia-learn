import { dayKey } from "@/lib/days";
import type { MasteryBucket } from "@/lib/mastery-bucket";

/**
 * The Learn index's rows and the rules for filtering them, pure so they can be
 * tested and shared by the server (which computes the labels once, in the
 * learner's time zone) and the browser (which filters as the learner types).
 */

export type IndexFilter = "all" | "due" | "learning" | "mastered" | "untouched" | "leeches" | "ready" | "nocourse";

export const INDEX_FILTERS: readonly { key: IndexFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "due", label: "Due" },
  { key: "learning", label: "Learning" },
  { key: "mastered", label: "Mastered" },
  { key: "untouched", label: "Untouched" },
  // "Leech" is Anki's word and stays the key, the URL value and the catalog's
  // field; the reader sees what it means (the owner's call, 2026-09-29).
  { key: "leeches", label: "Keeps slipping" },
  // The two the map added (docs/proposals/knowledge-map.md, G5 and G8); the
  // table offers them too, since both views share one filter.
  { key: "ready", label: "Ready to learn" },
  { key: "nocourse", label: "Not in a course" },
];

export type IndexView = "table" | "graph";
/**
 * What a graph shows. The table's side card has two (the neighbourhood, or the
 * whole course); the map (docs/proposals/knowledge-map.md, G2) fits to one of
 * three: the selected concept's island, its neighbourhood, or every island of
 * its course.
 */
export type GraphScope = "neighbourhood" | "island" | "course";

/** One table row, every label already worked out on the server. */
export interface IndexRow {
  id: string;
  title: string;
  summary: string;
  bucket: MasteryBucket;
  pL: number;
  /** ISO instant, or null when no review is scheduled. */
  due: string | null;
  /** True when the review is due now or earlier. */
  isDue: boolean;
  dueLabel: string;
  overdue: boolean;
  lastSeenLabel: string;
  leech: boolean;
  /** "CP4281 M2", or null when the concept is in no course. */
  courseLabel: string | null;
  courses: string[];
  domain: string | null;
  /** Ready to learn in a course opened recently (G5 of docs/proposals/knowledge-map.md). */
  ready: boolean;
}

/**
 * The Status menu's options: every filter with how many concepts it shows,
 * counted over all rows (not the search), so a number does not move as the
 * learner types.
 */
export function statusFilterOptions(rows: readonly IndexRow[]): { value: IndexFilter; label: string; count: number }[] {
  return INDEX_FILTERS.map((f) => ({
    value: f.key,
    label: f.label,
    count: rows.filter((r) => matchesFilter(r, f.key)).length,
  }));
}

export function parseFilter(value: string | null | undefined): IndexFilter {
  return INDEX_FILTERS.some((f) => f.key === value) ? (value as IndexFilter) : "all";
}

/** The map is the default view (G1 of docs/proposals/knowledge-map.md); `view=table` opens the table. */
export function parseView(value: string | null | undefined): IndexView {
  return value === "table" ? "table" : "graph";
}

export function parseScope(value: string | null | undefined, view: IndexView): GraphScope {
  if (value === "course" || value === "neighbourhood") return value;
  if (view === "table") return "neighbourhood";
  // The map opens on the selected concept's island (G2). A link that wants the
  // course says `scope=course` (`courseGraphHref`).
  return "island";
}

/**
 * The query string for the index's state, keeping any other parameter already
 * there. The map is the default view, so only the table writes `view`; the map
 * always writes its scope and the table only a scope other than its own
 * default, so a reload or a shared link shows exactly what was on the screen.
 */
export function indexSearch(
  state: { selected: string | null; view: IndexView; scope: GraphScope; filter: IndexFilter },
  current = "",
): string {
  const params = new URLSearchParams(current);
  const set = (key: string, value: string | null) => (value === null ? params.delete(key) : params.set(key, value));
  set("concept", state.selected);
  set("view", state.view === "graph" ? null : state.view);
  set("scope", state.view === "graph" ? state.scope : state.scope === "neighbourhood" ? null : state.scope);
  set("filter", state.filter === "all" ? null : state.filter);
  return params.toString();
}

/** Where "Open full course graph" goes: the map, fitted to every island of the concept's course. */
export function courseGraphHref(slug: string): string {
  return `/learn?${new URLSearchParams({ concept: slug, view: "graph", scope: "course" }).toString()}`;
}

export function matchesFilter(row: IndexRow, filter: IndexFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "due":
      return row.isDue;
    case "leeches":
      return row.leech;
    case "ready":
      return row.ready;
    case "nocourse":
      return row.courses.length === 0;
    default:
      return row.bucket === filter;
  }
}

/** Case-insensitive, every word somewhere in the title, the summary or the slug. */
export function matchesQuery(row: IndexRow, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = `${row.title} ${row.summary} ${row.id}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const MONTH_DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Whole days from `from` to `to`, both day keys. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * When a review falls due, the way the hi-fi says it: "overdue" for a day
 * already gone, "today", "tomorrow", a weekday within the week, then a date.
 * Counted in calendar days in `timeZone`, so a card due at 23:00 is "today"
 * all day rather than turning "overdue" at an hour nobody sees.
 */
export function dueLabel(
  due: string | null,
  now: Date = new Date(),
  timeZone?: string,
): { label: string; overdue: boolean } {
  if (due === null) return { label: "–", overdue: false };
  const today = dayKey(now, timeZone);
  const day = dayKey(due, timeZone);
  const diff = daysBetween(today, day);
  if (diff < 0) return { label: "overdue", overdue: true };
  if (diff === 0) return { label: "today", overdue: false };
  if (diff === 1) return { label: "tomorrow", overdue: false };
  const at = new Date(`${day}T00:00:00Z`);
  if (diff < 7) return { label: WEEKDAY.format(at), overdue: false };
  return { label: MONTH_DAY.format(at), overdue: false };
}

/** "today", "yesterday", "3 days", "5 weeks", or "never". */
export function lastSeenLabel(lastSeen: string | null, now: Date = new Date(), timeZone?: string): string {
  if (lastSeen === null) return "never";
  const diff = daysBetween(dayKey(lastSeen, timeZone), dayKey(now, timeZone));
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 28) return `${diff} days`;
  if (diff < 120) return `${Math.floor(diff / 7)} weeks`;
  return MONTH_DAY.format(new Date(`${dayKey(lastSeen, timeZone)}T00:00:00Z`));
}

/** The counts line under the title, in the mastery buckets the dots use. */
export function bucketCounts(rows: readonly { bucket: MasteryBucket }[]): Record<MasteryBucket, number> {
  const out: Record<MasteryBucket, number> = { mastered: 0, learning: 0, untouched: 0 };
  for (const r of rows) out[r.bucket] += 1;
  return out;
}
