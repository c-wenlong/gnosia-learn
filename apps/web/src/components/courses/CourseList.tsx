"use client";

import Link from "next/link";
import { Fragment, useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { Collapse, CollapseChevron } from "@/components/ui/Collapse";
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
  splitByActive,
  tagFilterOptions,
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
 *   cards in Coursera's explore carousels, under a tag menu (All, then
 *   each tag a course uses) and the search field. The menu and the search
 *   narrow the grid only; the Continue learning block is the courses
 *   under way whatever the grid shows.
 * - **Inactive courses**, folded shut under the grid: the courses the learner
 *   set aside with a card's Deactivate button (`inactiveCourses`, a
 *   preference). They leave Continue learning too, and a card's Activate
 *   brings one back. The section opens by itself when a search or tag
 *   matches inside it, and its toggle still closes it.
 *
 * A client component because it filters as you type and because progress
 * comes from `LearnerProvider`, so a topic done on another page shows here
 * without a reload. The server page hands it `CourseSummary` projections and
 * the `ItemStanding` that says which topics are mastered; a tick still only
 * counts for a topic with no concepts, the path's rule.
 *
 * Nothing jumps in or out: Continue learning and the inactive section unfold
 * and fold (`Collapse`; Continue learning keeps its last cards while it
 * folds away), and a card that arrives in a list, from a search, a tag, or
 * an Activate that moved it between sections, fades in.
 */

/** The value while `shown`, and the last one shown while not, for content that folds away. */
function useLastShown<T>(value: T, shown: boolean): T {
  const [last, setLast] = useState(value);
  if (shown && last !== value) setLast(value);
  return shown ? value : last;
}
export function CourseList({
  summaries,
  tags,
  standing,
}: {
  summaries: CourseSummary[];
  tags: { id: string; label: string }[];
  standing: ItemStanding;
}) {
  const { state, setCourseActive } = useLearner();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CourseFilter>(ALL_COURSES);
  // The fold's state as the learner set it, or null to follow the filter:
  // shut, but open while a search or tag matches an inactive course.
  const [inactiveOpen, setInactiveOpen] = useState<boolean | null>(null);

  const continuing = useMemo(
    () =>
      continueLearning(summaries, state.completed, standing, state.lastVisited?.courseSlug, state.inactiveCourses),
    [summaries, state.completed, standing, state.lastVisited?.courseSlug, state.inactiveCourses],
  );
  const inactiveTotal = useMemo(
    () => splitByActive(summaries, state.inactiveCourses).inactive.length,
    [summaries, state.inactiveCourses],
  );
  const shown = useMemo(
    () => splitByActive(filterCourses(summaries, query, filter), state.inactiveCourses),
    [summaries, query, filter, state.inactiveCourses],
  );
  // The tags a set-aside course alone uses leave the menu with it; the tag in
  // use stays, so it can still be turned off.
  const shownTags = useMemo(() => {
    if (inactiveTotal === 0) return tags;
    const used = new Set(
      splitByActive(summaries, state.inactiveCourses).active.flatMap((s) => s.tags.map((t) => t.id)),
    );
    return tags.filter((t) => used.has(t.id) || t.id === filter.tag);
  }, [tags, summaries, state.inactiveCourses, inactiveTotal, filter.tag]);
  // Counted over the active grid: an inactive course that matches shows in the
  // fold, which prints its own count.
  const tagOptions = useMemo(
    () => tagFilterOptions(shownTags, splitByActive(summaries, state.inactiveCourses).active),
    [shownTags, summaries, state.inactiveCourses],
  );
  const filtering = query.trim() !== "" || filter.tag !== null;
  const noMatch = shown.active.length === 0 && shown.inactive.length === 0;
  const showInactive = inactiveOpen ?? (filtering && shown.inactive.length > 0);
  // A fold closed by hand opens again for the next search or tag that
  // matches inside it; one opened by hand stays open.
  const refilter = () => {
    if (inactiveOpen === false) setInactiveOpen(null);
  };
  const changeQuery = (next: string) => {
    setQuery(next);
    refilter();
  };
  const changeFilter = (next: CourseFilter) => {
    setFilter(next);
    refilter();
  };
  const continuingShown = useLastShown(continuing, continuing.length > 0);
  const inactiveShown = useLastShown(inactiveTotal, inactiveTotal > 0);
  const card = (s: CourseSummary, active: boolean) => (
    <CoverCard
      summary={s}
      line={coverLine(s, courseStatus(s, state.completed, standing))}
      active={active}
      onToggle={() => setCourseActive(s.slug, !active)}
    />
  );

  return (
    <div className="flex flex-col">
      <h1 className="font-display text-[28px] leading-tight font-bold text-text">Courses</h1>

      {/* Each fold carries the space above it, so a shut one leaves none. */}
      <Collapse open={continuing.length > 0} className="pt-8">
        <section aria-labelledby="continue-learning" className="flex flex-col gap-4">
          <h2 id="continue-learning" className="text-[20px] leading-tight font-bold text-text">
            Continue learning
          </h2>
          <ul className="flex flex-col gap-4">
            {continuingShown.map((entry) => (
              <li key={entry.summary.slug} className="animate-fade-in motion-reduce:animate-none">
                <ContinueCard entry={entry} />
              </li>
            ))}
          </ul>
        </section>
      </Collapse>

      <section aria-labelledby="all-courses" className="mt-8 flex flex-col gap-4">
        {/* The heading earns its place only beside Continue learning; alone, the page title says it. */}
        <h2
          id="all-courses"
          className={cx("text-[20px] leading-tight font-bold text-text", continuing.length === 0 && "sr-only")}
        >
          {inactiveTotal > 0 ? "Active courses" : "All courses"}
        </h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {shownTags.length > 0 && (
            <FilterMenu
              label="Tag"
              options={tagOptions}
              value={filter.tag ?? ""}
              defaultValue=""
              onChange={(tag) => changeFilter(tag === "" ? ALL_COURSES : { tag })}
            />
          )}
          <SearchField
            label="Search courses"
            placeholder="Search courses"
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
            className="w-full max-sm:order-first sm:ml-auto sm:w-[280px]"
          />
        </div>

        {noMatch ? (
          <Card className="items-start">
            <p className="text-text2">
              No course matches{query.trim() ? ` "${query.trim()}"` : ""}
              {filter.tag !== null ? " with this tag" : ""}.
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                changeQuery("");
                changeFilter(ALL_COURSES);
              }}
            >
              Clear search and tag
            </Button>
          </Card>
        ) : shown.active.length === 0 ? (
          <p className="text-text2">
            {inactiveTotal === summaries.length && !filtering
              ? "Every course is inactive. Activate one below to bring it back here."
              : "No active course matches. The inactive ones that do are below."}
          </p>
        ) : (
          <CourseGrid courses={shown.active} render={(s) => card(s, true)} />
        )}
      </section>

      <Collapse open={inactiveTotal > 0} className="pt-8">
        <section aria-labelledby="inactive-courses" className="flex flex-col gap-4">
          <h2 id="inactive-courses">
            <button
              type="button"
              aria-expanded={showInactive}
              aria-controls="inactive-courses-list"
              onClick={() => setInactiveOpen(!showInactive)}
              className={cx(
                "flex items-center gap-2 rounded-sm text-[20px] leading-tight font-bold text-text",
                LINK_FOCUS,
              )}
            >
              Inactive courses{" "}
              <span className="text-[16px] font-normal text-text2">
                {filtering ? `${shown.inactive.length} of ${inactiveShown}` : inactiveShown}
              </span>
              <CollapseChevron open={showInactive} className="text-text2" />
            </button>
          </h2>
          <Collapse open={showInactive} id="inactive-courses-list">
            {shown.inactive.length === 0 ? (
              <p className="text-text2">No inactive course matches.</p>
            ) : (
              <CourseGrid courses={shown.inactive} render={(s) => card(s, false)} />
            )}
          </Collapse>
        </section>
      </Collapse>
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
 * The cover cards in a grid: two to a row on a phone, where one 16:9 cover
 * per row made ten courses a 3,500px scroll; from 640px up as many 280px
 * columns as fit (four at 1440).
 */
