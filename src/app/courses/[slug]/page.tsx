import Link from "next/link";
import { notFound } from "next/navigation";
import {
  courses,
  getCourse,
  getCourseTopicIds,
  getRelatedCourses,
} from "@/data/courses";
import { InferredBanner } from "@/components/InferredBanner";
import { TagChip } from "@/components/TagChip";
import { CourseProgressHeader } from "@/components/CourseProgressHeader";
import { ResetCourseButton } from "@/components/ResetCourseButton";
import { VisitTracker } from "@/components/VisitTracker";
import { ModuleProgressRow } from "@/components/ModuleProgressRow";

export function generateStaticParams() {
  return courses.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const course = getCourse(slug);
  if (!course) return { title: "Course not found" };
  return { title: `${course.code} · ${course.title}` };
}

export default async function CoursePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const course = getCourse(slug);
  if (!course) notFound();

  const related = getRelatedCourses(course);
  const topicIds = getCourseTopicIds(course);

  return (
    <article className="prose-docs space-y-8">
      <VisitTracker courseSlug={course.slug} />

      <header className="space-y-3">
        <p className="font-mono text-sm font-medium text-[var(--accent-strong)]">
          {course.code}
          {course.track ? ` · ${course.track}` : ""}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {course.title}
        </h1>
        <div className="flex flex-wrap gap-2 text-sm text-[var(--muted-strong)]">
          <span>{course.credits} MC</span>
          {course.prereq && (
            <>
              <span aria-hidden>·</span>
              <span>Prereq: {course.prereq}</span>
            </>
          )}
        </div>
        {course.notes && (
          <p className="text-base text-[var(--muted-strong)]">{course.notes}</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {course.tags.map((t) => (
            <TagChip key={t} id={t} />
          ))}
        </div>
      </header>

      {course.inferred && <InferredBanner />}

      <CourseProgressHeader course={course} />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Modules</h2>
          <ResetCourseButton topicIds={topicIds} />
        </div>
        <ol className="space-y-2">
          {course.modules.map((m) => (
            <ModuleProgressRow
              key={m.id}
              courseSlug={course.slug}
              module={m}
            />
          ))}
        </ol>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-lg font-semibold tracking-tight">Capstone</h2>
        <p className="mt-2 text-[var(--muted-strong)]">{course.capstone}</p>
      </section>

      {related.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Related courses
          </h2>
          <ul className="space-y-2">
            {related.map((r) => {
              const shared = r.tags.filter((t) => course.tags.includes(t));
              return (
                <li key={r.id}>
                  <Link
                    href={`/courses/${r.slug}`}
                    className="font-medium text-[var(--accent-strong)] hover:underline"
                  >
                    {r.code} — {r.title}
                  </Link>
                  <span className="ml-2 text-xs text-[var(--muted)]">
                    shared: {shared.join(", ")}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </article>
  );
}
