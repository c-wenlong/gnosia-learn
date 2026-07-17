import Link from "next/link";
import { notFound } from "next/navigation";
import { courses, getCourse, getModule } from "@/data/courses";
import { TopicChecklist } from "@/components/TopicChecklist";
import { ResourceList } from "@/components/ResourceList";
import { ModuleProgressHeader } from "@/components/ModuleProgressHeader";
import { VisitTracker } from "@/components/VisitTracker";
import { InferredBanner } from "@/components/InferredBanner";

export function generateStaticParams() {
  return courses.flatMap((c) =>
    c.modules.map((m) => ({ slug: c.slug, module: m.slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; module: string }>;
}) {
  const { slug, module: moduleSlug } = await params;
  const course = getCourse(slug);
  if (!course) return { title: "Module not found" };
  const mod = getModule(course, moduleSlug);
  if (!mod) return { title: "Module not found" };
  return { title: `${course.code} · M${mod.order} ${mod.title}` };
}

export default async function ModulePage({
  params,
}: {
  params: Promise<{ slug: string; module: string }>;
}) {
  const { slug, module: moduleSlug } = await params;
  const course = getCourse(slug);
  if (!course) notFound();
  const mod = getModule(course, moduleSlug);
  if (!mod) notFound();

  const idx = course.modules.findIndex((m) => m.id === mod.id);
  const prev = idx > 0 ? course.modules[idx - 1] : undefined;
  const next =
    idx < course.modules.length - 1 ? course.modules[idx + 1] : undefined;

  return (
    <article className="prose-docs space-y-8">
      <VisitTracker courseSlug={course.slug} moduleSlug={mod.slug} />

      <nav className="text-sm text-[var(--muted)]">
        <Link
          href={`/courses/${course.slug}`}
          className="text-[var(--accent-strong)] hover:underline"
        >
          {course.code}
        </Link>
        <span className="mx-1.5">/</span>
        <span>
          M{mod.order}. {mod.title}
        </span>
      </nav>

      <header className="space-y-2">
        <p className="font-mono text-sm text-[var(--muted)]">
          Module {mod.order} of {course.modules.length}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {mod.title}
        </h1>
      </header>

      {course.inferred && <InferredBanner />}

      <ModuleProgressHeader module={mod} />

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Topics</h2>
        <p className="text-sm text-[var(--muted)]">
          Check off topics as you finish them. Expand any row to attach a
          personal note (saved in this browser). Use{" "}
          <strong>Launch Agent</strong> for a free Socratic micro-session
          (NVIDIA → Gemini Flash → OpenRouter).
        </p>
        <TopicChecklist topics={mod.topics} course={course} module={mod} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Resources</h2>
        <ResourceList moduleId={mod.id} curated={mod.resources} />
      </section>

      <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-6 text-sm">
        {prev ? (
          <Link
            href={`/courses/${course.slug}/${prev.slug}`}
            className="text-[var(--accent-strong)] hover:underline"
          >
            ← M{prev.order}. {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={`/courses/${course.slug}/${next.slug}`}
            className="text-[var(--accent-strong)] hover:underline"
          >
            M{next.order}. {next.title} →
          </Link>
        ) : (
          <Link
            href={`/courses/${course.slug}`}
            className="text-[var(--accent-strong)] hover:underline"
          >
            Back to course overview →
          </Link>
        )}
      </nav>
    </article>
  );
}
