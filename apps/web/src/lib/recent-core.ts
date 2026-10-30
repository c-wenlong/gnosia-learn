/**
 * Recent: what the owner was last in, newest first (L7 of
 * docs/proposals/library-by-type-and-day.md). The sidebar's Recent section
 * and Home's "Pick up where you left off" are both this list: Home shows its
 * first five, the sidebar pages through it fifty at a time under the day
 * headings its Chats list used.
 *
 * Five sources, each a row kind:
 *
 * - a module (or a course page) the owner opened: the `visit` events, merged
 *   with the `recentModules` preference they replace (`moduleVisits`);
 * - a library video stopped partway: a `playback:<asset>` preference that is
 *   not marked watched and has somewhere to resume (`resumeAt`);
 * - a studio conversation, by the `draft` row's `updated_at`;
 * - a concept answered on, from the `observation` events (`conceptTouches`);
 * - a tutor session, by the `session` row's `updated_at`.
 *
 * Pure and React-free, so the server's read (`recent.ts`), Home, the
 * sidebar's own merge of the studio runner's conversations, and a test all
 * call the same functions.
 */

import { conversationTitle } from "@/lib/conversation-title";
import { conceptHref } from "@/lib/course-path";
import { dayDiff } from "@/lib/day-groups";
import { dayKey, type LogEvent } from "@gnosia/tutor/days";
import type { MasteryBucket } from "@gnosia/tutor/mastery-bucket";
import { resumeAt } from "@gnosia/tutor/playback";

export type RecentKind = "module" | "video" | "draft" | "concept" | "session";

export const RECENT_KINDS: readonly RecentKind[] = ["module", "video", "draft", "concept", "session"];

/** One row of Recent. */
export interface RecentItem {
  /** `<kind>:<id>`, unique in the list; the pinned preference keys by it. */
  key: string;
  kind: RecentKind;
  title: string;
  /** "CS3230 · Module 6", "2:17 of 11:36", "Video draft"; null for a concept, which shows its mastery instead. */
  detail: string | null;
  href: string;
  /** ISO instant it was last touched. */
  at: string;
  /** How far into a video, 0 to 100. */
  percent?: number;
  /** A concept's mastery. */
  bucket?: MasteryBucket;
  pL?: number;
  /** What the row is about, for "Next from here", the recall picks and Open in course. */
  courseSlug?: string;
  moduleSlug?: string;
  conceptId?: string;
  /** A conversation's draft id, which the studio page opens in the browser. */
  draftId?: string;
  /** A conversation headed by the person's own words rather than a title. */
  quoted?: boolean;
  /** A conversation with a brief waiting to be drawn. */
  briefed?: boolean;
  /**
   * The tutor sessions folded into this row because they open its page
   * (`recentItems`): Recent's search still finds one by its title, and a pin
   * made of one before it was folded still stands for this row.
   */
  folded?: { key: string; title: string }[];
}

/* -------------------------------------------------------------------------- */
/* The sources                                                                */
/* -------------------------------------------------------------------------- */

/** A module page the owner opened: a `visit` event, or an entry of the `recentModules` preference. */
export interface ModuleVisit {
  courseSlug: string;
  moduleSlug?: string;
  at: string;
}

/** Where a visit points, read from the courses; null when the course or module is gone. */
export interface ModulePlace {
  courseCode: string;
  courseTitle: string;
  moduleTitle: string | null;
  moduleOrder: number | null;
}

/** A library video with a saved position: a `playback:<asset>` preference and the asset's title. */
export interface VideoProgress {
  assetId: string;
  /** Null when the asset row is gone, which leaves nothing to open. */
  title: string | null;
  position: number;
  duration: number;
  watchedAt: string | null;
  updatedAt: string;
}

/** A studio draft with a name or a title (`recentDrafts`), called by `conversationTitle`. */
export interface DraftTouch {
  id: string;
  kind: string;
  /** The owner's name for it, which it is called before its title. */
  name?: string | null;
  title: string | null;
  updatedAt: string;
}

/** A concept the owner answered questions on, and when they last did. */
export interface ConceptTouch {
  id: string;
  title: string;
  bucket: MasteryBucket;
  pL: number;
  at: string;
}

/** A tutor session, its title and where it opens already resolved (`recent.ts`). */
export interface SessionTouch {
  id: string;
  title: string;
  href: string;
  updatedAt: string;
}

