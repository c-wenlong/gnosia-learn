import { courses } from "@/data/courses";
import { getTags, tags } from "@/data/content";
import { CourseCard } from "@/components/CourseCard";
import { TagChip } from "@/components/TagChip";

export default function HomePage() {
  return (
    <div className="prose-docs space-y-10">
      <header className="space-y-3">
        <p className="text-sm font-medium text-[var(--accent-strong)]">
          AY2026/27 · SoC shortlist
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Self-study roadmaps
        </h1>
        <p className="max-w-2xl text-base text-[var(--muted-strong)]">
          A docs-style study hub for the course shortlist. Track topic progress,
          jot per-topic notes, keep resource links, and jump between related
          courses. Everything stays in this browser (localStorage).
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Cross-course themes
        </h2>
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <TagChip key={t.id} tag={t} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Courses</h2>
          <p className="text-sm text-[var(--muted)]">{courses.length} courses</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-1">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              tags={getTags(course.tags)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
