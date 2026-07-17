"use client";

import type { Course } from "@/lib/types";
import { ProgressBar } from "@/components/ProgressBar";
import { courseProgress } from "@/lib/progress";
import { useLearner } from "@/lib/learner-context";

export function CourseProgressHeader({ course }: { course: Course }) {
  const { state } = useLearner();
  const progress = courseProgress(course, state.completed);

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="mb-2 text-sm font-medium text-[var(--muted-strong)]">
        Course progress
      </p>
      <ProgressBar progress={progress} />
    </section>
  );
}