export interface RecentSources {
  modules: readonly ModuleVisit[];
  place: (visit: ModuleVisit) => ModulePlace | null;
  videos: readonly VideoProgress[];
  drafts: readonly DraftTouch[];
  concepts: readonly ConceptTouch[];
  /** Absent for a caller that predates tutor sessions in the list. */
  sessions?: readonly SessionTouch[];
}

/** "2:17", "1:02:03". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${rest}` : `${m}:${rest}`;
}

/** An instant's milliseconds, 0 when it does not parse: how every list here compares times, never as strings. */
export function time(at: string): number {
  const ms = new Date(at).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * The latest answer per concept, from the event log: `observation` events
 * only, since a review grade is a schedule's business and a watched asset has
 * no concept, and none inside a session a `void` retracted.
 */
export function conceptTouches(
  events: readonly LogEvent[],
  concept: (id: string) => { title: string; bucket: MasteryBucket; pL: number } | null,
): ConceptTouch[] {
  const voided = new Set(
    events
      .filter((e) => e.type === "void" && typeof e.session === "string" && e.session !== "")
      .map((e) => e.session as string),
  );
  const latest = new Map<string, string>();
  for (const e of events) {
    if (e.type !== "observation" || typeof e.concept !== "string" || e.concept === "") continue;
    if (typeof e.session === "string" && voided.has(e.session)) continue;
    const at = new Date(e.at).getTime();
    if (Number.isNaN(at)) continue;
    const seen = latest.get(e.concept);
    if (seen === undefined || at > new Date(seen).getTime()) latest.set(e.concept, e.at);
  }
  const out: ConceptTouch[] = [];
  for (const [id, at] of latest) {
    const known = concept(id);
    if (known !== null) out.push({ id, at, ...known });
  }
  return out;
}

/**
 * The module visits, newest first and each module once: the `visit` events
 * the preference route appends, merged with the `recentModules` list it kept
 * before them (and still keeps, for one release). Merged by course and
 * module at the later of the two times, so the five modules the list held on
 * the day the events began are not lost, and a module in both is one row.
 *
 * A course page visited without a module is its own entry, as in the list.
 */
export function moduleVisits(
  events: readonly { type: string; at: string; [key: string]: unknown }[],
  stored: readonly ModuleVisit[],
): ModuleVisit[] {
  const latest = new Map<string, ModuleVisit>();
  const put = (visit: ModuleVisit) => {
    if (Number.isNaN(new Date(visit.at).getTime())) return;
    const key = `${visit.courseSlug}/${visit.moduleSlug ?? ""}`;
    const seen = latest.get(key);
    if (seen === undefined || time(visit.at) > time(seen.at)) latest.set(key, visit);
  };
  for (const visit of stored) put(visit);
  for (const event of events) {
    if (event.type !== "visit" || typeof event.course !== "string" || event.course === "") continue;
    const moduleSlug = typeof event.module === "string" && event.module !== "" ? event.module : undefined;
    put({ courseSlug: event.course, ...(moduleSlug === undefined ? {} : { moduleSlug }), at: event.at });
  }
  return [...latest.values()].sort((a, b) => time(b.at) - time(a.at));
}

/**
 * Whether a module row is a course page visited with no module open: its key
 * is `module:<course>/` with nothing after the slash, a pinned copy's too.
 * It reads "Course", not "Course module".
 */
export function isCourseVisit(item: { kind: RecentKind; key: string }): boolean {
  return item.kind === "module" && item.key.endsWith("/");
}

/**
 * Every row, newest first: module pages, videos stopped partway, studio
 * drafts, concepts answered on and tutor sessions, merged into one list.
 *
 * A video is a row only while it has somewhere to resume: not marked
 * watched, and not so near either end that the player would start it from
 * the top (`resumeAt`), since a finished or barely started video is for the
 * Library. A module whose course or module is gone, and a video whose asset
 * row is gone, are left out rather than linked to a 404.
 *
 * Rows touched in the same instant keep the order of the sources above,
 * which is the order Home's list always had.
 */
export function recentItems(sources: RecentSources): RecentItem[] {
  const out: RecentItem[] = [];

  for (const visit of sources.modules) {
    const place = sources.place(visit);
    if (place === null) continue;
    const inModule = visit.moduleSlug !== undefined && place.moduleTitle !== null;
    out.push({
      key: `module:${visit.courseSlug}/${visit.moduleSlug ?? ""}`,
      kind: "module",
      title: inModule ? (place.moduleTitle as string) : place.courseTitle,
      detail:
        inModule && place.moduleOrder !== null ? `${place.courseCode} · Module ${place.moduleOrder}` : place.courseCode,
      href: inModule
        ? `/courses/${encodeURIComponent(visit.courseSlug)}/${encodeURIComponent(visit.moduleSlug as string)}`
        : `/courses/${encodeURIComponent(visit.courseSlug)}`,
      at: visit.at,
      courseSlug: visit.courseSlug,
      ...(inModule ? { moduleSlug: visit.moduleSlug } : {}),
    });
  }

  for (const video of sources.videos) {
    if (video.title === null || video.watchedAt !== null) continue;
    if (resumeAt(video) === 0) continue;
    out.push({
      key: `video:${video.assetId}`,
      kind: "video",
      title: video.title,
      detail: `${clock(video.position)} of ${clock(video.duration)}`,
      href: `/library/${encodeURIComponent(video.assetId)}`,
      at: video.updatedAt,
      percent: Math.min(100, Math.round((video.position / video.duration) * 100)),
    });
  }

  for (const draft of sources.drafts) {
    // `recentDrafts` reads only drafts with a name or a title, so a draft
    // with neither is one some other caller passed, with nothing to call it.
    const called = conversationTitle(draft);
    if (called === null) continue;
    out.push({
      key: `draft:${draft.id}`,
      kind: "draft",
      title: called.text,
      detail: draft.kind === "video" ? "Video draft" : "Diagram draft",
      href: `/studio?draft=${encodeURIComponent(draft.id)}`,
      at: draft.updatedAt,
      draftId: draft.id,
    });
  }

  for (const c of sources.concepts) {
    out.push({
      key: `concept:${c.id}`,
      kind: "concept",
      title: c.title,
      detail: null,
      href: conceptHref(c.id),
      at: c.at,
      bucket: c.bucket,
      pL: c.pL,
      conceptId: c.id,
    });
  }

  // A session with no log opens its concept's page, as that concept's row
  // does, so several of them on one concept read as the same row repeated.
  // Each page is one row: the concept's, when the concept has one, dated by
  // the later of the two; else the newest session's. A session with a log
  // opens the log, a page of its own.
  const byHref = new Map(out.filter((item) => item.kind === "concept").map((item) => [item.href, item]));
  for (const s of [...(sources.sessions ?? [])].sort((a, b) => time(b.updatedAt) - time(a.updatedAt))) {
    const same = byHref.get(s.href);
    if (same !== undefined) {
      if (same.kind === "concept" && time(s.updatedAt) > time(same.at)) same.at = s.updatedAt;
      same.folded = [...(same.folded ?? []), { key: `session:${s.id}`, title: s.title }];
      continue;
    }
    const row: RecentItem = {
      key: `session:${s.id}`,
      kind: "session",
      title: s.title,
      detail: "Tutor session",
      href: s.href,
      at: s.updatedAt,
    };
    byHref.set(s.href, row);
    out.push(row);
  }

  return out.sort((a, b) => time(b.at) - time(a.at));
}

/* -------------------------------------------------------------------------- */
/* What the sidebar reads                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A course in the sidebar: one row that opens where the owner left off. The
 * module list is the course page's own sidebar, so the app's sidebar does not
 * repeat it.
 */
export interface SidebarCourse {
  slug: string;
  code: string;
  title: string;
  /** The course page, which every page of the course sits under. */
  href: string;
  /** Where the row opens: the module visited last, else the course page, which shows the module the owner is on. */
  open: string;
  /** The module visited last, named under the course; null when none is recorded. */
  resume: { title: string; order: number } | null;
}

/** What `GET /api/learner/recent` answers with: Recent's rows, the pins, and the courses. */
export interface RecentModel {
  /** False when the catalog could not be read; every list is then empty. */
  reachable: boolean;
  /** Newest first, the pages asked for, every conversation called by `conversationTitle`. */
  items: RecentItem[];
  /** Whether there are rows past `items`. */
  more: boolean;
  pinned: PinnedRow[];
  courses: SidebarCourse[];
  /** Why there are no courses when the reason is the owner's to fix (a courses type nobody flipped), in a sentence that names the fix. */
  coursesUnavailable?: string;
}

/* -------------------------------------------------------------------------- */
/* Pages                                                                      */
/* -------------------------------------------------------------------------- */

/** How many rows a page of Recent holds. */
export const RECENT_PAGE = 50;

/** The most pages one read answers with: a bound on a hand-typed `pages=`. */
export const MAX_RECENT_PAGES = 20;

/** The newest `pages` pages, and whether there are rows past them. */
export function recentPage<T>(items: readonly T[], pages: number, size = RECENT_PAGE): { items: T[]; more: boolean } {
  const count = Math.max(1, Math.min(MAX_RECENT_PAGES, Math.floor(pages) || 1)) * size;
  return { items: items.slice(0, count), more: items.length > count };
}

/**
 * Two or more lists, each newest first and each perhaps only its newest
 * pages, merged into one that is honest about what it has not read.
 *
 * A row older than the oldest row read from a list that has more could be
 * outranked by that list's next page, which has not been read: it is held
 * back, and `more` says there is more to show, until Show older reads the
 * next page of each. The sidebar merges the server's Recent with the studio
 * runner's conversations this way, since the runner is where a conversation
 * with no title yet is named.
 */
export function mergeStreams(streams: readonly { items: readonly RecentItem[]; more: boolean }[]): {
  items: RecentItem[];
  more: boolean;
} {
  let cutoff = Number.NEGATIVE_INFINITY;
  for (const stream of streams) {
    if (!stream.more) continue;
    const last = stream.items.at(-1);
    if (last !== undefined) cutoff = Math.max(cutoff, time(last.at));
  }
  const all = streams.flatMap((s) => s.items).sort((a, b) => time(b.at) - time(a.at));
  const items = all.filter((item) => time(item.at) >= cutoff);
  return { items, more: streams.some((s) => s.more) || items.length < all.length };
}

/* -------------------------------------------------------------------------- */
/* Day headings                                                               */
/* -------------------------------------------------------------------------- */

export const DAY_GROUPS = ["Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"] as const;

export interface RecentGroup<T> {
  label: (typeof DAY_GROUPS)[number];
  rows: T[];
}

/**
 * The rows under the day headings the Chats list used (`historyGroups` in
 * `studio-draft-list.ts`): Today, Yesterday, the previous 7 days, the
 * previous 30, and Older, by the calendar day of `at` against `now` in
 * `timeZone`: the zone Home counts its days in (`appTimeZone()`, handed to
 * the shell by the server), so a row is "Today" in both places. Without one,
 * the zone of whatever runs it. Keeps the rows' order; an empty group is
 * left out, and a row whose `at` does not parse is Older.
 */
export function recentGroups<T extends { at: string }>(rows: readonly T[], now: Date, timeZone?: string): RecentGroup<T>[] {
  const today = dayKey(now, timeZone);
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const ms = Date.parse(row.at);
    const ago = Number.isNaN(ms) ? Infinity : dayDiff(dayKey(new Date(ms), timeZone), today);
    const label = ago <= 0 ? DAY_GROUPS[0] : ago === 1 ? DAY_GROUPS[1] : ago <= 7 ? DAY_GROUPS[2] : ago <= 30 ? DAY_GROUPS[3] : DAY_GROUPS[4];
    const list = groups.get(label);
    if (list === undefined) groups.set(label, [row]);
    else list.push(row);
  }
  return DAY_GROUPS.flatMap((label) => {
    const grouped = groups.get(label);
    return grouped === undefined ? [] : [{ label, rows: grouped }];
  });
}

