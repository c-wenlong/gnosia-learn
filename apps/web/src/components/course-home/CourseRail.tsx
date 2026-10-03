"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { ResetCourseButton } from "@/components/ResetCourseButton";
import { Button } from "@/components/ui/Button";
import { cx, LABEL } from "@/components/ui/classes";
import { Panel } from "@/components/ui/Panel";
import { ProgressBar } from "@/components/ui/ProgressBar";
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

      {next && showNext && (
        <RailCard title="Next up">
          <div>
            <p className="text-[16px] font-semibold leading-6 text-text">{next.topic.title}</p>
            <p className="text-[14px] leading-5 text-text2">
              {topicMeta(mastery[next.topic.id], false)} · Module {next.module.order}
            </p>
          </div>
          <Button href={moduleHref(course.slug, next.module.slug)} variant="secondary" size="sm" className="self-start">
            Open module {next.module.order}
          </Button>
        </RailCard>
      )}

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
          <p className="rounded-xl border-l-4 border-warn bg-warn-tint px-3 py-2 text-[13px] leading-5 text-text">
            <strong className="font-semibold">Inferred roadmap.</strong> The official syllabus is not published yet, so
            these topics are inferred from the course announcement and may change.
          </p>
        )}
      </RailCard>

      {related.length > 0 && (
        <RailCard title="Related courses">
          <ul className="flex flex-col gap-2">
            {related.map((r) => (
              <li key={r.slug} className="text-[14px] leading-5">
                <Link href={`/courses/${r.slug}`} className="font-medium text-accent-text underline-offset-4 hover:underline">
                  {r.code} {r.title}
                </Link>
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
