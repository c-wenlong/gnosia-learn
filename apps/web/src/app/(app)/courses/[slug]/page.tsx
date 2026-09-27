import { notFound } from "next/navigation";

import { CoursePath, type PathModuleData } from "@/components/course-path/CoursePath";
import { getCourse, getCourses, getRelatedCourses } from "@/data/courses";
import { getTopics } from "@/data/topics";
import { loadCourseAssets } from "@/lib/course-assets";
import {
  conceptsForTopic,
  guidebookConcept,
  resolveTopicMastery,
  type TopicMastery,
} from "@/lib/course-path";
import { loadKnowledgeBase } from "@/lib/kb/load";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = await getCourse(slug);
  if (!course) return { title: "Course not found" };
  return { title: `${course.code} · ${course.title}` };
}

/**
 * The course path (hi-fi screen 03). The module page folded into it: each
 * module is a unit card here, and `/courses/[slug]/[module]` redirects to its
 * anchor.
 *
 * The server's half is everything that needs a database or the filesystem:
 * each topic's mastery from the concepts its `concepts:` list names (the
 * knowledge base, read per request), each module's Guidebook concept (falling back to
 * the module topic's `maps.concepts` in `content/topics.yaml`), and each
 * module's assets from the catalog. Both reads degrade to empty when Postgres
 * is down: a topic then shows its tick, and the rail says the catalog did not
 * answer. The learner's ticks are the client's, so `CoursePath` decides which
 * node is active.
 */
export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = await getCourse(slug);
  if (!course) notFound();

  const moduleTopics = course.modules.map((m) => m.topic);
  const [{ kb, reachable: kbReachable }, assets, courses, topics] = await Promise.all([
    loadKnowledgeBase(),
    loadCourseAssets(moduleTopics),
    getCourses(),
    getTopics(),
  ]);

  const authoredBySlug = new Map(topics.map((t) => [t.slug, t.maps.concepts]));
  const known = kbReachable ? new Set(kb.concepts.map((c) => c.id)) : null;

  const mastery: Record<string, TopicMastery> = {};
  const modules: Record<string, PathModuleData> = {};
  for (const m of course.modules) {
    const authored = authoredBySlug.get(m.topic) ?? [];
    const resolved = m.topics.map((t) => {
      const result = resolveTopicMastery(conceptsForTopic(kb.concepts, t.id, authored), kb.frontier);
      if (result) mastery[t.id] = result;
      return { mastery: result };
    });
    modules[m.id] = {
      guidebook: guidebookConcept(resolved, authored, known),
      assets: assets.byTopic[m.topic] ?? null,
    };
  }

  const related = getRelatedCourses(courses, course).map((r) => ({
    slug: r.slug,
    code: r.code,
    title: r.title,
    shared: r.tags.filter((t) => course.tags.includes(t)),
  }));

  return (
    <div data-layout="app">
      <CoursePath
        course={course}
        mastery={mastery}
        modules={modules}
        assetsReachable={assets.reachable}
        related={related}
      />
    </div>
  );
}
