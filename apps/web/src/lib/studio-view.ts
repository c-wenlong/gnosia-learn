/**
 * What the browser screen shows, decided here and nowhere else.
 *
 * Pure: no database, no filesystem, no React, no `server-only`. Everything in
 * this file is a function of the runner's `/api/diagrams` answer and the query
 * string, which is what makes a filtered view a URL rather than a component's
 * private state — the Linear rule the research table adopted, and the thing
 * that makes the back button and a bookmark work.
 *
 * It is also where the tests live. `apps/web/src/app` and
 * `apps/web/src/components` are view code and untested by design, so the
 * grouping, the sorting, the chip facets and the freshness wording sit on this
 * side of the line rather than inside a page.
 */

/** Mirrors `services/studio/src/diagrams.ts`. Structural, not imported: the */
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
}

/* -------------------------------------------------------------------------- */
/* The view: everything Display and Sort decide, carried in the query string   */
/* -------------------------------------------------------------------------- */

export const GROUPINGS = ["none", "topic", "domain"] as const;
export const SORTS = ["modified", "title", "created"] as const;
export const DIRECTIONS = ["desc", "asc"] as const;
export const LAYOUTS = ["grid", "list"] as const;

export type Grouping = (typeof GROUPINGS)[number];
export type Sort = (typeof SORTS)[number];
export type Direction = (typeof DIRECTIONS)[number];
export type Layout = (typeof LAYOUTS)[number];

/** The chip that stands for "no topic at all". Always shown, always last. */
export const NO_TOPIC = "none";

export interface StudioView {
  /** Topic slugs, plus `none`. Multi-select, OR within itself. */
  topics: string[];
  query: string;
  group: Grouping;
  sort: Sort;
  direction: Direction;
  /** Display's "show concept chips". */
  chips: boolean;
  layout: Layout;
  /** The card filling the right panel, or null. */
  selected: string | null;
  /** The right panel itself. Collapsible from the strip. */
  panel: boolean;
}

export const DEFAULT_VIEW: StudioView = {
  topics: [],
  query: "",
  group: "none",
  sort: "modified",
  direction: "desc",
  chips: false,
  layout: "grid",
  selected: null,
  panel: true,
};

/** Next hands a repeated parameter as an array and a single one as a string. */
export type RawParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && first !== "" ? first : null;
}

function member<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function flag(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  return value !== "0" && value.toLowerCase() !== "false";
}

/**
 * Read the view out of the URL, forgiving anything it does not recognise.
 *
 * A hand-edited or stale query string is a thing a person typed, not an error:
 * an unknown `sort=colour` falls back to the default rather than throwing a 500
 * at someone who was experimenting with a link.
 */
export function parseView(params: RawParams): StudioView {
  const topics = (Array.isArray(params.topic) ? params.topic : [params.topic ?? ""])
    .flatMap((value) => (value ?? "").split(","))
    .map((slug) => slug.trim())
    .filter((slug) => slug !== "");
  return {
    topics: [...new Set(topics)],
    query: (one(params.q) ?? "").trim(),
    group: member(one(params.group), GROUPINGS, DEFAULT_VIEW.group),
    sort: member(one(params.sort), SORTS, DEFAULT_VIEW.sort),
    direction: member(one(params.dir), DIRECTIONS, DEFAULT_VIEW.direction),
    chips: flag(one(params.chips), DEFAULT_VIEW.chips),
    layout: member(one(params.view), LAYOUTS, DEFAULT_VIEW.layout),
    selected: one(params.sel),
    panel: flag(one(params.panel), DEFAULT_VIEW.panel),
  };
}

/**
 * `/studio?…` for a view with some of it changed.
 *
 * Only what differs from the default is written, so the common case is a bare
 * `/studio` and a shared link carries exactly the choices that were made.
 */
export function studioHref(view: StudioView, patch: Partial<StudioView> = {}): string {
  const next = { ...view, ...patch };
  const params = new URLSearchParams();
  if (next.topics.length > 0) params.set("topic", next.topics.join(","));
  if (next.query !== "") params.set("q", next.query);
  if (next.group !== DEFAULT_VIEW.group) params.set("group", next.group);
  if (next.sort !== DEFAULT_VIEW.sort) params.set("sort", next.sort);
  if (next.direction !== DEFAULT_VIEW.direction) params.set("dir", next.direction);
  if (next.chips !== DEFAULT_VIEW.chips) params.set("chips", next.chips ? "1" : "0");
  if (next.layout !== DEFAULT_VIEW.layout) params.set("view", next.layout);
  if (next.selected !== null) params.set("sel", next.selected);
  if (next.panel !== DEFAULT_VIEW.panel) params.set("panel", next.panel ? "1" : "0");
  const query = params.toString();
  return query === "" ? "/studio" : `/studio?${query}`;
}

/** Add or remove one topic chip, which is what clicking a chip means. */
export function toggleTopic(view: StudioView, slug: string): StudioView {
  const topics = view.topics.includes(slug)
    ? view.topics.filter((held) => held !== slug)
    : [...view.topics, slug];
  return { ...view, topics };
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
  diagrams: readonly Diagram[],
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

export function filterDiagrams(diagrams: readonly Diagram[], view: StudioView): Diagram[] {
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
const DAY = 24 * HOUR;

/**
 * `4 minutes ago`. Coarse on purpose: the grid is scanned, not read.
 *
 * Rendered on the server, which means it is the server's clock and it does not
 * tick. That is the right trade for a page that is a snapshot of a directory:
 * a relative time that silently drifts is worse than one that is accurate when
 * the page was drawn and has a real timestamp in the inspector beside it.
 */
export function relativeTime(iso: string | null, now: number = Date.now()): string {
  if (iso === null) return "never";
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "unknown";
  const delta = now - at;
  if (delta < MINUTE) return "just now";
  if (delta < HOUR) return plural(Math.round(delta / MINUTE), "minute");
  if (delta < DAY) return plural(Math.round(delta / HOUR), "hour");
  if (delta < 30 * DAY) return plural(Math.round(delta / DAY), "day");
  return new Date(at).toISOString().slice(0, 10);
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
 * It is derived from two file times and nothing else. The mirror is
 * cross-origin, so whether the tab has unsaved edits is unknowable from here
 * and is not guessed at; "the SVG is older than the document" is a fact about
 * disk, which is a different and checkable claim.
 */
export function freshness(state: SvgState): Freshness {
  switch (state) {
    case "missing":
      return {
        label: "No SVG",
        tone: "warn",
        title: "Nothing has been exported beside this document yet.",
      };
    case "stale":
      return {
        label: "SVG stale",
        tone: "warn",
        title: "The exported SVG is older than the document. Export it again to catch up.",
      };
    default:
      return {
        label: "SVG current",
        tone: "ok",
        title: "The exported SVG is at least as new as the document.",
      };
  }
}

/** `213 kB`, in the units the design's narration uses. */
export function formatBytes(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes)) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** `/studio/d/<name>`, the canvas route. */
export function canvasHref(name: string): string {
  return `/studio/d/${encodeURIComponent(name)}`;
}

/**
 * The thumbnail's `src`, through the studio's own proxy.
 *
 * Not `/api/assets/{id}/file`: that route is gated on `ASSET_FILES_ENABLED` as
 * well as on the asset being indexed, and an untopiced diagram is refused by
 * the indexer *by name*, so the tile that matters most would be the blank one.
 */
export function thumbnailHref(name: string): string {
  return `/studio/api/diagrams/${encodeURIComponent(name)}/svg`;
}
