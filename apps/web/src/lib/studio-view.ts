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
  /**
   * The job whose panel is open, or null for the inspector.
   *
   * In the URL for the same reason the filters are: the panel holds one of
   * several things (a tile's panel, a conversation, one job) and which one is
   * showing is a thing a person navigates to and back from. It is not job
   * *state*: the runner holds that, and this is a pointer at it.
   */
  job: string | null;
  /**
   * The diagram an Extend press is opening a conversation on, by name, while
   * the runner checks it out and inspects it (docs/STUDIO-CHAT-FIRST.md,
   * "Extend from a tile"). A pointer at a request in flight, not at a draft:
   * once the draft exists the panel moves to `?draft=` and this is dropped.
   */
  extend: string | null;
  /**
   * The Extend press came from Talk it through on a failed job (`&talk=1`),
   * so it sends no opener, whatever storage does or does not hold: the
   * person writes the first turn. In the URL rather than in storage so a
   * browser with no storage cannot turn it into a paid turn nobody asked
   * for. Meaningless without `extend`, and dropped with it.
   */
  talk: boolean;
  /**
   * Whether the job panel may open an event stream at all.
   *
   * `?stream=off` forces the polling fallback that a dropped connection would
   * reach on its own. D8 says the polled `GET` is the record and the stream is
   * a cache, which is only a claim until somebody can turn the cache off and
   * watch the screen stay correct. This is how that is checked by hand, and it
   * is why the fallback is not a path that only runs when something breaks.
   */
  stream: boolean;
  /**
   * Which of the open job's two screenshots fills the main area, or null.
   *
   * The design's finished panel says "clicking either opens it full width in
   * the main area", and that is a place a person can be, so it is in the URL
   * beside `?job=` rather than in a component's state: the back button closes
   * it, and a link to a picture is a link somebody can send. It means nothing
   * without a job, and `shotHref` drops it when the job panel closes.
   */
  shot: "before" | "after" | null;
  /**
   * The conversation open in the panel, by draft id (docs/STUDIO-CHAT-FIRST.md).
   *
   * In the URL so a reload returns to it. With `job` beside it the panel shows
   * that job with a bar back to the conversation, which is where Draw leads.
   */
  draft: string | null;
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
  job: null,
  extend: null,
  talk: false,
  stream: true,
  shot: null,
  draft: null,
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
    ...parsePanel(params),
  };
}

/**
 * The parameters that decide what the panel holds.
 *
 * Split out of `parseView` because the canvas route needs them and does not
 * have a view: `/studio/d/<name>` has no filters, no sort and no selection, and
 * a job started from the canvas has to be visible there too.
 */
