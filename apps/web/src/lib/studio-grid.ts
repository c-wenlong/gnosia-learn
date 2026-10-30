/**
 * What the browser screen shows of the diagrams, decided here and nowhere
 * else: the runner's `/api/diagrams` shapes, the chip facets, filtering,
 * sorting, grouping, and the time, freshness and size wording.
 *
 * Pure: no database, no filesystem, no React, no `server-only`.
 * `apps/web/src/app` and `apps/web/src/components` are view code and untested
 * by design, so these judgements sit on this side of the line rather than
 * inside a page. The view they read is `studio-url.ts`'s.
 */

import { dayLabel, timeOfDay } from "@/lib/day-groups";
import { dayKey } from "@gnosia/tutor/days";
import { NO_TOPIC, type KindFilter, type StudioView } from "@/lib/studio-url";

export { formatBytes } from "@gnosia/tutor/asset-meta";

/** Mirrors `services/studio/src/canvas/diagrams.ts`. Structural, not imported: the */
/* two packages do not depend on each other and a shared type would need a third. */
export type SvgState = "current" | "stale" | "missing";

export interface DiagramFile {
  path: string;
  exists: boolean;
  modified: string | null;
  bytes: number | null;
}

export interface Diagram {
  name: string;
  tldr: DiagramFile;
  svg: DiagramFile;
  title: string | null;
  topic: string | null;
  concepts: string[];
  source: string | null;
  shapes: number;
  created: string | null;
  svgState: SvgState;
  /** The diagram's latest revision in the database. Optional: an older runner does not send it. */
  revision?: number | null;
  /**
   * Where the diagram's checkout stands, on a single diagram's read: the file
   * the canvas edits, and whether it holds edits nobody committed.
   */
  checkout?: { path: string; revision: number | null; dirty: boolean; behind: boolean } | null;
}

export interface DiagramProblem {
  name: string;
  path: string;
  message: string;
}

export interface DiagramListing {
  dir: string;
  diagrams: Diagram[];
  errors: DiagramProblem[];
  counts: { total: number; withTopic: number; unreadable: number };
  /** True when the catalog could not be read and this is the runner's copy from `readAt` (D13). */
  stale?: boolean;
  readAt?: string;
}

/* -------------------------------------------------------------------------- */
/* Filtering, sorting and grouping                                            */
/* -------------------------------------------------------------------------- */

export interface TopicChip {
  slug: string;
  label: string;
  domain: string | null;
  count: number;
}

/**
 * The chips: the topics that appear in this directory, not the whole vocabulary.
 *
 * `No topic` is always last and always present, even at zero, because its
 * absence is the thing worth noticing — a corpus with nothing untopiced should
 * say so rather than leave a person wondering whether the filter exists.
 */
