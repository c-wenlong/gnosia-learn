import type { Course, TagMeta } from "@/lib/types";

/**
 * What the Courses page (hi-fi screen 02) needs of a course, and the status
 * line each card prints.
 *
 * The grid is a client component (it filters as you type, and reads progress
 * from `LearnerProvider` so a tick elsewhere shows up without a reload), so
 * whatever it gets travels in the page payload. A whole `Course` carries every
 * subtopic and curated link; this is the projection a card actually renders.
 * Pure, so the server page and the client grid share it and a test can call it.
 */

export interface CourseSummaryTopic {
  id: string;
  title: string;
}

export interface CourseSummary {
  slug: string;
  code: string;
  title: string;
  tags: Pick<TagMeta, "id" | "label">[];
  moduleCount: number;
  /** Every curriculum item, in module order then topic order. */
  topics: CourseSummaryTopic[];
}

export function toCourseSummary(course: Course, tags: readonly TagMeta[]): CourseSummary {
  return {
    slug: course.slug,
    code: course.code,
    title: course.title,
    tags: tags.map(({ id, label }) => ({ id, label })),
    moduleCount: course.modules.length,
    topics: [...course.modules]
      .sort((a, b) => a.order - b.order)
      .flatMap((m) => m.topics.map((t) => ({ id: t.id, title: t.title }))),
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
): CourseStatus {
  const total = summary.topics.length;
  const done = summary.topics.filter((t) => completed[t.id]).length;
  const next = summary.topics.find((t) => !completed[t.id]) ?? null;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  let label: string;
  if (total > 0 && next === null) label = "Completed";
  else if (done === 0) label = "Not started";
  else label = `Next: ${next?.title ?? ""}`;
  return { completed: done, total, percent, next, label };
}

/**
 * The Courses page's two filter menus: Progress (every course, or only the
 * ones started and not finished) and Tag (one theme tag, or `null` for every
 * tag). The two combine: "In progress" and "Graphics" is the graphics courses
 * the learner has started.
 */
export type CourseProgressFilter = "all" | "in-progress";
export interface CourseFilter {
  progress: CourseProgressFilter;
  tag: string | null;
}

export const ALL_COURSES: CourseFilter = { progress: "all", tag: null };

/** Started and not finished: at least one topic done and one left. */
export function isInProgress(summary: CourseSummary, completed: Readonly<Record<string, true>>): boolean {
  const status = courseStatus(summary, completed);
  return status.completed > 0 && status.next !== null;
}

export function filterCourses(
  summaries: readonly CourseSummary[],
  query: string,
  filter: CourseFilter,
  completed: Readonly<Record<string, true>>,
): CourseSummary[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return summaries.filter((s) => {
    if (filter.tag !== null && !s.tags.some((t) => t.id === filter.tag)) return false;
    if (filter.progress === "in-progress" && !isInProgress(s, completed)) return false;
    if (words.length === 0) return true;
    const haystack = [s.code, s.title, ...s.tags.map((t) => t.label)].join(" ").toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

/** How many courses carry each tag, for the Tag menu's counts. */
export function tagCounts(summaries: readonly CourseSummary[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of summaries) for (const t of s.tags) out[t.id] = (out[t.id] ?? 0) + 1;
  return out;
}

/** The theme tags any course uses, in the order `content/tags.yaml` lists them. */
export function usedTags(
  all: readonly TagMeta[],
  summaries: readonly CourseSummary[],
): Pick<TagMeta, "id" | "label">[] {
  const used = new Set(summaries.flatMap((s) => s.tags.map((t) => t.id)));
  return all.filter((t) => used.has(t.id)).map(({ id, label }) => ({ id, label }));
}