/* -------------------------------------------------------------------------- */
/* Pins                                                                       */
/* -------------------------------------------------------------------------- */

/** A pinned row: a copy of the row as it was pinned, so the pin outlives its leaving Recent. */
export interface PinnedRow {
  key: string;
  kind: RecentKind;
  title: string;
  href: string;
  /** When it was pinned, ISO 8601. */
  at: string;
}

/** The most pins kept. */
export const MAX_PINS = 50;
/** The longest title kept. */
export const MAX_RECENT_TITLE = 200;
const MAX_HREF = 1_000;
const MAX_KEY = 600;

/** Whether `key` is a row key of `kind` (`draft:abc`). */
export function isRecentKey(key: unknown, kind?: RecentKind): key is string {
  if (typeof key !== "string" || key.length > MAX_KEY) return false;
  const at = key.indexOf(":");
  if (at <= 0 || at === key.length - 1) return false;
  const prefix = key.slice(0, at);
  return (RECENT_KINDS as readonly string[]).includes(prefix) && (kind === undefined || prefix === kind);
}

/**
 * An in-app path a pin may link to: one leading slash, never two (that is
 * another host), no backslash (which some browsers read as a slash), no
 * control characters. The value is rendered back into an href, so this is
 * the line between a pin and a stored link to anywhere.
 */
