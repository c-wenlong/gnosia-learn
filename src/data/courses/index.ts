import type { Course, Module, Topic } from "@/lib/types";
import { cp4281 } from "./cp4281";
import { cp4282 } from "./cp4282";
import { cp4283 } from "./cp4283";
import { cp4284 } from "./cp4284";
import { cp4285 } from "./cp4285";
import { cs2111 } from "./cs2111";
import { cs3216 } from "./cs3216";
import { cs3227 } from "./cs3227";
import { cs3249 } from "./cs3249";
import { cs4263 } from "./cs4263";

export const courses: Course[] = [
  cs2111,
  cs4263,
  cp4281,
  cp4282,
  cp4283,
  cp4284,
  cp4285,
  cs3216,
  cs3227,
  cs3249,
];

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
