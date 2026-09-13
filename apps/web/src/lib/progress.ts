import { courseTopicIds, moduleTopicIds } from "@/lib/curriculum";
import type { Course, Module, ProgressCounts } from "@/lib/types";

/**
 * Progress arithmetic over a course a caller already holds.
 *
 * Every one of these runs inside a `"use client"` component, so nothing here
 * may reach `@/data/courses`: that module reads the filesystem. Whole-shortlist
 * progress is `countsFromIds(navTopicIds(nav), completed)` in `AppShell`, where
 * the server layout has already handed down the ids.
 */

export function countsFromIds(
  topicIds: string[],
  completed: Record<string, true>,
): ProgressCounts {
  const total = topicIds.length;
  const done = topicIds.filter((id) => completed[id]).length;
  return {
    completed: done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

export function moduleProgress(
  module: Module,
  completed: Record<string, true>,
): ProgressCounts {
  return countsFromIds(moduleTopicIds(module), completed);
}

export function courseProgress(
  course: Course,
  completed: Record<string, true>,
): ProgressCounts {
  return countsFromIds(courseTopicIds(course), completed);
}

export function formatProgress(p: ProgressCounts): string {
  if (p.total === 0) return "0/0";
  return `${p.completed}/${p.total}`;
}
