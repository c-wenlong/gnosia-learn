"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Placeholder } from "@/components/ui/Placeholder";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SearchField } from "@/components/ui/SearchField";
import {
  courseStatus,
  filterCourses,
  type CourseFilter,
  type CourseSummary,
} from "@/lib/course-summary";
import { useLearner } from "@/lib/learner-context";

/**
 * The Courses page's interactive half (hi-fi screen 02): the search field, the
 * filter chips and the card grid.
 *
 * A client component because it filters as you type and because progress comes
 * from `LearnerProvider`, so ticking a topic on another page shows here
 * without a reload. The server page hands it `CourseSummary` projections, not
 * whole courses.
 */
export function CourseGrid({
  summaries,
  tags,
}: {
  summaries: CourseSummary[];
  tags: { id: string; label: string }[];
}) {
  const { state } = useLearner();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CourseFilter>({ kind: "all" });

  const shown = useMemo(
    () => filterCourses(summaries, query, filter, state.completed),
    [summaries, query, filter, state.completed],
  );

  const isOn = (f: CourseFilter) =>
    f.kind === filter.kind && (f.kind !== "tag" || (filter.kind === "tag" && filter.tag === f.tag));

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

      <div role="group" aria-label="Filter courses" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
        <Chip active={isOn({ kind: "all" })} onClick={() => setFilter({ kind: "all" })}>
          All
        </Chip>
        <Chip active={isOn({ kind: "in-progress" })} onClick={() => setFilter({ kind: "in-progress" })}>
          In progress
        </Chip>
        {tags.map((t) => (
          <Chip key={t.id} active={isOn({ kind: "tag", tag: t.id })} onClick={() => setFilter({ kind: "tag", tag: t.id })}>
            {t.label}
          </Chip>
        ))}
      </div>

      {shown.length === 0 ? (
        <Card className="items-start">
          <p className="text-text2">No course matches{query.trim() ? ` "${query.trim()}"` : ""} with this filter.</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setQuery("");
              setFilter({ kind: "all" });
            }}
          >
            Clear search and filter
          </Button>
        </Card>
      ) : (
        <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr))]">
          {shown.map((s) => (
            <li key={s.slug} className="flex">
              <CourseTile summary={s} completed={state.completed} />
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
}: {
  summary: CourseSummary;
  completed: Record<string, true>;
}) {
  const status = courseStatus(summary, completed);
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