export function isAppPath(href: unknown): href is string {
  return (
    typeof href === "string" &&
    href.length <= MAX_HREF &&
    href.startsWith("/") &&
    !href.startsWith("//") &&
    !href.includes("\\") &&
    !/[\u0000-\u001f\u007f]/.test(href)
  );
}

/** A title as stored: one line, trimmed, at most `MAX_RECENT_TITLE` characters; null when nothing is left. */
export function cleanTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const line = value.replace(/\s+/g, " ").trim().slice(0, MAX_RECENT_TITLE).trim();
  return line === "" ? null : line;
}

/** One stored pin read back, or null when it is not one. */
export function asPinnedRow(value: unknown): PinnedRow | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const kind = raw.kind;
  if (typeof kind !== "string" || !(RECENT_KINDS as readonly string[]).includes(kind)) return null;
  if (!isRecentKey(raw.key, kind as RecentKind)) return null;
  const title = cleanTitle(raw.title);
  if (title === null || !isAppPath(raw.href)) return null;
  const at = typeof raw.at === "string" && !Number.isNaN(Date.parse(raw.at)) ? raw.at : null;
  if (at === null) return null;
  return { key: raw.key as string, kind: kind as RecentKind, title, href: raw.href as string, at };
}

/** The stored `pinned` preference read back defensively: an entry that is not a pin is dropped, each key once. */
export function asPinned(value: unknown): PinnedRow[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: PinnedRow[] = [];
  for (const entry of value) {
    const row = asPinnedRow(entry);
    if (row === null || seen.has(row.key)) continue;
    seen.add(row.key);
    out.push(row);
  }
  return out.slice(0, MAX_PINS);
}

