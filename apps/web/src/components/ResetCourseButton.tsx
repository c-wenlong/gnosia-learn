"use client";

import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { ConfirmFold } from "@/components/ui/ConfirmFold";
import { useLearner } from "@/lib/learner-context";

/**
 * The course page's Reset: clears the course's ticks and notes after a
 * confirm. Mastery is the learn pipeline's event log, which is append-only,
 * so a topic backed by a concept keeps its mark; the confirm says so.
 *
 * The confirm opens in place under the button (the kit's `ConfirmFold`), as
 * Settings' Reset progress does, where it was a `window.confirm` that froze
 * the page in a box the app could not style or animate. It takes a row of its
 * own in the button row it sits in (`basis-full`), carrying the row's gap
 * inside the fold so a shut confirm adds no space. Cancel and a reset both put
 * focus back on Reset, since the button pressed folds away.
 */
export function ResetCourseButton({ topicIds, size }: { topicIds: string[]; size?: "sm" | "md" }) {
  const { resetCourse } = useLearner();
  const [confirming, setConfirming] = useState(false);
  const confirmId = useId();
  const toggle = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Button
        ref={toggle}
        variant="secondary"
        size={size}
        title="Clear this course's ticks and notes"
        aria-expanded={confirming}
        aria-controls={confirmId}
        onClick={() => setConfirming((v) => !v)}
      >
        Reset
      </Button>
      <div className="-mt-2.5 basis-full">
        <ConfirmFold
          open={confirming}
          id={confirmId}
          className="pt-2.5"
          label="Confirm reset"
          message="Clear your ticks and notes for this course? Saved recaps are kept, and so is mastery from study sessions, which moves only when you are tested. This cannot be undone."
          confirmLabel="Reset course"
          onConfirm={() => {
            void resetCourse(topicIds);
            setConfirming(false);
          }}
          onCancel={() => setConfirming(false)}
          returnFocusTo={toggle}
        />
      </div>
    </>
  );
}
