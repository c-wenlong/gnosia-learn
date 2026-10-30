import { dayDiff, weekdayName } from "@/lib/day-groups";
import { dayKey } from "@gnosia/tutor/days";
import { MASTERY_BUCKET_LABEL, type MasteryBucket } from "@gnosia/tutor/mastery-bucket";

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
  // The bucket's own name, so the menu says what the chips and the panel say.
  { key: "untouched", label: MASTERY_BUCKET_LABEL.untouched },
  // "Leech" is Anki's word and stays the key, the URL value and the catalog's
  // field; the reader sees what it means (the owner's call, 2026-09-29).
  { key: "leeches", label: "Keeps slipping" },
  // The two the map added (docs/proposals/knowledge-map.md, G5 and G8); the
  // table offers them too, since both views share one filter.
  { key: "ready", label: "Ready to learn" },
  { key: "nocourse", label: "Not in a course" },
];

/**
 * The map's legend (D9 of docs/proposals/domain-map.md): the groups a chip
 * over a domain's picture previews on hover and commits on a press. Each is a
 * Status filter, so a chip and the menu are one state; the other filters
 * (due, keeps slipping, not in a course) have no chip.
 */
export type LegendGroup = Extract<IndexFilter, "mastered" | "learning" | "untouched" | "ready">;

export const LEGEND_GROUPS: readonly { key: LegendGroup; label: string }[] = [
  { key: "mastered", label: MASTERY_BUCKET_LABEL.mastered },
  { key: "learning", label: MASTERY_BUCKET_LABEL.learning },
  { key: "untouched", label: MASTERY_BUCKET_LABEL.untouched },
  { key: "ready", label: "Ready to learn" },
];

/**
 * Which of `ids` (the concepts the picture shows) are in each group, a
 * concept ready to learn in its bucket's group as well. Counted over the rows
 * whatever the search, as the Status menu counts, so a chip's number does not
 * move as the learner types. An id with no row is skipped.
 */
export function legendMembers(
  ids: Iterable<string>,
  rows: ReadonlyMap<string, IndexRow>,
): Record<LegendGroup, string[]> {
  const out: Record<LegendGroup, string[]> = { mastered: [], learning: [], untouched: [], ready: [] };
  for (const id of ids) {
    const row = rows.get(id);
    if (row === undefined) continue;
    for (const g of LEGEND_GROUPS) if (matchesFilter(row, g.key)) out[g.key].push(id);
  }
  return out;
}

/** The filter a press on a chip leaves: its group, or all when it was the group already. */
export function legendPress(current: IndexFilter, group: LegendGroup): IndexFilter {
  return current === group ? "all" : group;
}

export type IndexView = "table" | "graph";
/**
 * What the table's side card shows: the selected concept's neighbourhood, or
 * its whole course. The map has no scope: it shows a domain or one of its
 * topics (docs/proposals/domain-map.md, D2).
 */
export type GraphScope = "neighbourhood" | "course";

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

export function parseScope(value: string | null | undefined): GraphScope {
  return value === "course" ? "course" : "neighbourhood";
}

/**
 * How a domain's picture is arranged (D11 of docs/proposals/domain-map.md):
 * in a group per topic, the default, or on axes, each concept by when it is
 * learnt and by how many concepts need it. A topic is always in groups.
 */
export type MapLayout = "groups" | "axes";

export function parseLayout(value: string | null | undefined): MapLayout {
  return value === "axes" ? "axes" : "groups";
}

/**
 * The query string for the index's state, keeping any other parameter already
 * there. The map is the default view, so only the table writes `view`; the
 * map writes its domain and topic (D2 of docs/proposals/domain-map.md) and
 * the table only a scope other than its own default, so a reload or a shared
 * link shows exactly what was on the screen. A domain on axes writes
 * `layout=axes` (D11); a topic, the cards and the table have no layout to say.
 */
export function indexSearch(
  state: {
    selected: string | null;
    view: IndexView;
    scope: GraphScope;
    filter: IndexFilter;
    domain: string | null;
    topic: string | null;
    layout?: MapLayout;
  },
  current = "",
): string {
  const params = new URLSearchParams(current);
  const set = (key: string, value: string | null) => (value === null ? params.delete(key) : params.set(key, value));
  const map = state.view === "graph";
  set("concept", state.selected);
  set("view", map ? null : state.view);
  set("scope", map || state.scope === "neighbourhood" ? null : state.scope);
  set("domain", map ? state.domain : null);
  set("topic", map && state.domain !== null ? state.topic : null);
  set("layout", map && state.domain !== null && state.topic === null && state.layout === "axes" ? "axes" : null);
  set("filter", state.filter === "all" ? null : state.filter);
  return params.toString();
}

/** Where "Open in the map" goes: the concept, which the page opens in its domain. */
export function conceptMapHref(slug: string): string {
  return `/learn?${new URLSearchParams({ concept: slug }).toString()}`;
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

const MONTH_DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

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
  const diff = dayDiff(today, day);
  if (diff < 0) return { label: "overdue", overdue: true };
  if (diff === 0) return { label: "today", overdue: false };
  if (diff === 1) return { label: "tomorrow", overdue: false };
  if (diff < 7) return { label: weekdayName(day), overdue: false };
  return { label: MONTH_DAY.format(new Date(`${day}T00:00:00Z`)), overdue: false };
}

/**
 * The Learn table's last-seen column, short for a narrow cell: "today",
 * "yesterday", "3 days", "5 weeks", a date, or "never". Home words the same
 * fact as a sentence (`lastSeenLabel` in `home-core.ts`, "3 days ago").
 */
export function seenAgo(lastSeen: string | null, now: Date = new Date(), timeZone?: string): string {
  if (lastSeen === null) return "never";
  const diff = dayDiff(dayKey(lastSeen, timeZone), dayKey(now, timeZone));
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
