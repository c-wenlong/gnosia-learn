import type { Course, Module } from "@/lib/types";

/**
 * Pure functions over a course the caller already has.
 *
 * The distinction that matters: `@/data/courses` *finds* courses and therefore
 * reads the filesystem, which makes it server-only. Everything here derives
 * something from a course object that was handed in, so a `"use client"`
 * component can use it on data it received as props.
 */

export function moduleTopicIds(module: Module): string[] {
  return module.topics.map((t) => t.id);
}

export function courseTopicIds(course: Course): string[] {
  return course.modules.flatMap(moduleTopicIds);
}

/**
 * What the sidebar needs, and nothing else.
 *
 * The sidebar renders on every page, so its data travels in every page's
 * payload. Handing it whole `Course` objects would ship every subtopic and
 * every curated link ten times over to render a list of titles and a pair of
 * progress counts. This is that list.
 */
export interface ModuleNavEntry {
  id: string;
  slug: string;
  title: string;
  order: number;
  /** Needed for the module's progress count, which is the only sum shown. */
  topicIds: string[];
}

export interface CourseNavEntry {
  id: string;
  slug: string;
  code: string;
  title: string;
  modules: ModuleNavEntry[];
}

export function toCourseNav(courses: readonly Course[]): CourseNavEntry[] {
  return courses.map((course) => ({
    id: course.id,
    slug: course.slug,
    code: course.code,
    title: course.title,
    modules: course.modules.map((mod) => ({
      id: mod.id,
      slug: mod.slug,
      title: mod.title,
      order: mod.order,
      topicIds: moduleTopicIds(mod),
    })),
  }));
}

export function navTopicIds(nav: readonly CourseNavEntry[]): string[] {
  return nav.flatMap((course) => course.modules.flatMap((m) => m.topicIds));
}

export function navCourseTopicIds(course: CourseNavEntry): string[] {
  return course.modules.flatMap((m) => m.topicIds);
}
