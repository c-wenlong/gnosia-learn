import "server-only";

import { loadCourses } from "@self-learn/content";

import { REPO_ROOT } from "@/data/repo-root";
import type { Course, Module, Topic } from "@/lib/types";

/**
 * The app's view of `content/courses/*.yaml`.
 *
 * Ten TypeScript files used to live here and a parity test kept them in step
 * with the YAML. Now there is one representation, read by one parser that the
 * catalog indexer also uses, so "what does this course file mean" has a single
 * answer.
 *
 * **Server only.** `loadCourses()` reads the filesystem, and `server-only`
 * makes a `"use client"` module that reaches it fail at build time rather than
 * shipping a YAML parser and every course file to the browser. Client
 * components take the course, module and topic they need as props; the pure
 * helpers they still want are in `@/lib/curriculum`.
 *
 * Read once per process. Course files do not change while the server is up,
 * and a Next build resolves `generateStaticParams` for every route from this
 * array.
 */
export const courses: Course[] = loadCourses({ root: REPO_ROOT });

export function getCourse(slug: string): Course | undefined {
  return courses.find((c) => c.slug === slug);
}

export function getModule(
  course: Course,
  moduleSlug: string,
): Module | undefined {
  return course.modules.find((m) => m.slug === moduleSlug);
}

export function getAllTopicIds(course?: Course): string[] {
  const list = course ? [course] : courses;
  return list.flatMap((c) =>
    c.modules.flatMap((m) => m.topics.map((t) => t.id)),
  );
}

export function getCourseTopicIds(course: Course): string[] {
  return course.modules.flatMap((m) => m.topics.map((t) => t.id));
}

export function getModuleTopicIds(module: Module): string[] {
  return module.topics.map((t) => t.id);
}

export function getRelatedCourses(course: Course): Course[] {
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

export function totalTopicCount(): number {
  return getAllTopicIds().length;
}