/** `row` pinned at the top, once; the oldest pin past `MAX_PINS` goes. */
export function withPin(list: readonly PinnedRow[], row: PinnedRow): PinnedRow[] {
  return [row, ...list.filter((p) => p.key !== row.key)].slice(0, MAX_PINS);
}

export function withoutPin(list: readonly PinnedRow[], key: string): PinnedRow[] {
  return list.filter((p) => p.key !== key);
}

/**
 * Recent split for the sidebar: the pinned rows, in pin order, each titled
 * as the live row is now when any list read holds it; and Recent without
 * them, since a pinned row moves to Pinned rather than showing twice.
 *
 * `known` is every row read, before `mergeStreams` held any back: a pinned
 * conversation older than the other list's last page is held back from
 * Recent, but its name as the runner has it now is still the one to show.
 */
export function splitPinned(
  items: readonly RecentItem[],
  pinned: readonly PinnedRow[],
  known: readonly RecentItem[] = items,
): { pinned: PinnedRow[]; recent: RecentItem[] } {
  const live = new Map<string, { title: string; href: string }>();
  for (const item of [...known, ...items]) {
    live.set(item.key, item);
    // A session pinned before it was folded into its page's row keeps its
    // own title, and that row leaves Recent as the page it pins.
    for (const f of item.folded ?? []) live.set(f.key, { title: f.title, href: item.href });
  }
  const keys = new Set(pinned.map((p) => p.key));
  return {
    pinned: pinned.map((p) => {
      const now = live.get(p.key);
      return now === undefined ? p : { ...p, title: now.title, href: now.href };
    }),
    recent: items.filter((item) => !keys.has(item.key) && !(item.folded ?? []).some((f) => keys.has(f.key))),
  };
}

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

/** Lower case, whitespace runs as one space, trimmed: how Recent's search compares. */
function fold(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase().replaceAll("ς", "σ");
}

/** Whether a row's title, or a folded session's (`RecentItem.folded`), holds `words`. */
export function rowMatches(item: Pick<RecentItem, "title" | "folded">, words: string): boolean {
  return titleMatches(item.title, words) || (item.folded ?? []).some((f) => titleMatches(f.title, words));
}

/**
 * The title a search hit shows: the row's own when it holds `words`, else the
 * folded session's that does, so the words found are the words shown.
 */
export function matchedTitle(item: Pick<RecentItem, "title" | "folded">, words: string): string {
  if (titleMatches(item.title, words)) return item.title;
  return (item.folded ?? []).find((f) => titleMatches(f.title, words))?.title ?? item.title;
}

/** Whether `title` holds `words`, in any case. Empty words match everything. */
export function titleMatches(title: string, words: string): boolean {
  const needle = fold(words);
  return needle === "" || fold(title).includes(needle);
}
