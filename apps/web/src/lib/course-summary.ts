import { EMPTY_STANDING, itemDoneWith, type ItemStanding } from "@/lib/course-path";
import type { Course, TagMeta } from "@/lib/types";

/**
 * What the Courses page needs of a course: the status each card prints, the
 * courses its Continue learning block lists, and the search and tag filter
 * over the grid.
 *
 * The page's list is a client component (it filters as you type, and reads progress
 * from `LearnerProvider` so a tick elsewhere shows up without a reload), so
 * whatever it gets travels in the page payload. A whole `Course` carries every
 * subtopic and curated link; this is the projection a card actually renders.
 * Pure, so the server page and the client grid share it and a test can call it.
 *
 * Done is the path's rule (`topicDone`): a topic with concepts counts when
 * they are mastered, a topic without counts when it is ticked. The server
 * page hands the grid an `ItemStanding` for the first half; the ticks stay
 * the client's. Without a standing, every topic is tick-only, which is what
 * the page falls back to when the catalog cannot be read.
 */

export interface CourseSummaryTopic {
  id: string;
  title: string;
  /** The module the topic sits in: its place in the course, its title and its URL slug. */
  moduleOrder: number;
  moduleTitle: string;
  moduleSlug: string;
}

export interface CourseSummary {
  slug: string;
  code: string;
  title: string;
  /** Modular credits, as the course path prints them ("4 MC"). */
  credits: number;
  /** The cover photo's URL (`coverUrl`), or null to draw the code placeholder. */
  cover: string | null;
  tags: Pick<TagMeta, "id" | "label">[];
  moduleCount: number;
  /**
   * Every curriculum item, in module order then topic order. Module order is
   * the order the course lists them, the order the course page walks
   * (`pathStatus`), so the next topic named here is the one the page opens.
   */
  topics: CourseSummaryTopic[];
}

/**
 * The query parameter that pins a cover URL to one image, and its value for
 * an image: the first 16 hex digits of its sha256. The route caches a URL
 * whose version names the image it serves for good (`immutable`), and any
 * other for no time at all, so a replaced cover can never show its old photo.
 */
export const COVER_VERSION_PARAM = "v";

export function coverVersion(sha256: string): string {
  return sha256.slice(0, 16);
}

/**
 * Where a course's cover is served: the cover route, by slug, versioned by
 * the image's hash. The row stores the blob key, never this URL
 * (`collection.cover_blob_key`), so the URL can change with the route and a
 * cloud store without a migration.
 */
export function coverUrl(slug: string, sha256: string): string {
  return `/api/courses/${encodeURIComponent(slug)}/cover?${COVER_VERSION_PARAM}=${coverVersion(sha256)}`;
}

/**
 * `coverSha256`: the stored cover's hash, when the course has a cover in the
 * blob store (`getCourseCovers`); null or absent draws the placeholder.
 */
export function toCourseSummary(course: Course, tags: readonly TagMeta[], coverSha256: string | null = null): CourseSummary {
  return {
    slug: course.slug,
    code: course.code,
    title: course.title,
    credits: course.credits,
    cover: coverSha256 === null ? null : coverUrl(course.slug, coverSha256),
    tags: tags.map(({ id, label }) => ({ id, label })),
    moduleCount: course.modules.length,
    topics: course.modules.flatMap((m) =>
      m.topics.map((t) => ({ id: t.id, title: t.title, moduleOrder: m.order, moduleTitle: m.title, moduleSlug: m.slug })),
    ),
  };
}

export interface CourseStatus {
  completed: number;
  total: number;
  percent: number;
  /** The first topic in course order that is not done, or null when none is left. */
  next: CourseSummaryTopic | null;
  /** "Next: Barycentric coordinates", "Not started" or "Completed". */
  label: string;
}

export function courseStatus(
  summary: CourseSummary,
  completed: Readonly<Record<string, true>>,
  standing: ItemStanding = EMPTY_STANDING,
): CourseStatus {
  const isDone = itemDoneWith(standing, completed);
  const total = summary.topics.length;
  const done = summary.topics.filter((t) => isDone(t.id)).length;
  const next = summary.topics.find((t) => !isDone(t.id)) ?? null;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  let label: string;
  if (total > 0 && next === null) label = "Completed";
  else if (done === 0) label = "Not started";
  else label = `Next: ${next?.title ?? ""}`;
  return { completed: done, total, percent, next, label };
}

