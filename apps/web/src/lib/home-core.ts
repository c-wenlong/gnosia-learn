/**
 * Home's arithmetic and words (docs/proposals/home-page.md; it replaced the
 * Today dashboard, hi-fi screens 01 and 13): the threads under "Pick up where
 * you left off", what they open up under "Next from here", the few cards
 * worth a quick recall, and the courses in progress, from rows the server
 * has already read.
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
  /** What the thread is about, for "Next from here" and the recall picks. */
  courseSlug?: string;
  moduleSlug?: string;
  conceptId?: string;
}

/** One step on from a thread: a concept to learn or a course topic to take. */
export interface NextStep {
  key: string;
  title: string;
  /** "CS3230 · Module 6", or null for a concept, which shows its mastery instead. */
  detail: string | null;
  href: string;
  bucket?: MasteryBucket;
  pL?: number;
}

/** The steps one thread opens up, under "Next from here". */
export interface NextGroup {
  key: string;
  /** "After Randomized algorithms", "Start here". */
  heading: string;
  steps: NextStep[];
}

/** A due card Home suggests recalling. */
export interface RecallPick {
  conceptId: string;
  title: string;
  bucket: MasteryBucket;
  /** "3 days ago", "on 20 Aug", or null when the concept was never observed. */
  lastSeen: string | null;
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
  /** What the threads open up; empty when none opens anything. */
  next: NextGroup[];
  /** The frontier's first concept, shown only when `next` is empty. */
  nextUp: NextUp | null;
  /** At most three due cards, nearest the threads first. */
  recall: RecallPick[];
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
      conceptId: c.id,
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
/* Next from here                                                             */
/* -------------------------------------------------------------------------- */

/** The fields of a `KbConcept` "Next from here" and the recall picks read. */
export interface GraphConcept {
  id: string;
  title: string;
  pL: number;
  mastery: MasteryLabel;
  observations: number;
  lastSeen: string | null;
  requires: readonly string[];
  /** Curriculum item ids the concept supports. */
  topics: readonly string[];
}

/** A course as "Next from here" walks it: its modules in order, each topic with its concepts. */
export interface PathCourse {
  slug: string;
  code: string;
  order: number;
  modules: readonly {
    slug: string;
    order: number;
    topics: readonly { id: string; title: string }[];
  }[];
}

/**
 * What each of the top threads opens up (docs/proposals/home-page.md, part 3),
 * at most `perGroup` steps a thread and `groups` threads:
 *
 * - after a concept, the concepts on the frontier that require it: ready to
 *   learn, not yet mastered, the same readiness rule `frontier()` applies;
 * - after a module, its topics not yet done, in order, then the next module's;
 *   after a course page with no module, the first topics not yet done in it.
 *
 * A thread with nothing after it makes no group, and a step already shown
 * under an earlier thread, or that is itself a thread, is not repeated. With
 * no threads at all, the first active course's first open topic is "Start
 * here". Videos and drafts open nothing: neither names a concept or a topic.
 */
export function nextFromHere(
  threads: readonly Thread[],
  graph: {
    concepts: readonly GraphConcept[];
    frontier: readonly string[];
    courses: readonly PathCourse[];
    /** A topic done, by the path's rule (`itemDoneWith`). */
    done: (topicId: string) => boolean;
    /** A topic's Continue link (`continueHref`). */
    topicHref: (course: PathCourse, moduleSlug: string, topicId: string) => string;
  },
  options: { groups?: number; perGroup?: number } = {},
): NextGroup[] {
  const { groups: maxGroups = 2, perGroup = 3 } = options;
  const byId = new Map(graph.concepts.map((c) => [c.id, c]));
  const onThreads = new Set(threads.map((t) => t.conceptId).filter((id): id is string => id !== undefined));
  const shown = new Set<string>();
  const out: NextGroup[] = [];

  const conceptStep = (c: GraphConcept): NextStep => ({
    key: `concept:${c.id}`,
    title: c.title,
    detail: null,
    href: `/learn/${encodeURIComponent(c.id)}`,
    bucket: bucketOf(c),
    pL: c.pL,
  });

  const topicSteps = (course: PathCourse, fromModule: string | undefined): NextStep[] => {
    const start = fromModule === undefined ? 0 : course.modules.findIndex((m) => m.slug === fromModule);
    if (start === -1) return [];
    const steps: NextStep[] = [];
    for (const mod of course.modules.slice(start)) {
      for (const topic of mod.topics) {
        if (graph.done(topic.id)) continue;
        steps.push({
          key: `topic:${topic.id}`,
          title: topic.title,
          detail: `${course.code} · Module ${mod.order}`,
          href: graph.topicHref(course, mod.slug, topic.id),
        });
        if (steps.length === perGroup) return steps;
      }
    }
    return steps;
  };

  for (const thread of threads) {
    if (out.length === maxGroups) break;
    let steps: NextStep[] = [];
    if (thread.conceptId !== undefined) {
      steps = graph.frontier
        .map((id) => byId.get(id))
        .filter((c): c is GraphConcept => c !== undefined && c.requires.includes(thread.conceptId as string))
        .filter((c) => !onThreads.has(c.id))
        .map(conceptStep);
    } else if (thread.courseSlug !== undefined) {
      const course = graph.courses.find((c) => c.slug === thread.courseSlug);
      if (course !== undefined) steps = topicSteps(course, thread.moduleSlug);
    }
    steps = steps.filter((step) => !shown.has(step.key)).slice(0, perGroup);
    if (steps.length === 0) continue;
    for (const step of steps) shown.add(step.key);
    out.push({ key: thread.key, heading: `After ${thread.title}`, steps });
  }

  if (out.length === 0 && threads.length === 0) {
    const first = [...graph.courses].sort((a, b) => a.order - b.order).find((c) => topicSteps(c, undefined).length > 0);
    if (first !== undefined) out.push({ key: "start", heading: "Start here", steps: topicSteps(first, undefined).slice(0, 1) });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Worth a quick recall                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The concepts the threads are about, or one step from: each concept thread
 * with what it requires and what requires it, every concept a visited
 * module's topics support, and every concept "Next from here" lists.
 */
export function nearThreads(
  threads: readonly Thread[],
  next: readonly NextGroup[],
  concepts: readonly GraphConcept[],
  courses: readonly PathCourse[],
): Set<string> {
  const near = new Set<string>();
  const topicIds = new Set<string>();
  for (const t of threads) {
    if (t.conceptId !== undefined) {
      near.add(t.conceptId);
      for (const c of concepts) {
        if (c.id === t.conceptId) c.requires.forEach((id) => near.add(id));
        if (c.requires.includes(t.conceptId)) near.add(c.id);
      }
    } else if (t.courseSlug !== undefined) {
      const course = courses.find((c) => c.slug === t.courseSlug);
      const modules = course?.modules.filter((m) => t.moduleSlug === undefined || m.slug === t.moduleSlug) ?? [];
      for (const m of modules) for (const topic of m.topics) topicIds.add(topic.id);
    }
  }
  for (const c of concepts) if (c.topics.some((id) => topicIds.has(id))) near.add(c.id);
  for (const group of next) {
    for (const step of group.steps) if (step.key.startsWith("concept:")) near.add(step.key.slice("concept:".length));
  }
  return near;
}

/**
 * At most `limit` due cards worth a quick recall (part 4): those near the
 * threads first, then the rest, each lot by how long since its concept was
 * last seen, longest first. No queue count and no "overdue": a due date
 * passed while the owner learnt something else is not a debt (H3).
 */
export function recallPicks(
  due: readonly { conceptId: string }[],
  near: ReadonlySet<string>,
  concepts: readonly GraphConcept[],
  options: { now: Date; timeZone?: string; limit?: number },
): RecallPick[] {
  const { now, timeZone, limit = 3 } = options;
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const seenAt = (id: string) => {
    const at = byId.get(id)?.lastSeen;
    const ms = at ? new Date(at).getTime() : Number.NaN;
    return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
  };
  return due
    .filter((card) => byId.has(card.conceptId))
    .map((card, index) => ({ id: card.conceptId, index }))
    .sort(
      (a, b) =>
        Number(near.has(b.id)) - Number(near.has(a.id)) || seenAt(a.id) - seenAt(b.id) || a.index - b.index,
    )
    .slice(0, limit)
    .map(({ id }) => {
      const c = byId.get(id) as GraphConcept;
      return { conceptId: id, title: c.title, bucket: bucketOf(c), lastSeen: lastSeenLabel(c.lastSeen, now, timeZone) };
    });
}

/** `/review` with only these cards, in this order. */
export function recallHref(picks: readonly RecallPick[]): string {
  return `/review?only=${picks.map((p) => encodeURIComponent(p.conceptId)).join(",")}`;
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