export function parsePanel(
  params: RawParams,
): Pick<StudioView, "job" | "extend" | "talk" | "stream" | "shot" | "draft"> {
  const shot = one(params.shot);
  const job = one(params.job);
  return {
    job,
    extend: one(params.extend),
    talk: one(params.extend) !== null && one(params.talk) === "1",
    stream: (one(params.stream) ?? "on") !== "off",
    // A picture belongs to a job, so `?shot=after` on its own names nothing and
    // is read as nothing rather than as a main area that cannot say whose
    // screenshot it is showing.
    shot: job !== null && (shot === "before" || shot === "after") ? shot : null,
    draft: one(params.draft),
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
  if (next.job !== null) params.set("job", next.job);
  if (next.extend !== null) params.set("extend", next.extend);
  if (next.extend !== null && next.talk) params.set("talk", "1");
  if (next.draft !== null) params.set("draft", next.draft);
  if (!next.stream) params.set("stream", "off");
  if (next.shot !== null && next.job !== null) params.set("shot", next.shot);
  const query = params.toString();
  return query === "" ? "/studio" : `/studio?${query}`;
}

/**
 * The panel's parameters, patched onto any path.
 *
 * `studioHref` rebuilds `/studio` from a whole view, which the canvas route
 * cannot use: it has a name in its path and only these in its query. Both
 * screens open a job panel with the same links, so the patch is written once
 * and takes the path it is given.
 */
export function panelHref(
  path: string,
  patch: {
    job?: string | null;
    extend?: string | null;
    talk?: boolean;
    shot?: "before" | "after" | null;
    draft?: string | null;
    selected?: string | null;
  },
): string {
  const [base, existing] = path.split("?");
  const params = new URLSearchParams(existing ?? "");
  if (patch.draft !== undefined) {
    if (patch.draft === null) params.delete("draft");
    else params.set("draft", patch.draft);
  }
  if (patch.selected !== undefined) {
    if (patch.selected === null) params.delete("sel");
    else params.set("sel", patch.selected);
  }
  if (patch.job !== undefined) {
    if (patch.job === null) params.delete("job");
    else params.set("job", patch.job);
  }
  if (patch.extend !== undefined) {
    if (patch.extend === null) params.delete("extend");
    else params.set("extend", patch.extend);
    // A new press, or none, is not the Talk it through one unless it says so.
    if (patch.talk !== true) params.delete("talk");
  }
  if (patch.talk === true && params.get("extend") !== null) params.set("talk", "1");
  if (patch.talk === false) params.delete("talk");
  if (params.get("extend") === null) params.delete("talk");
  if (patch.shot !== undefined) {
    if (patch.shot === null) params.delete("shot");
    else params.set("shot", patch.shot);
  }
  // A picture belongs to one job, so anything that changes which job the panel
  // is about takes the picture with it: closing the panel, opening a
  // conversation over it, or following a Resume to the job it queued. Only a
  // patch that names a picture keeps one, which is the link that opens it.
  if (patch.shot === undefined && (patch.job !== undefined || patch.extend != null)) {
    params.delete("shot");
  }
  if (params.get("job") === null) params.delete("shot");
  // A stale verb outcome pinned beside a newly opened panel would read as
  // something the panel did, so opening one drops it.
  for (const key of ["v", "ok", "m"]) params.delete(key);
  const query = params.toString();
  return query === "" ? (base ?? "/studio") : `${base ?? "/studio"}?${query}`;
}

/**
 * The conversation a job came from, from wherever the job is showing.
 *
 * The conversation panel lives on `/studio` only, so from the canvas route
 * this leaves for the grid rather than patching a path that has no panel for
 * a draft. On `/studio` it keeps the filters and swaps the panel.
 */
export function conversationHref(path: string, draftId: string): string {
  const [base] = path.split("?");
  const from = base === "/studio" ? path : "/studio";
  return panelHref(from, { draft: draftId, job: null, selected: null, extend: null });
}

/**
 * An Extend press on `name`, from wherever a person is: on `/studio` it keeps
 * the filters and swaps the panel, and from the canvas route it goes to the
 * grid, where the Extend panel lives.
 */
export function extendFromHref(path: string, name: string, options: { talk?: boolean } = {}): string {
  const [base] = path.split("?");
  const from = base === "/studio" ? path : "/studio";
  return panelHref(from, { extend: name, talk: options.talk === true, draft: null, job: null, selected: null });
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

/** `213 kB`, in the units the design's narration uses. */
export function formatBytes(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes)) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* -------------------------------------------------------------------------- */
/* What a verb did, carried back to the page that asked                        */
/* -------------------------------------------------------------------------- */

export interface VerbReport {
  verb: string;
  ok: boolean;
  headline: string;
  detail: string | null;
}

/** The cap on a message put in a URL. A stack trace does not belong in one. */
const MESSAGE_LIMIT = 300;

/**
 * Add a verb's outcome to a path, so the redirect after a form carries it.
 *
 * A server action that simply revalidated left a failed export looking exactly
 * like a button that did nothing: a 409 saying there was no SVG to verify, or a
 * 502 carrying the snippet's own stack line, went nowhere. The outcome rides
 * back in the query string instead, which needs no client state and no toast
 * library, and is gone the moment the person navigates.
 */
export function withOutcome(
  path: string,
  verb: string,
  outcome: { ok: boolean; headline: string; detail: string | null },
): string {
  const [base, existing] = path.split("?");
  const params = new URLSearchParams(existing ?? "");
  params.delete("v");
  params.delete("ok");
  params.delete("m");
  params.set("v", verb);
  params.set("ok", outcome.ok ? "1" : "0");
  params.set(
    "m",
    [outcome.headline, outcome.detail].filter((part) => part !== null && part !== "").join(" — ").slice(0, MESSAGE_LIMIT),
  );
  return `${base ?? "/studio"}?${params.toString()}`;
}

/** Read one back, or null when the page was not reached through a verb. */
export function readOutcome(params: RawParams): VerbReport | null {
  const verb = one(params.v);
  if (verb === null) return null;
  const message = one(params.m) ?? "";
  const [headline, detail] = message.split(" — ");
  return {
    verb,
    ok: one(params.ok) === "1",
    headline: headline ?? verb,
    detail: detail ?? null,
  };
}

/**
 * Extend, from anywhere but the grid: `/studio?extend=<name>`, the panel that
 * opens a conversation on that diagram. On the grid itself the tile and its
 * panel patch the current view instead, so the filters survive.
 */
export function extendHref(name: string): string {
  return panelHref("/studio", { extend: name });
}

/**
 * A diagram's display title from a name-to-title record, or null. Own keys
 * only: a name comes from the URL, and `?extend=constructor` must not find
 * `Object.prototype.constructor` and render a function as a title.
 */
export function titleOf(titles: Readonly<Record<string, string>>, name: string): string | null {
  return Object.hasOwn(titles, name) ? (titles[name] ?? null) : null;
}

/** `/studio/d/<name>`, the canvas route. */
export function canvasHref(name: string): string {
  return `/studio/d/${encodeURIComponent(name)}`;
}

/**
 * The thumbnail's `src`, through the studio's own proxy.
 *
 * Not `/api/assets/{id}/file`: that route serves an asset row, and the runner's
 * route streams the diagram's own SVG blob behind the studio's one gate, so a
 * tile never depends on a second flag or on the library's rows.
 */
export function thumbnailHref(name: string): string {
  return `/studio/api/diagrams/${encodeURIComponent(name)}/svg`;
}
