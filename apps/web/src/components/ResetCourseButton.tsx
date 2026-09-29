"use client";

import { Button } from "@/components/ui/Button";
import { useLearner } from "@/lib/learner-context";

/**
 * The course page's Reset: clears the course's ticks and notes after a
 * confirm. Mastery is the learn pipeline's event log, which is append-only,
 * so a topic backed by a concept keeps its mark; the confirm says so.
 */
export function ResetCourseButton({ topicIds, size }: { topicIds: string[]; size?: "sm" | "md" }) {
  const { resetCourse } = useLearner();

  return (
    <Button
      variant="secondary"
      size={size}
      title="Clear this course's ticks and notes"
      onClick={() => {
        if (
          window.confirm(
            "Clear your ticks and notes for this course? Saved recaps are kept, and so is mastery from study sessions, which moves only when you are tested. This cannot be undone.",
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