/**
 * The grid's filters: the search field, matched word by word against the
 * code, the title and the tag labels, and the tag chips (one theme tag, or
 * `null` for All). The two combine. Progress is not a filter: a started
 * course is in the Continue learning block above the grid, and its card in
 * the grid says how far along it is.
 */
export interface CourseFilter {
  tag: string | null;
}

export const ALL_COURSES: CourseFilter = { tag: null };

/** Started and not finished: at least one topic done and one left. */
export function isInProgress(
  summary: CourseSummary,
  completed: Readonly<Record<string, true>>,
  standing: ItemStanding = EMPTY_STANDING,
): boolean {
  return started(courseStatus(summary, completed, standing));
}

function started(status: CourseStatus): boolean {
  return status.completed > 0 && status.next !== null;
}

export function filterCourses(
  summaries: readonly CourseSummary[],
  query: string,
  filter: CourseFilter,
): CourseSummary[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return summaries.filter((s) => {
    if (filter.tag !== null && !s.tags.some((t) => t.id === filter.tag)) return false;
    if (words.length === 0) return true;
    const haystack = [s.code, s.title, ...s.tags.map((t) => t.label)].join(" ").toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

export interface CourseEntry {
  summary: CourseSummary;
  status: CourseStatus;
}

/**
 * The Continue learning block: every course in progress, with its status.
 *
 * The course the learner last opened (`lastVisited`, written by the course
 * page) comes first, since it is the one they are most likely back for; the
 * rest go furthest along first, the order Today's card uses, then in the
 * order they were given, which is the catalog's authored order.
 */
export function continueLearning(
  summaries: readonly CourseSummary[],
  completed: Readonly<Record<string, true>>,
  standing: ItemStanding = EMPTY_STANDING,
  lastVisitedSlug?: string | null,
): CourseEntry[] {
  const visited = (e: CourseEntry) => Number(e.summary.slug === lastVisitedSlug);
  return summaries
    .map((summary, at) => ({ summary, status: courseStatus(summary, completed, standing), at }))
    .filter(({ status }) => started(status))
    .sort((a, b) => visited(b) - visited(a) || b.status.percent - a.status.percent || a.at - b.at)
    .map(({ summary, status }) => ({ summary, status }));
}

/** "7 modules · 20 topics", the counts every card prints. */
export function courseCounts(summary: CourseSummary): string {
  const m = summary.moduleCount;
  const t = summary.topics.length;
  return `${m} ${m === 1 ? "module" : "modules"} · ${t} ${t === 1 ? "topic" : "topics"}`;
}

/**
 * A cover card's type line, as its parts: "Course", the module and topic
 * counts, then how far along a started course is ("35% done") or
 * "Completed". A course with nothing done says nothing more: "Not started"
 * on every card would be noise. Parts, so the card can keep each one on a
 * line of its own when two cards share a phone's width.
 */
export function coverLine(summary: CourseSummary, status: CourseStatus): string[] {
  const m = summary.moduleCount;
  const t = summary.topics.length;
  const parts = ["Course", `${m} ${m === 1 ? "module" : "modules"}`, `${t} ${t === 1 ? "topic" : "topics"}`];
  if (status.total > 0 && status.next === null) parts.push("Completed");
  else if (status.completed > 0) parts.push(`${status.percent}% done`);
  return parts;
}

/**
 * A cover card's partner row, where Coursera names the university: the code
 * and the credits. The course's `track` is left out: it is a sentence ("AI
 * focus area, project-heavy"), not a name, and the course page prints it.
 */
export function partnerLine(summary: CourseSummary): string {
  return summary.credits > 0 ? `${summary.code} · ${summary.credits} MC` : summary.code;
}

/** The theme tags any course uses, in the order `content/tags.yaml` lists them. */
export function usedTags(
  all: readonly TagMeta[],
  summaries: readonly CourseSummary[],
): Pick<TagMeta, "id" | "label">[] {
  const used = new Set(summaries.flatMap((s) => s.tags.map((t) => t.id)));
  return all.filter((t) => used.has(t.id)).map(({ id, label }) => ({ id, label }));
}
