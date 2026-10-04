import type { Metadata } from "next";

import { PAGE_ENTER } from "@/components/PageLoading";
import { CourseList } from "@/components/courses/CourseList";
import { getTags, tagsFor } from "@/data/content";
import { getCourseCovers } from "@/data/course-covers";
import { getCourses } from "@/data/courses";
import { itemStanding } from "@/lib/course-path";
import { toCourseSummary, usedTags } from "@/lib/course-summary";
import { loadKnowledgeBase } from "@/lib/kb/load";

export const metadata: Metadata = { title: "Courses" };

/**
 * Courses: the courses under way in Coursera's My Learning shape, then every
 * course as a compact cover card in the shape of its explore carousels
 * (docs/design/IMPLEMENTATION.md, "Courses"). `data-layout="app"` on the
 * root, the page title in the display face, and the primitives from
 * `@/components/ui`.
 *
 * The server's half is the standing of every curriculum item: which have
 * concepts and which of those are mastered, from the knowledge base, and
 * which courses have a cover photo in the blob store (`getCourseCovers`). The list
 * combines that with the learner's ticks, which stay on the client. When the
 * catalog cannot be read the standing is empty and every topic is tick-only,
 * the same fallback the course path makes.
 */
export default async function CoursesPage() {
  const [courses, tags, { kb }, covers] = await Promise.all([
    getCourses(),
    getTags(),
    loadKnowledgeBase(),
    getCourseCovers(),
  ]);
  const summaries = courses.map((c) => toCourseSummary(c, tagsFor(tags, c.tags), covers.get(c.slug) ?? null));
  const standing = itemStanding(
    kb.concepts,
    summaries.flatMap((s) => s.topics.map((t) => t.id)),
  );
  return (
    <div data-layout="app" className={PAGE_ENTER}>
      <CourseList summaries={summaries} tags={usedTags(tags, summaries)} standing={standing} />
    </div>
  );
}
