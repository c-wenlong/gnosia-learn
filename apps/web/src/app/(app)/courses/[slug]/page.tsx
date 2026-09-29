import { notFound } from "next/navigation";

import { CourseHome } from "@/components/course-home/CourseHome";
import { getCourse } from "@/data/courses";
import { loadCourseHome } from "@/lib/course-home";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = await getCourse(slug);
  if (!course) return { title: "Course not found" };
  return { title: `${course.code} · ${course.title}` };
}

/**
 * A course's home: the module the learner is on, in the layout of Coursera's
 * course home (the sidebar of modules, the module, the rail). Which module
 * that is depends on the learner's ticks, so `CourseHome` picks it on the
 * client; each module also has a page of its own at
 * `/courses/[slug]/[module]`, which is where the sidebar's rows link.
 */
export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = await getCourse(slug);
  if (!course) notFound();
  const data = await loadCourseHome(course);

  return (
    <div data-layout="app">
      <CourseHome course={course} {...data} />
    </div>
  );
}
