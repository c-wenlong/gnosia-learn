"use client";

import { useLearner } from "@/lib/learner-context";

export function ResetCourseButton({ topicIds }: { topicIds: string[] }) {
  const { resetCourse } = useLearner();

  return (
    <button
      type="button"
      onClick={() => {
        if (
          window.confirm(
            "Reset all progress and notes for this course? This cannot be undone.",
          )
        ) {
          resetCourse(topicIds);
        }
      }}
      className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted-strong)] hover:border-red-300 hover:text-red-700 dark:hover:border-red-700 dark:hover:text-red-300"
    >
      Reset course progress
    </button>
  );
}
