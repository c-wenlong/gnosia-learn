import { describe, expect, it } from "vitest";
import { courses } from "@/data/courses";
import {
  countsFromIds,
  courseProgress,
  formatProgress,
  globalProgress,
  moduleProgress,
} from "@/lib/progress";

describe("countsFromIds", () => {
  it("returns zero percent for empty topic lists", () => {
    expect(countsFromIds([], {})).toEqual({
      completed: 0,
      total: 0,
      percent: 0,
    });
  });

  it("counts completed topics and rounds percent", () => {
    expect(
      countsFromIds(["a", "b", "c"], { a: true, c: true }),
    ).toEqual({ completed: 2, total: 3, percent: 67 });
  });
});

describe("formatProgress", () => {
  it("formats counts as completed/total", () => {
    expect(formatProgress({ completed: 2, total: 5, percent: 40 })).toBe(
      "2/5",
    );
  });

  it("handles empty totals", () => {
    expect(formatProgress({ completed: 0, total: 0, percent: 0 })).toBe(
      "0/0",
    );
  });
});

describe("curriculum progress helpers", () => {
  const course = courses[0];
  const mod = course.modules[0];
  const topicId = mod.topics[0].id;

  it("computes module progress from completed map", () => {
    const progress = moduleProgress(mod, { [topicId]: true });
    expect(progress.total).toBe(mod.topics.length);
    expect(progress.completed).toBe(1);
    expect(progress.percent).toBeGreaterThan(0);
  });

  it("computes course progress across modules", () => {
    const progress = courseProgress(course, { [topicId]: true });
    expect(progress.total).toBeGreaterThan(mod.topics.length);
    expect(progress.completed).toBe(1);
  });

  it("computes global progress across the shortlist", () => {
    const progress = globalProgress({ [topicId]: true });
    expect(progress.total).toBeGreaterThan(course.modules.length);
    expect(progress.completed).toBe(1);
  });
});
