import type { Metadata } from "next";

import { CourseGrid } from "@/components/courses/CourseGrid";
import { getTags, tags } from "@/data/content";
import { courses } from "@/data/courses";
import { toCourseSummary, usedTags } from "@/lib/course-summary";

export const metadata: Metadata = { title: "Courses" };

/**
 * Courses (hi-fi screen 02). The first redesigned page, and the reference for
 * the rest: `data-layout="app"` on the root, the page title in the display
 * face, and the primitives from `@/components/ui`.
 */
export default function CoursesPage() {
  const summaries = courses.map((c) => toCourseSummary(c, getTags(c.tags)));
  return (
    <div data-layout="app">
      <CourseGrid summaries={summaries} tags={usedTags(tags, summaries)} />
    </div>
  );
}
