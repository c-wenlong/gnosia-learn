import { notFound } from "next/navigation";
import { courses, getCourse, getModule } from "@/data/courses";
import { AgentSession } from "@/components/AgentSession";

export function generateStaticParams() {
  const seen = new Set<string>();
  const out: { slug: string; module: string }[] = [];
  for (const c of courses) {
    for (const m of c.modules) {
      const key = `${c.slug}/${m.slug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ slug: c.slug, module: m.slug });
    }
  }
  return out;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; module: string }>;
  searchParams: Promise<{ topic?: string }>;
}) {
  const { slug, module: moduleSlug } = await params;
  const { topic: topicId } = await searchParams;
  const course = getCourse(slug);
  if (!course) return { title: "Session" };
  const mod = getModule(course, moduleSlug);
  if (!mod) return { title: "Session" };
  const topic = mod.topics.find((t) => t.id === topicId);
  return {
    title: topic
      ? `Agent · ${course.code} · ${topic.title}`
      : `Agent · ${course.code}`,
  };
}

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; module: string }>;
  searchParams: Promise<{ topic?: string }>;
}) {
  const { slug, module: moduleSlug } = await params;
  const { topic: topicId } = await searchParams;
  const course = getCourse(slug);
  if (!course) notFound();
  const mod = getModule(course, moduleSlug);
  if (!mod) notFound();
  if (!topicId) notFound();
  const topic = mod.topics.find((t) => t.id === topicId);
  if (!topic) notFound();

  return <AgentSession course={course} module={mod} topic={topic} />;
}
