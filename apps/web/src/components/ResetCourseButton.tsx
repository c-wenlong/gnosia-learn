"use client";

import { Button } from "@/components/ui/Button";
import { useLearner } from "@/lib/learner-context";

/** The course header's Reset: clears the course's ticks and notes after a confirm. */
export function ResetCourseButton({ topicIds }: { topicIds: string[] }) {
  const { resetCourse } = useLearner();

  return (
    <Button
      variant="secondary"
      title="Reset course progress"
      onClick={() => {
        if (
          window.confirm(
            "Reset all progress and notes for this course? Saved topic recaps are kept. This cannot be undone.",
          )
        ) {
          resetCourse(topicIds);
        }
      }}
    >
      Reset
    </Button>
  );
}
