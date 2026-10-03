/**
 * Home's arithmetic and words (docs/proposals/home-page.md; it replaced the
 * Today dashboard, hi-fi screens 01 and 13): the threads under "Pick up where
 * you left off", the review rows, the next concept and the courses in
 * progress, from rows the server has already read.
 *
 * Pure and React-free, so the page, `GET /api/learner/home` and a test all
 * call the same functions. `home.ts` is the server half that reads the
 * catalog and the concept notes and hands the rows here.
 *
 * Every date is turned into a calendar day in one time zone (`dayKey` from
 * `days.ts`) before it is compared, so "yesterday" means the same day on
 * every row.
 */

import type { MasteryLabel } from "@self-learn/catalog/state";

import { EMPTY_STANDING, itemDoneWith, type ItemStanding } from "@/lib/course-path";
import { dayKey, type LogEvent } from "@/lib/days";
import { bucketOf, type MasteryBucket } from "@/lib/mastery-bucket";
import { resumeAt } from "@/lib/playback";

/* -------------------------------------------------------------------------- */
/* The model                                                                  */
/* -------------------------------------------------------------------------- */

export interface NextUp {
  id: string;
  title: string;
  bucket: MasteryBucket;
  pL: number;
  /** "3 days ago", or null when the concept was never observed. */
  lastSeen: string | null;
  /** "Next on your path · CP4281 · Module 2". */
  eyebrow: string;
  /** "Next up · CP4281 M2", for the phone card. */
  eyebrowShort: string;
}

export interface ReviewRow {
  conceptId: string;
  title: string;
  bucket: MasteryBucket;
  /** "3 days ago", "on 20 Aug", or null when the concept was never observed. */
  lastSeen: string | null;
  /** Check blocks in the concept note; 0 means the card is a plain recall. */
  checks: number;
  /** "check · 2" or "recall". */
  kindLabel: string;
}

export type ThreadKind = "module" | "video" | "draft" | "concept";

/** One thing to go back to, under "Pick up where you left off". */
export interface Thread {
  key: string;
  kind: ThreadKind;
  title: string;
  /** "CS3230 · Module 6", "2:17 of 11:36", "Video draft"; null for a concept, which shows its mastery instead. */
  detail: string | null;
  href: string;
  /** ISO instant it was last touched. */
  at: string;
  /** "Today", "Yesterday", "Mon", "20 Aug". */
  day: string;
  /** How far into a video, 0 to 100. */
  percent?: number;
  /** A concept's mastery. */
  bucket?: MasteryBucket;
  pL?: number;
}

export interface CourseInProgress {
  slug: string;
  code: string;
  title: string;
  completed: number;
  total: number;
  percent: number;
}

export interface HomeModel {
  /** False when the catalog could not be read; everything below is then empty. */
  reachable: boolean;
  asOf: string;
  /** Today as a `YYYY-MM-DD` key in the app's time zone. */
  today: string;
  /** Concepts the catalog knows. Zero is a fresh database, which the empty states say. */
  conceptCount: number;
  threads: Thread[];
  nextUp: NextUp | null;
  reviews: { total: number; estimateMinutes: number; rows: ReviewRow[] };
  /** The first few courses in progress, and how many there are in all. */
  courses: { rows: CourseInProgress[]; total: number };
}

/* -------------------------------------------------------------------------- */
/* Days                                                                       */
/* -------------------------------------------------------------------------- */

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function keyToUtc(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`); negative when `to` is earlier. */
export function dayDiff(from: string, to: string): number {
  return Math.round((keyToUtc(to) - keyToUtc(from)) / DAY_MS);
}

function weekdayOf(key: string): number {
  return new Date(keyToUtc(key)).getUTCDay();
}

function shortDate(key: string, today: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const base = `${d} ${MONTHS[m - 1]}`;
  return key.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${y}`;
}

/** A past day, as a thread names it: "Today", "Yesterday", "Mon", "20 Aug". */
export function pastDayLabel(key: string, today: string): string {
  const diff = dayDiff(key, today);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return WEEKDAYS[weekdayOf(key)].slice(0, 3);
  return shortDate(key, today);
}

/** "today", "yesterday", "3 days ago", "on 20 Aug". */
export function lastSeenLabel(at: string | null, now: Date, timeZone?: string): string | null {
  if (at === null) return null;
  const then = new Date(at);
  if (Number.isNaN(then.getTime())) return null;
  const today = dayKey(now, timeZone);
  const key = dayKey(then, timeZone);
  const diff = dayDiff(key, today);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 30) return `${diff} days ago`;
  return `on ${shortDate(key, today)}`;
}

/* -------------------------------------------------------------------------- */
/* Pick up where you left off                                                 */
/* -------------------------------------------------------------------------- */

/** A module page the owner opened: an entry of the `recentModules` preference. */
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

/** A studio draft with a title (`recentDrafts`). */
export interface DraftTouch {
  id: string;
  kind: string;
  title: string;
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

/** "2:17", "1:02:03". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${rest}` : `${m}:${rest}`;
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
 * What to go back to, newest first: module pages, videos stopped partway,
 * studio drafts and concepts answered on, merged into one list.
 *
 * A video is a thread only while it has somewhere to resume: not marked
 * watched, and not so near either end that the player would start it from
 * the top (`resumeAt`). A module whose course or module is gone, and a video
 * whose asset row is gone, are left out rather than linked to a 404.
 */
export function homeThreads(
  sources: {
    modules: readonly ModuleVisit[];
    place: (visit: ModuleVisit) => ModulePlace | null;
    videos: readonly VideoProgress[];
    drafts: readonly DraftTouch[];
    concepts: readonly ConceptTouch[];
  },
  options: { now: Date; timeZone?: string; limit?: number },
): Thread[] {
  const { now, timeZone, limit = 5 } = options;
  const today = dayKey(now, timeZone);
  const out: Omit<Thread, "day">[] = [];

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
    out.push({
      key: `draft:${draft.id}`,
      kind: "draft",
      title: draft.title,
      detail: draft.kind === "video" ? "Video draft" : "Diagram draft",
      href: `/studio?draft=${encodeURIComponent(draft.id)}`,
      at: draft.updatedAt,
    });
  }