export function topicChips(
  /** Anything with a topic: the diagrams, and the studio videos beside them. */
  diagrams: readonly Pick<Diagram, "topic">[],
  titles: ReadonlyMap<string, string> = new Map(),
  domains: ReadonlyMap<string, string> = new Map(),
): TopicChip[] {
  const counts = new Map<string, number>();
  let untopiced = 0;
  for (const diagram of diagrams) {
    if (diagram.topic === null) untopiced += 1;
    else counts.set(diagram.topic, (counts.get(diagram.topic) ?? 0) + 1);
  }
  const chips = [...counts.entries()]
    .map(([slug, count]) => ({
      slug,
      label: titles.get(slug) ?? slug,
      domain: domains.get(slug) ?? null,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return [...chips, { slug: NO_TOPIC, label: "No topic", domain: null, count: untopiced }];
}

/** The title a card shows: the stamped one, else the filename stem. */
export function displayTitle(diagram: Diagram): string {
  return diagram.title ?? diagram.name;
}

function matchesQuery(diagram: Diagram, query: string): boolean {
  if (query === "") return true;
  const needle = query.toLowerCase();
  return [diagram.name, diagram.title ?? "", diagram.topic ?? "", ...diagram.concepts].some((field) =>
    field.toLowerCase().includes(needle),
  );
}

/** Whether the kind filter lets a diagram or a video through. Job cards follow it too. */
export function showsKind(filter: KindFilter, kind: "diagram" | "video"): boolean {
  return filter === "all" || filter === kind;
}

export function filterDiagrams(diagrams: readonly Diagram[], view: Pick<StudioView, "query" | "topics"> & { kind?: KindFilter }): Diagram[] {
  if (!showsKind(view.kind ?? "all", "diagram")) return [];
  return diagrams.filter((diagram) => {
    if (!matchesQuery(diagram, view.query)) return false;
    if (view.topics.length === 0) return true;
    return diagram.topic === null
      ? view.topics.includes(NO_TOPIC)
      : view.topics.includes(diagram.topic);
  });
}

/**
 * Undated sorts last whichever way the arrow points.
 *
 * Reversing the whole list instead would float the undated ones to the top on
 * one of the two directions, which reads as "these are the newest" about files
 * whose only property is that nobody recorded a time for them.
 */
function timeCompare(a: string | null, b: string | null, sign: number): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return sign * (Date.parse(a) - Date.parse(b));
}

export function sortDiagrams(diagrams: readonly Diagram[], view: StudioView): Diagram[] {
  const sign = view.direction === "asc" ? 1 : -1;
  return [...diagrams].sort((a, b) => {
    switch (view.sort) {
      case "title":
        return sign * displayTitle(a).localeCompare(displayTitle(b));
      case "created":
        return timeCompare(a.created, b.created, sign);
      default:
        return timeCompare(a.tldr.modified, b.tldr.modified, sign);
    }
  });
}

export interface DiagramGroup {
  key: string;
  label: string;
  items: Diagram[];
}

/**
 * Group by nothing, by topic, or by domain.
 *
 * `none` is one unlabelled group rather than a special case downstream, so the
 * grid renders one code path whatever Display says.
 */
export function groupDiagrams(
  diagrams: readonly Diagram[],
  view: StudioView,
  titles: ReadonlyMap<string, string> = new Map(),
  domains: ReadonlyMap<string, string> = new Map(),
): DiagramGroup[] {
  if (view.group === "none") return [{ key: "all", label: "", items: [...diagrams] }];

  const byTopic = view.group === "topic";
  const groups = new Map<string, DiagramGroup>();
  for (const diagram of diagrams) {
    const domain = diagram.topic === null ? undefined : domains.get(diagram.topic);
    const key = byTopic ? (diagram.topic ?? NO_TOPIC) : (domain ?? NO_TOPIC);
    const missing = byTopic ? "No topic" : "No domain";
    const label = key === NO_TOPIC ? missing : byTopic ? (titles.get(key) ?? key) : key;
    const held = groups.get(key);
    if (held === undefined) groups.set(key, { key, label, items: [diagram] });
    else held.items.push(diagram);
  }
  // `No topic` last for the same reason its chip is: it is the exception, and
  // an exception reads better at the end of a list than sorted into it.
  return [...groups.values()].sort((a, b) => {
    if (a.key === NO_TOPIC) return 1;
    if (b.key === NO_TOPIC) return -1;
    return a.label.localeCompare(b.label);
  });
}

/* -------------------------------------------------------------------------- */
/* Words                                                                       */
/* -------------------------------------------------------------------------- */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * `4 minutes ago`, `Yesterday`, `3 Oct`. Coarse on purpose: the grid is scanned,
 * not read.
 *
 * Days are calendar days in `timeZone` (the runtime's own when omitted, which
 * is the browser's in a client component), the rule the sidebar's Recent and
 * the Library's day groups use, so the three never disagree: something made
 * 37 hours ago is "Yesterday", not "2 days ago". Within today it counts
 * minutes and hours; older than yesterday it names the day, with the year
 * when it is not this year.
 *
 * Rendered on the server, which means it is the server's clock and it does not
 * tick. That is the right trade for a page that is a snapshot of a directory:
 * a relative time that silently drifts is worse than one that is accurate when
 * the page was drawn and has a real timestamp in the inspector beside it.
 */
export function relativeTime(iso: string | null, now: number = Date.now(), timeZone?: string): string {
  if (iso === null) return "never";
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "unknown";
  const delta = now - at;
  if (delta < MINUTE) return "just now";
  const today = dayKey(new Date(now), timeZone);
  const day = dayKey(new Date(at), timeZone);
  if (day === today) {
    return delta < HOUR ? plural(Math.round(delta / MINUTE), "minute") : plural(Math.round(delta / HOUR), "hour");
  }
  return dayWords(day, today);
}

/** "Yesterday" for the day before `today`, else the day label ("3 Oct"); both are day keys. */
function dayWords(day: string, today: string): string {
  const next = new Date(`${day}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10) === today ? "Yesterday" : dayLabel(day, today);
}

/**
 * An instant as a day, in `timeZone`: "Today", "Yesterday" or "30 Sept". For
 * the panel's Created line, where a UTC date used to disagree with the Library.
 */
export function dayText(iso: string | null, now: number = Date.now(), timeZone?: string): string {
  if (iso === null) return "not recorded";
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "unknown";
  const today = dayKey(new Date(now), timeZone);
  const day = dayKey(new Date(at), timeZone);
  return day === today ? "Today" : dayWords(day, today);
}

/** The day and clock time of an instant, "30 Sept, 10:25", in `timeZone`; "" when it does not parse. */
export function dayAndTime(iso: string | null, now: number = Date.now(), timeZone?: string): string {
  if (iso === null || !Number.isFinite(Date.parse(iso))) return "";
  const time = timeOfDay(iso, timeZone);
  const day = dayLabel(dayKey(new Date(iso), timeZone), dayKey(new Date(now), timeZone));
  return time === null ? day : `${day}, ${time}`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"} ago`;
}

export interface Freshness {
  label: string;
  tone: "ok" | "warn";
  /** The sentence the pill's title attribute carries. */
  title: string;
}

/**
 * The freshness pill, in the two words D13 leaves the studio able to say.
 *
 * It is derived from two hashes the database keeps: the document's, and the
 * one the stored SVG was exported from (Track D of docs/CONTENT-MIGRATION.md).
 * The mirror is cross-origin, so whether the tab has unsaved edits is
 * unknowable from here and is not guessed at.
 */
export function freshness(state: SvgState): Freshness {
  switch (state) {
    case "missing":
      return {
        label: "No SVG",
        tone: "warn",
        title: "No SVG has been exported from this diagram yet.",
      };
    case "stale":
      return {
        label: "SVG stale",
        tone: "warn",
        title: "The stored SVG was exported from an earlier version of the document. Export it again to catch up.",
      };
    default:
      return {
        label: "SVG current",
        tone: "ok",
        title: "The stored SVG was exported from this version of the document.",
      };
  }
}
