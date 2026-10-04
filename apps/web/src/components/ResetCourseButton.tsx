"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Collapse } from "@/components/ui/Collapse";
import { useLearner } from "@/lib/learner-context";

/**
 * The course page's Reset: clears the course's ticks and notes after a
 * confirm. Mastery is the learn pipeline's event log, which is append-only,
 * so a topic backed by a concept keeps its mark; the confirm says so.
 *
 * The confirm opens in place under the button (`Collapse`), as Settings'
 * Reset progress does, where it was a `window.confirm` that froze the page
 * in a box the app could not style or animate. It takes a row of its own in
 * the button row it sits in (`basis-full`), carrying the row's gap inside the
 * fold so a shut confirm adds no space. Cancel and a reset both put focus
 * back on Reset, since the button pressed folds away.
 */
export function ResetCourseButton({ topicIds, size }: { topicIds: string[]; size?: "sm" | "md" }) {
  const { resetCourse } = useLearner();
  const [confirming, setConfirming] = useState(false);
  const confirmId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current || confirming) return;
    refocus.current = false;
    toggle.current?.focus();
  }, [confirming]);

  const close = () => {
    refocus.current = true;
    setConfirming(false);
  };

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
        <Collapse open={confirming} id={confirmId} className="pt-2.5">
          <div
            role="group"
            aria-label="Confirm reset"
            className="flex flex-col gap-3 rounded-2xl border-2 border-warn bg-warn-tint p-3.5"
          >
            <p className="text-[14px] leading-5 text-text">
              Clear your ticks and notes for this course? Saved recaps are kept, and so is mastery from study sessions,
              which moves only when you are tested. This cannot be undone.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <Button
                variant="warn"
                size="sm"
                onClick={() => {
                  void resetCourse(topicIds);
                  close();
                }}
              >
                Reset course
              </Button>
              <Button variant="secondary" size="sm" onClick={close}>
                Cancel
              </Button>
            </div>
          </div>
        </Collapse>
      </div>
    </>
  );
}
