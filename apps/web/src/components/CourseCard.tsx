"use client";

import Link from "next/link";
import type { Course, TagMeta } from "@/lib/types";
import { TagChip } from "@/components/TagChip";
import { ProgressBar } from "@/components/ProgressBar";
import { courseProgress } from "@/lib/progress";
import { useLearner } from "@/lib/learner-context";

/**
 * `tags` is the resolved metadata for `course.tags`, handed in by the server
 * page: the theme list lives in `content/tags.yaml` and this is a client
 * component, so it cannot look them up itself.
 */
export function CourseCard({
  course,
  tags,
}: {
  course: Course;
  tags: TagMeta[];
}) {
  const { state } = useLearner();
  const progress = courseProgress(course, state.completed);

  return (
    <Link
      href={`/courses/${course.slug}`}
      className="block rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--surface-hover)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-xs font-medium text-[var(--accent-strong)]">
            {course.code}
          </p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-[var(--foreground)]">
            {course.title}
          </h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {course.inferred && (
            <span className="rounded-md border border-[var(--warn-border)] bg-[var(--warn-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--warn)]">
              Inferred
            </span>
          )}
          <span className="rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--muted-strong)]">
            {course.credits} MC
          </span>
        </div>
      </div>
      {course.notes && (
        <p className="mt-2 line-clamp-2 text-sm text-[var(--muted-strong)]">
          {course.notes}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <TagChip key={t.id} tag={t} size="sm" />
        ))}
      </div>
      <div className="mt-4">
        <ProgressBar progress={progress} size="sm" />
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]">
        {course.modules.length} modules ·{" "}
        {course.modules.reduce((n, m) => n + m.topics.length, 0)} topics
      </p>
    </Link>
  );
}
