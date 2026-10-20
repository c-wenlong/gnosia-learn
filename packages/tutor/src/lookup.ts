import type { Course, Module, Topic } from "./types";

/**
 * Finding a curriculum item across courses.
 *
 * Pure over the list the caller holds (`await getCourses()` in a page or a
 * route handler), rather than importing it: the list is read per request now,
 * and a lookup that fetched its own copy would either make every caller async
 * or read the courses a second time.
 */

export function findTopicAcrossCourses(
  courses: readonly Course[],
  topicId: string,
):
  | {
      course: Course;
      module: Module;
      topic: Topic;
    }
  | undefined {
  for (const course of courses) {
    for (const mod of course.modules) {
      const topic = mod.topics.find((t) => t.id === topicId);
      if (topic) return { course, module: mod, topic };
    }
  }
  return undefined;
}

export function findTopicBySlugs(
  courses: readonly Course[],
  courseSlug: string,
  moduleSlug: string,
  topicId: string,
):
  | {
      course: Course;
      module: Module;
      topic: Topic;
    }
  | undefined {
  const course = courses.find((c) => c.slug === courseSlug);
  if (!course) return undefined;
  const mod = course.modules.find((m) => m.slug === moduleSlug);
  if (!mod) return undefined;
  const topic = mod.topics.find((t) => t.id === topicId);
  if (!topic) return undefined;
  return { course, module: mod, topic };
}