function CourseGrid({ courses, render }: { courses: CourseSummary[]; render: (s: CourseSummary) => ReactNode }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 sm:[grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
      {courses.map((s) => (
        <li key={s.slug} className="group relative flex animate-fade-in motion-reduce:animate-none">
          {render(s)}
        </li>
      ))}
    </ul>
  );
}

/**
 * A compact cover card, after the cards in Coursera's explore carousels: the
 * cover at 16:9 inside an 8px frame, then the code where Coursera puts the
 * partner, the title, and the type line. The whole card is the link.
 *
 * Coursera lifts the card with a shadow on hover; the kit has no shadows, so
 * the border darkens to `--text3` instead.
 *
 * Deactivate (or Activate, on a card set aside) sits on the cover's corner,
 * beside the link rather than inside it, since a button inside a link is
 * invalid. With a mouse it shows on hover or focus only, so ten covers do not
 * each carry a button; on a touch screen it always shows.
 */
function CoverCard({
  summary,
  line,
  active,
  onToggle,
}: {
  summary: CourseSummary;
  line: string[];
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <>
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
          <p className="truncate text-[14px] leading-6 text-text">{summary.code}</p>
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
      <button
        type="button"
        onClick={onToggle}
        aria-label={`${active ? "Deactivate" : "Activate"} ${summary.code}`}
        className={cx(
          "absolute top-3.5 right-3.5 z-10 rounded-full border border-border bg-surface/90 px-2.5 py-1",
          "text-[12px] font-medium text-text backdrop-blur-sm hover:border-text3",
          "transition-opacity duration-200 motion-reduce:transition-none",
          "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100",
          LINK_FOCUS,
        )}
      >
        {active ? "Deactivate" : "Activate"}
      </button>
    </>
  );
}
