import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CourseProgress } from "@/components/ui/CourseProgress";
import type { CourseInProgress } from "@/lib/home-core";
import { cx, FOCUS } from "@/components/ui/classes";

/**
 * Courses in progress (hi-fi 01, bottom right): the courses opened or with at
 * least one topic done, furthest along first, then All courses. The card lists the
 * first few and says how many more there are, rather than dropping them
 * without a word.
 */
export function CoursesCard({ courses: { rows: courses, total } }: { courses: { rows: CourseInProgress[]; total: number } }) {
  return (
    <Card title="Courses in progress" className="items-stretch">
      {courses.length === 0 ? (
        <p className="text-[14px] text-text2">No course started yet. Open one from All courses and it shows here.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {courses.map((c) => (
            <li key={c.slug}>
              <CourseProgress
                variant="count"
                code={c.code}
                done={c.completed}
                total={c.total}
                lead={
                  <Link
                    href={`/courses/${c.slug}`}
                    className={cx("min-w-0 flex-1 truncate rounded-sm text-[14px] font-medium text-text underline-offset-4 hover:underline", FOCUS)}
                  >
                    {c.code} {c.title}
                  </Link>
                }
              />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button href="/courses" variant="secondary" size="sm">
          All courses
        </Button>
        {total > courses.length && (
          <span className="text-[12px] text-text2">
            {total - courses.length} more in progress
          </span>
        )}
      </div>
    </Card>
  );
}
