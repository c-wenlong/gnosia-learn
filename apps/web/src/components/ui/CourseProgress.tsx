import type { ReactNode } from "react";

import { doneWord } from "@/lib/course-path";

import { cx } from "./classes";
import { ProgressBar } from "./ProgressBar";

/**
 * Kit course progress: how far along a course is, as a bar and the words
 * beside it. The percentage is the caller's: every status that draws it
 * already carries `percent`, worked out once by `percentOf` (so a course with
 * no topics is 0%, never NaN), and the bar is named after the course code.
 *
 * Three places draw it, each keeping its own words:
 *
 * - `count`, Home's Courses in progress: `lead` (the course link) with
 *   "2 of 5 topics" at the end of its line, the bar under them.
 * - `percent`, Continue learning on /courses: "`lead` · 40% done", the bar
 *   under it, named with the counts too.
 * - `headline`, the course page's rail: the percentage large with "done" or
 *   "mastered" beside it, the bar, then "2 of 5 topics done". The word is
 *   `doneWord(conceptBacked)`: "mastered" only when every topic has a concept,
 *   since a tick is not mastery.
 *
 * The counts are the path's rule wherever they come from (`itemDoneWith`,
 * `pathStatus`): a topic with concepts is done when they are mastered, one
 * without when it is ticked. No state and no hooks.
 */
type CourseProgressProps = {
  /** The course code, which names the bar ("CP4284 progress"). */
  code: string;
  done: number;
  total: number;
  /** The status's own `percent` (`percentOf(done, total)`). */
  percent: number;
  className?: string;
} & (
  | { variant: "count"; lead: ReactNode }
  | { variant: "percent"; lead: ReactNode }
  | { variant: "headline"; conceptBacked: boolean }
);

export function CourseProgress(props: CourseProgressProps) {
  const { code, done, total, percent, className } = props;
  if (props.variant === "count") {
    return (
      <div className={cx("flex flex-col gap-2", className)}>
        <div className="flex min-w-0 items-baseline gap-3">
          {props.lead}
          <span className="shrink-0 text-[12px] text-text2 tabular-nums">
            {done} of {total} topics
          </span>
        </div>
        <ProgressBar percent={percent} label={`${code} progress`} />
      </div>
    );
  }
  if (props.variant === "percent") {
    return (
      <div className={cx("flex flex-col gap-3", className)}>
        <p className="text-[14px] text-text2">
          {props.lead} · {percent}% done
        </p>
        <ProgressBar percent={percent} label={`${code} progress, ${done} of ${total} topics`} />
      </div>
    );
  }
  const word = doneWord(props.conceptBacked);
  return (
    <div className={cx("flex flex-col gap-3", className)}>
      <div className="flex items-baseline gap-2">
        <span className="text-[28px] font-semibold leading-8 tabular-nums text-text">{percent}%</span>
        <span className="text-[14px] text-text2">{word}</span>
      </div>
      <ProgressBar percent={percent} label={`${code} progress`} />
      <p className="text-[14px] leading-5 text-text2">
        {done} of {total} topics {word}
      </p>
    </div>
  );
}
