import { notFound, redirect } from "next/navigation";

import { getCourse, getModule } from "@/data/courses";

/**
 * The module page folded into the course path (hi-fi screen 03): a module is
 * a unit card there now, with its topics as nodes, their notes and recaps in
 * each node's panel, and its resources at the foot of the card. This route
 * stays so old links and bookmarks land on that unit, by its anchor.
 *
 * The session under it, `/courses/[slug]/[module]/session`, is unchanged.
 */
export default async function ModulePage({ params }: { params: Promise<{ slug: string; module: string }> }) {
  const { slug, module: moduleSlug } = await params;
  const course = getCourse(slug);
  if (!course) notFound();
  const mod = getModule(course, moduleSlug);
  if (!mod) notFound();
  redirect(`/courses/${course.slug}#${mod.slug}`);
}
