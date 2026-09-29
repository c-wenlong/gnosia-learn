"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SearchField } from "@/components/ui/SearchField";
import { cx } from "@/components/ui/classes";
import { CourseCover } from "@/components/courses/CourseCover";
import type { ItemStanding } from "@/lib/course-path";
import {
  ALL_COURSES,
  continueLearning,
  courseCounts,
  courseStatus,
  coverLine,
  filterCourses,
  partnerLine,
  type CourseEntry,
  type CourseFilter,
  type CourseSummary,
} from "@/lib/course-summary";
import { useLearner } from "@/lib/learner-context";

const LINK_FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * The Courses page's interactive half, in two sections after Coursera.
 *
 * - **Continue learning**, drawn only when a course is under way: one card
 *   per course in progress, in the shape of My Learning's course card (the
 *   title, the counts and how far along, the progress bar, and an inset card
 *   naming the next topic and its module with a Resume button). The course
 *   last opened comes first.
 * - **The grid**: every course as a compact cover card, in the shape of the
 *   cards in Coursera's explore carousels, under a row of tag chips (All,
 *   then each tag a course uses) and the search field. The chips and the
 *   search narrow the grid only; the Continue learning block is the courses
 *   under way whatever the grid shows.
 *
 * A client component because it filters as you type and because progress
 * comes from `LearnerProvider`, so a topic done on another page shows here
 * without a reload. The server page hands it `CourseSummary` projections and
 * the `ItemStanding` that says which topics are mastered; a tick still only
 * counts for a topic with no concepts, the path's rule.
 */
export function CourseList({
  summaries,
  tags,
  standing,
}: {
  summaries: CourseSummary[];
  tags: { id: string; label: string }[];
  standing: ItemStanding;
}) {
  const { state } = useLearner();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CourseFilter>(ALL_COURSES);

  const continuing = useMemo(
    () => continueLearning(summaries, state.completed, standing, state.lastVisited?.courseSlug),
    [summaries, state.completed, standing, state.lastVisited?.courseSlug],
  );
  const shown = useMemo(() => filterCourses(summaries, query, filter), [summaries, query, filter]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-[28px] leading-tight font-bold text-text">Courses</h1>

      {continuing.length > 0 && (
        <section aria-labelledby="continue-learning" className="flex flex-col gap-4">
          <h2 id="continue-learning" className="text-[20px] leading-tight font-bold text-text">
            Continue learning
          </h2>
          <ul className="flex flex-col gap-4">
            {continuing.map((entry) => (
              <li key={entry.summary.slug}>
                <ContinueCard entry={entry} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="all-courses" className="flex flex-col gap-4">
        {/* The heading earns its place only beside Continue learning; alone, the page title says it. */}
        <h2
          id="all-courses"
          className={cx("text-[20px] leading-tight font-bold text-text", continuing.length === 0 && "sr-only")}
        >
          All courses
        </h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {tags.length > 0 && (
            <div
              role="group"
              aria-label="Filter by tag"
              className="-mx-4 flex min-w-0 flex-1 gap-2 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
            >
              <Chip active={filter.tag === null} onClick={() => setFilter(ALL_COURSES)}>
                All
              </Chip>
              {tags.map((t) => (
                <Chip
                  key={t.id}
                  active={filter.tag === t.id}
                  onClick={() => setFilter({ tag: filter.tag === t.id ? null : t.id })}
                >
                  {t.label}
                </Chip>
              ))}
            </div>
          )}
          <SearchField
            label="Search courses"
            placeholder="Search courses"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full max-sm:order-first sm:ml-auto sm:w-[280px]"
          />
        </div>

        {shown.length === 0 ? (
          <Card className="items-start">
            <p className="text-text2">
              No course matches{query.trim() ? ` "${query.trim()}"` : ""}
              {filter.tag !== null ? " with this tag" : ""}.
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setQuery("");
                setFilter(ALL_COURSES);
              }}
            >
              Clear search and tag
            </Button>
          </Card>
        ) : (
          // Two to a row on a phone, where one 16:9 cover per row made ten courses
          // a 3,500px scroll; from 640px up as many 280px columns as fit (four at 1440).
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 sm:[grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
            {shown.map((s) => (
              <li key={s.slug} className="flex">
                <CoverCard summary={s} line={coverLine(s, courseStatus(s, state.completed, standing))} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * A course under way, after My Learning's course card: the course and how
 * far along it is on the left, and on the right an inset card naming the
 * next topic and its module, with Resume. Both links go to the course page,
 * which opens on where the learner is.
 */
function ContinueCard({ entry: { summary, status } }: { entry: CourseEntry }) {
  const next = status.next;
  return (
    <Card as="article" className="gap-4 md:flex-row md:items-center md:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="text-[16px] leading-snug font-bold text-text">
          <Link
            href={`/courses/${summary.slug}`}
            className={cx("rounded-sm underline-offset-4 hover:underline", LINK_FOCUS)}
          >
            {summary.code} {summary.title}
          </Link>
        </h3>
        <p className="text-[14px] text-text2">
          {courseCounts(summary)} · {status.percent}% done
        </p>
        <ProgressBar
          percent={status.percent}
          label={`${summary.code} progress, ${status.completed} of ${status.total} topics`}
          className="mt-2"
        />
      </div>
      {next !== null && (
        <div className="flex min-w-0 items-center gap-4 rounded-2xl border-2 border-hair p-4 md:w-[380px] md:shrink-0">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] leading-5 font-semibold text-text" title={next.title}>
              {next.title}
            </p>
            <p className="mt-1 truncate text-[13px] text-text2" title={next.moduleTitle}>
              Module {next.moduleOrder} · {next.moduleTitle}
            </p>
          </div>
          <Button
            href={`/courses/${summary.slug}/${next.moduleSlug}`}
            size="sm"
            aria-label={`Resume ${summary.code}: ${next.title}`}
          >
            Resume
          </Button>
        </div>
      )}
    </Card>
  );
}

/**
 * A compact cover card, after the cards in Coursera's explore carousels: the
 * cover at 16:9 inside an 8px frame, then the code where Coursera puts the
 * partner, the title, and the type line. The whole card is the link.
 *
 * Coursera lifts the card with a shadow on hover; the kit has no shadows, so
 * the border darkens to `--text3` instead.
 */
function CoverCard({ summary, line }: { summary: CourseSummary; line: string[] }) {
  return (
    <Link
      href={`/courses/${summary.slug}`}
      className={cx(
        "flex w-full min-w-0 flex-col rounded-2xl border border-border bg-surface p-2",
        "transition-colors duration-300 hover:border-text3 motion-reduce:transition-none",
        LINK_FOCUS,
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-lg">
        <CourseCover src={summary.cover} code={summary.code} />
      </div>
      <div className="flex flex-1 flex-col px-2 pt-2.5 pb-2">
        <p className="truncate text-[14px] leading-6 text-text">{partnerLine(summary)}</p>
        <h3 className="mt-1 line-clamp-2 text-[16px] leading-5 font-semibold text-text">{summary.title}</h3>
        <p className="mt-auto pt-2 text-[12px] leading-[18px] text-text2">
          {/* Each part keeps to one line, so a narrow card breaks between parts, never inside one. */}
          {line.map((part, i) => (
            <Fragment key={part}>
              {i > 0 && " "}
              <span className="whitespace-nowrap">
                {part}
                {i < line.length - 1 && " ·"}
              </span>
            </Fragment>
          ))}
        </p>
      </div>
    </Link>
  );
}
