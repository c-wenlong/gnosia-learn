import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { CourseInProgress } from "@/lib/today-core";

/**
 * Courses in progress (hi-fi 01, bottom right): every course with at least
 * one topic ticked, furthest along first, then All courses.
 */
export function CoursesCard({ courses }: { courses: CourseInProgress[] }) {
  return (
    <Card title="Courses in progress" className="items-stretch">
      {courses.length === 0 ? (
        <p className="text-[14px] text-text2">No course started yet. Tick a topic on a course page and it shows here.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {courses.map((c) => (
            <li key={c.slug} className="flex flex-col gap-2">
              <div className="flex min-w-0 items-baseline gap-3">
                <Link
                  href={`/courses/${c.slug}`}
                  className="min-w-0 flex-1 truncate rounded-sm text-[14px] font-medium text-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {c.code} {c.title}
                </Link>
                <span className="shrink-0 text-[12px] text-text2 tabular-nums">
                  {c.completed} of {c.total} topics
                </span>
              </div>
              <ProgressBar percent={c.percent} label={`${c.code} progress`} />
            </li>
          ))}
        </ul>
      )}
      <div>
        <Button href="/courses" variant="secondary" size="sm">
          All courses
        </Button>
      </div>
    </Card>
  );
}