  for (const c of sources.concepts) {
    out.push({
      key: `concept:${c.id}`,
      kind: "concept",
      title: c.title,
      detail: null,
      href: `/learn/${encodeURIComponent(c.id)}`,
      at: c.at,
      bucket: c.bucket,
      pL: c.pL,
    });
  }

  const time = (t: { at: string }) => {
    const ms = new Date(t.at).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  };
  return out
    .sort((a, b) => time(b) - time(a))
    .slice(0, limit)
    .map((t) => ({ ...t, day: pastDayLabel(dayKey(new Date(time(t)), timeZone), today) }));
}

/* -------------------------------------------------------------------------- */
/* Reviews                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Minutes a queue of `cards` takes, for the "Est. 9 min" beside Start review.
 * 45 seconds a card: a recall is a few seconds of thought and a rating, a
 * check is a question to read and answer. It is labelled an estimate on
 * screen, and nothing but that label reads it.
 */
export function estimateMinutes(cards: number): number {
  if (cards <= 0) return 0;
  return Math.max(1, Math.round(cards * 0.75));
}

/**
 * The check blocks a concept note holds: fenced ```` ```check ```` blocks with a
 * non-empty `q:` line. The same rule as `parseChecks` in
 * `scripts/learn/lib/markdown.mjs`, which the web app may not import
 * (ARCHITECTURE.md layering rule 1), so a check the CLI would not ask is not
 * counted here either.
 */
export function countCheckBlocks(body: string): number {
  const re = /```check\s*\r?\n([\s\S]*?)```/g;
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    let field: string | null = null;
    let question = "";
    for (const line of match[1].split(/\r?\n/)) {
      const pair = line.match(/^\s*(q|a|why|source):\s*(.*)$/i);
      if (pair) {
        field = pair[1].toLowerCase();
        if (field === "q") question = pair[2].trim();
      } else if (field === "q" && line.trim()) {
        question = `${question} ${line.trim()}`.trim();
      }
    }
    if (question !== "") count += 1;
  }
  return count;
}

export function reviewKindLabel(checks: number): string {
  return checks > 0 ? `check · ${checks}` : "recall";
}

/* -------------------------------------------------------------------------- */
/* Next up                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The eyebrow over the next concept: where it sits on a course when a
 * curriculum item links it, its note's folder when none does.
 */
export function nextUpEyebrows(place: {
  courseCode?: string | null;
  moduleOrder?: number | null;
  domain?: string | null;
}): { eyebrow: string; eyebrowShort: string } {
  const { courseCode, moduleOrder, domain } = place;
  if (courseCode) {
    const unit = typeof moduleOrder === "number" ? moduleOrder : null;
    return {
      eyebrow: ["Next on your path", courseCode, unit !== null ? `Module ${unit}` : null].filter(Boolean).join(" · "),
      eyebrowShort: `Next up · ${courseCode}${unit !== null ? ` M${unit}` : ""}`,
    };
  }
  if (domain) return { eyebrow: `Next on your path · ${domain}`, eyebrowShort: `Next up · ${domain}` };
  return { eyebrow: "Next on your path", eyebrowShort: "Next up" };
}

/** The fields of a `KbConcept` Home reads. */
export interface ConceptLike {
  id: string;
  title: string;
  pL: number;
  mastery: MasteryLabel;
  observations: number;
  lastSeen: string | null;
}

export function toNextUp(
  concept: ConceptLike,
  place: Parameters<typeof nextUpEyebrows>[0],
  now: Date,
  timeZone?: string,
): NextUp {
  return {
    id: concept.id,
    title: concept.title,
    bucket: bucketOf(concept),
    pL: concept.pL,
    lastSeen: lastSeenLabel(concept.lastSeen, now, timeZone),
    ...nextUpEyebrows(place),
  };
}

/* -------------------------------------------------------------------------- */
/* Courses in progress                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Every course with at least one topic done, furthest along first. Done is
 * the path's rule: mastered when the topic has concepts, ticked when it has
 * none, which is what `standing` and `completed` say between them.
 */
export function coursesInProgress(
  courses: readonly { slug: string; code: string; title: string; order: number; topicIds: readonly string[] }[],
  completed: Readonly<Record<string, true>>,
  standing: ItemStanding = EMPTY_STANDING,
): CourseInProgress[] {
  const isDone = itemDoneWith(standing, completed);
  return courses
    .map((c) => {
      const total = c.topicIds.length;
      const done = c.topicIds.filter(isDone).length;
      const row: CourseInProgress = {
        slug: c.slug,
        code: c.code,
        title: c.title,
        completed: done,
        total,
        percent: total === 0 ? 0 : Math.round((done / total) * 100),
      };
      return { row, order: c.order };
    })
    .filter(({ row }) => row.completed > 0)
    .sort((a, b) => b.row.percent - a.row.percent || a.order - b.order)
    .map(({ row }) => row);
}
