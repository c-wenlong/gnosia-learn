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

/** The filter the chips set: everything, only courses with progress, or one theme tag. */
export type CourseFilter = { kind: "all" } | { kind: "in-progress" } | { kind: "tag"; tag: string };

export function filterCourses(
  summaries: readonly CourseSummary[],
  query: string,
  filter: CourseFilter,
  completed: Readonly<Record<string, true>>,
): CourseSummary[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return summaries.filter((s) => {
    if (filter.kind === "tag" && !s.tags.some((t) => t.id === filter.tag)) return false;
    if (filter.kind === "in-progress") {
      const status = courseStatus(s, completed);
      if (status.completed === 0 || status.next === null) return false;
    }
    if (words.length === 0) return true;
    const haystack = [s.code, s.title, ...s.tags.map((t) => t.label)].join(" ").toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

/** The theme tags any course uses, in the order `content/tags.yaml` lists them. */
export function usedTags(
  all: readonly TagMeta[],
  summaries: readonly CourseSummary[],
): Pick<TagMeta, "id" | "label">[] {
  const used = new Set(summaries.flatMap((s) => s.tags.map((t) => t.id)));
  return all.filter((t) => used.has(t.id)).map(({ id, label }) => ({ id, label }));
}
