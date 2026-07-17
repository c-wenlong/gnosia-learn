import type { Course, Module, ProgressCounts } from "@/lib/types";
import {
  getAllTopicIds,
  getCourseTopicIds,
  getModuleTopicIds,
} from "@/data/courses";

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
  return countsFromIds(getModuleTopicIds(module), completed);
}

export function courseProgress(
  course: Course,
  completed: Record<string, true>,
): ProgressCounts {
  return countsFromIds(getCourseTopicIds(course), completed);
}

export function globalProgress(
  completed: Record<string, true>,
): ProgressCounts {
  return countsFromIds(getAllTopicIds(), completed);
}

export function formatProgress(p: ProgressCounts): string {
  if (p.total === 0) return "0/0";
  return `${p.completed}/${p.total}`;
}
