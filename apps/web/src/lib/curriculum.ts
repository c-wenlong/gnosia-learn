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
