import { notFound } from "next/navigation";
import { getCourse, getModule } from "@/data/courses";
import { AgentSession } from "@/components/AgentSession";
import { PAGE_ENTER } from "@/components/PageLoading";
import { readSummaries } from "@/lib/session-page";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; module: string }>;
  searchParams: Promise<{ topic?: string }>;
}) {
  const { slug, module: moduleSlug } = await params;
  const { topic: topicId } = await searchParams;
  const course = await getCourse(slug);
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
  const course = await getCourse(slug);
  if (!course) notFound();
  const mod = getModule(course, moduleSlug);
  if (!mod) notFound();
  if (!topicId) notFound();
  const topic = mod.topics.find((t) => t.id === topicId);
  if (!topic) notFound();

  // The concepts the topic declares, by title, for the card a recorded check
  // leaves (docs/proposals/structured-checks.md, phase 3). None when the
  // catalog cannot be read: the card then names the concept by its id.
  const declared = new Set(topic.concepts ?? []);
  const conceptTitles = Object.fromEntries(
    (await readSummaries()).filter((s) => declared.has(s.conceptId)).map((s) => [s.conceptId, s.title]),
  );

  // An `app` page, as its loading frame (`(app)/loading.tsx`) already is, so
  // the shell's gutters do not change as it arrives; the chat keeps its
  // narrower reading measure inside (`AgentSession`).
  return (
    <div data-layout="app" className={PAGE_ENTER}>
      <AgentSession course={course} module={mod} topic={topic} conceptTitles={conceptTitles} />
    </div>
  );
}
