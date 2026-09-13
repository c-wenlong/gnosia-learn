import { courses } from "@/data/courses";
import type { Course, Module, Topic } from "@/lib/types";

export function findTopicAcrossCourses(topicId: string):
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
