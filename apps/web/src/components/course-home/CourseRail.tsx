"use client";

import { useState, type ReactNode } from "react";

import { ResetCourseButton } from "@/components/ResetCourseButton";
import { Button } from "@/components/ui/Button";
import { cx, LABEL } from "@/components/ui/classes";
import { Collapse } from "@/components/ui/Collapse";
import { Panel } from "@/components/ui/Panel";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { TextLink } from "@/components/ui/TextLink";
import { Callout } from "@/components/ui/Callout";
import { doneWord, moduleHref, topicMeta, type PathStatus, type TopicMastery } from "@/lib/course-path";
import type { Course, Module, Topic } from "@/lib/types";

import type { RelatedCourse } from "./types";

/**
 * The right rail, after Coursera's stacked rail cards: the course's progress
 * with Continue and Reset, the topic that is next when it is not in the
 * module on screen, what the course is, and the courses related to it.
 *
 * Coursera's weekly target and timeline have no data behind them here (the
 * daily target lives in the top bar, and courses carry no dates), so the rail
 * is built from what the course file and the learner's standing do hold.
 *
 * Next up unfolds and folds (`Collapse`) as the next topic leaves or enters
 * the module on screen, keeping the topic it last named while it folds.
 */
export function CourseRail({
  course,
  status,
  mastery,
  next,
  continueHref,
  showNext,
  related,
  className,
}: {
  course: Course;
  status: PathStatus;
  mastery: Record<string, TopicMastery>;
  /** The active topic and its module; null on a finished course. */
  next: { module: Module; topic: Topic } | null;
  continueHref: string | null;
  /** Whether the next topic is off screen, so the card pointing at it earns its place. */
  showNext: boolean;
  related: RelatedCourse[];
  className?: string;
}) {
  const topicIds = course.modules.flatMap((m) => m.topics.map((t) => t.id));
  const nextOpen = next !== null && showNext;
  const [lastNext, setLastNext] = useState(next);
  // Compared by the topic and module themselves: `next` is a new object on
  // every render of the page.
  if (nextOpen && (next.topic !== lastNext?.topic || next.module !== lastNext?.module)) setLastNext(next);
  const nextShown = nextOpen ? next : lastNext;
  return (
    <div className={cx("flex min-w-0 flex-col gap-4", className)}>
      <RailCard title="Course progress">
        <div className="flex items-baseline gap-2">
          <span className="text-[28px] font-semibold leading-8 tabular-nums text-text">{status.percent}%</span>
          <span className="text-[14px] text-text2">{doneWord(status.conceptBacked)}</span>
        </div>
        <ProgressBar percent={status.percent} label={`${course.code} progress`} />
        <p className="text-[14px] leading-5 text-text2">
          {status.doneCount} of {status.total} topics {doneWord(status.conceptBacked)}
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          {continueHref ? (
            <Button href={continueHref} size="sm">
              Continue
            </Button>
          ) : (
            <p className="text-[14px] font-semibold text-ok-text">Course complete</p>
          )}
          <ResetCourseButton topicIds={topicIds} size="sm" />
        </div>
      </RailCard>

      {/* The column's gap is folded into the card, so a shut card leaves none. */}
      <div className="-mt-4">
        <Collapse open={nextOpen} className="pt-4">
          {nextShown && (
            <RailCard title="Next up">
              <div>
                <p className="text-[16px] font-semibold leading-6 text-text">{nextShown.topic.title}</p>
                <p className="text-[14px] leading-5 text-text2">
                  {topicMeta(mastery[nextShown.topic.id], false)} · Module {nextShown.module.order}
                </p>
              </div>
              <Button
                href={moduleHref(course.slug, nextShown.module.slug)}
                variant="secondary"
                size="sm"
                className="self-start"
              >
                Open module {nextShown.module.order}
              </Button>
            </RailCard>
          )}
        </Collapse>
      </div>

      <RailCard title="About this course">
        {/* The course file's `notes` is its summary: what the course covers. */}
        {course.notes && <p className="text-[14px] leading-5 text-text">{course.notes}</p>}
        {course.track && <p className="text-[14px] leading-5 text-text2">{course.track}</p>}
        {course.prereq && (
          <div>
            <p className={LABEL}>Prerequisites</p>
            <p className="mt-1 text-[14px] leading-5 text-text">{course.prereq}</p>
          </div>
        )}
        {course.capstone && (
          <div>
            <p className={LABEL}>Capstone</p>
            <p className="mt-1 text-[14px] leading-5 text-text">{course.capstone}</p>
          </div>
        )}
        {course.inferred && (
          <Callout title="Inferred roadmap">
            The official syllabus is not published yet, so these topics are inferred from the course announcement and
            may change.
          </Callout>
        )}
      </RailCard>

      {related.length > 0 && (
        <RailCard title="Related courses">
          <ul className="flex flex-col gap-2">
            {related.map((r) => (
              <li key={r.slug} className="text-[14px] leading-5">
                <TextLink href={`/courses/${r.slug}`}>
                  {r.code} {r.title}
                </TextLink>
                {r.shared.length > 0 && <span className="block text-text2">{r.shared.join(", ")}</span>}
              </li>
            ))}
          </ul>
        </RailCard>
      )}
    </div>
  );
}

/** A rail card: Coursera's 24px padding and 16/20 heading, on our surface. */
function RailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel as="section">
      <div className="flex flex-col gap-3 p-2">
        <h2 className="text-[16px] font-semibold leading-5 text-text">{title}</h2>
        {children}
      </div>
    </Panel>
  );
}
