"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FilterMenu } from "@/components/ui/FilterMenu";
import type { FilterOption } from "@/components/ui/filter-menu";
import { Placeholder } from "@/components/ui/Placeholder";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SearchField } from "@/components/ui/SearchField";
import type { ItemStanding } from "@/lib/course-path";
import {
  ALL_COURSES,
  courseStatus,
  filterCourses,
  isInProgress,
  tagCounts,
  type CourseFilter,
  type CourseProgressFilter,
  type CourseSummary,
} from "@/lib/course-summary";
import { useLearner } from "@/lib/learner-context";

/** The Tag menu's value for every tag. No tag id is empty, so it cannot collide. */
const ANY_TAG = "";

/**
 * The Courses page's interactive half (hi-fi screen 02): the search field, the
 * two filter menus (Progress and Tag) and the card grid.
 *
 * A client component because it filters as you type and because progress comes
 * from `LearnerProvider`, so ticking a topic on another page shows here
 * without a reload. The server page hands it `CourseSummary` projections, not
 * whole courses, and the `ItemStanding` that says which topics are mastered;
 * a tick still only counts for a topic with no concepts, the path's rule.
 */
export function CourseGrid({
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

  const shown = useMemo(
    () => filterCourses(summaries, query, filter, state.completed, standing),
    [summaries, query, filter, state.completed, standing],
  );

  const progressOptions: FilterOption<CourseProgressFilter>[] = [
    { value: "all", label: "All courses", short: "All", count: summaries.length },
    {
      value: "in-progress",
      label: "In progress",
      count: summaries.filter((s) => isInProgress(s, state.completed, standing)).length,
    },
  ];
  const tagOptions = useMemo(() => {
    const counts = tagCounts(summaries);
    return [
      { value: ANY_TAG, label: "All tags", short: "All" },
      ...tags.map((t) => ({ value: t.id, label: t.label, count: counts[t.id] ?? 0 })),
    ];
  }, [summaries, tags]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h1 className="mr-auto font-display text-[28px] leading-tight font-bold text-text">Courses</h1>
        <SearchField
          label="Search courses"
          placeholder="Search courses"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full sm:w-[280px]"
        />
      </div>

      <div role="group" aria-label="Filter courses" className="flex flex-wrap items-center gap-2">
        <FilterMenu
          label="Progress"
          options={progressOptions}
          value={filter.progress}
          defaultValue="all"
          onChange={(progress) => setFilter((f) => ({ ...f, progress }))}
        />
        {tags.length > 0 && (
          <FilterMenu
            label="Tag"
            options={tagOptions}
            value={filter.tag ?? ANY_TAG}
            defaultValue={ANY_TAG}
            onChange={(tag) => setFilter((f) => ({ ...f, tag: tag === ANY_TAG ? null : tag }))}
          />
        )}
      </div>

      {shown.length === 0 ? (
        <Card className="items-start">
          <p className="text-text2">No course matches{query.trim() ? ` "${query.trim()}"` : ""} with this filter.</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setQuery("");
              setFilter(ALL_COURSES);
            }}
          >
            Clear search and filter
          </Button>
        </Card>
      ) : (
        <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr))]">
          {shown.map((s) => (
            <li key={s.slug} className="flex">
              <CourseTile summary={s} completed={state.completed} standing={standing} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CourseTile({
  summary,
  completed,
  standing,
}: {
  summary: CourseSummary;
  completed: Record<string, true>;
  standing: ItemStanding;
}) {
  const status = courseStatus(summary, completed, standing);
  return (
    <Card as="article" className="w-full gap-2.5">
      {/* No course has cover art yet; the code stands in for it. */}
      <Placeholder label={summary.code} height={96} />
      <h2 className="text-[16px] leading-snug font-bold text-text">
        {summary.code} {summary.title}
      </h2>
      <p className="text-[12px] text-text2">
        {summary.moduleCount} {summary.moduleCount === 1 ? "module" : "modules"} · {summary.topics.length}{" "}
        {summary.topics.length === 1 ? "topic" : "topics"}
      </p>
      <ProgressBar percent={status.percent} label={`${summary.code} progress, ${status.completed} of ${status.total} topics`} className="py-0.5" />
      <div className="mt-auto flex items-center gap-3">
        <p className="min-w-0 flex-1 truncate text-[12px] text-text2" title={status.label}>
          {status.label}
        </p>
        <Button href={`/courses/${summary.slug}`} variant="secondary" size="sm" aria-label={`Open ${summary.code} ${summary.title}`}>
          Open
        </Button>
      </div>
    </Card>
  );
}
