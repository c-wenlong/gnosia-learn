import { notFound } from "next/navigation";

import { CourseHome } from "@/components/course-home/CourseHome";
import { getCourse, getModule } from "@/data/courses";
import { loadCourseHome } from "@/lib/course-home";

export async function generateMetadata({ params }: { params: Promise<{ slug: string; module: string }> }) {
  const { slug, module: moduleSlug } = await params;
  const course = await getCourse(slug);
  if (!course) return { title: "Course not found" };
  const mod = getModule(course, moduleSlug);
  if (!mod) return { title: "Module not found" };
  return { title: `${course.code} · Module ${mod.order}: ${mod.title}` };
}

/**
 * One module of a course, on a page of its own, as Coursera gives each module
 * of a course home its own URL. The same page as `/courses/[slug]`, with the
 * module named by the URL instead of chosen from the learner's ticks.
 *
 * The session under it, `/courses/[slug]/[module]/session`, is unchanged, and
 * its back link lands here.
 */
export default async function ModulePage({ params }: { params: Promise<{ slug: string; module: string }> }) {
  const { slug, module: moduleSlug } = await params;
  const course = await getCourse(slug);
  if (!course) notFound();
  const mod = getModule(course, moduleSlug);
  if (!mod) notFound();
  const data = await loadCourseHome(course);

  return (
    <div data-layout="app">
      <CourseHome course={course} moduleSlug={mod.slug} {...data} />
    </div>
  );
}
