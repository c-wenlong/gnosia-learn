import "server-only";

import { cache } from "react";

import { contentSource } from "@/data/source";
import type { Course, Module, Topic } from "@/lib/types";

/**
 * The app's view of the courses.
 *
 * Read from the `collection` and `curriculum_item` rows through the content
 * seam, database only since phase 2 (`@/data/source`): a course that is not
 * flipped, or a database that does not answer, throws, and the page's error
 * boundary says so.
 *
 * **Async, and once per request.** The list used to be a module-level
 * constant, read once per process. That cannot be served from the database, so it
 * is `getCourses()` now, through the content seam (`@/data/source`), and
 * wrapped in React's `cache()` so one render asks once however many
 * components want it. Pages hold the list and pass it on; the lookups below
 * that need every course take it as an argument, so nothing under `lib/` has
 * to be async to use them.
 *
 * **Server only.** Reading content reaches the database, and `server-only`
 * makes a `"use client"` module that reaches it fail at build time rather
 * than shipping a database driver to the browser. Client components take the course, module and topic they need as
 * props; the pure helpers they still want are in `@/lib/curriculum`.
 */
export const getCourses = cache(async (): Promise<Course[]> => contentSource().courses());

export async function getCourse(slug: string): Promise<Course | undefined> {
  return (await getCourses()).find((c) => c.slug === slug);
}

export function getModule(
  course: Course,
  moduleSlug: string,
): Module | undefined {
  return course.modules.find((m) => m.slug === moduleSlug);
}

/** Every curriculum item id across `courses`, in course and module order. */
export function getAllTopicIds(courses: readonly Course[]): string[] {
  return courses.flatMap((c) =>
    c.modules.flatMap((m) => m.topics.map((t) => t.id)),
  );
}

export function getCourseTopicIds(course: Course): string[] {
  return course.modules.flatMap((m) => m.topics.map((t) => t.id));
}

export function getModuleTopicIds(module: Module): string[] {
  return module.topics.map((t) => t.id);
}

/** The other courses in `courses` that share a theme with `course`. */
export function getRelatedCourses(
  courses: readonly Course[],
  course: Course,
): Course[] {
  if (course.tags.length === 0) return [];
  return courses.filter(
    (c) =>
      c.id !== course.id && c.tags.some((tag) => course.tags.includes(tag)),
  );
}

export function findTopic(
  course: Course,
  topicId: string,
): { module: Module; topic: Topic } | undefined {
  for (const mod of course.modules) {
    const topic = mod.topics.find((t) => t.id === topicId);
    if (topic) return { module: mod, topic };
  }
  return undefined;
}

export function totalTopicCount(courses: readonly Course[]): number {
  return getAllTopicIds(courses).length;
}
