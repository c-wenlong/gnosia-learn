import "server-only";

import type { ModuleData, RelatedCourse } from "@/components/course-home/types";
import { getCourses, getRelatedCourses } from "@/data/courses";
import { getTopics } from "@/data/topics";
import { loadCourseAssets } from "@/lib/course-assets";
import { conceptsForTopic, guidebookConcept, resolveTopicMastery, type TopicMastery } from "@/lib/course-path";
import { loadKnowledgeBase } from "@/lib/kb/load";
import type { Course } from "@/lib/types";

/**
 * Everything a course page needs from the server, for `/courses/[slug]` and
 * `/courses/[slug]/[module]` alike.
 *
 * Each topic's mastery from the concepts its `concepts:` list names (the
 * knowledge base, read per request), each module's Guidebook concept (falling
 * back to the module topic's `maps.concepts`), its description (the topic
 * vocabulary's `summary` for the module's `topic:`), and its assets from the
 * catalog. The knowledge base and the catalog both degrade to empty when
 * Postgres is down: a topic then shows its tick, and the module says the
 * catalog did not answer.
 *
 * Every module is resolved, not only the one on screen: the sidebar marks each
 * module's standing, and `/courses/[slug]` picks its module on the client,
 * from the learner's ticks, which live in `LearnerProvider`.
 */
export interface CourseHomeData {
  mastery: Record<string, TopicMastery>;
  modules: Record<string, ModuleData>;
  assetsReachable: boolean;
  related: RelatedCourse[];
}

export async function loadCourseHome(course: Course): Promise<CourseHomeData> {
  const moduleTopics = course.modules.map((m) => m.topic);
  const [{ kb, reachable: kbReachable }, assets, courses, topics] = await Promise.all([
    loadKnowledgeBase(),
    loadCourseAssets(moduleTopics),
    getCourses(),
    getTopics(),
  ]);

  const bySlug = new Map(topics.map((t) => [t.slug, t]));
  const known = kbReachable ? new Set(kb.concepts.map((c) => c.id)) : null;

  const mastery: Record<string, TopicMastery> = {};
  const modules: Record<string, ModuleData> = {};
  for (const m of course.modules) {
    const entry = bySlug.get(m.topic);
    const authored = entry?.maps.concepts ?? [];
    const resolved = m.topics.map((t) => {
      const result = resolveTopicMastery(conceptsForTopic(kb.concepts, t.id, authored), kb.frontier);
      if (result) mastery[t.id] = result;
      return { mastery: result };
    });
    modules[m.id] = {
      guidebook: guidebookConcept(resolved, authored, known),
      assets: assets.byTopic[m.topic] ?? null,
      description: entry?.summary?.trim() || null,
    };
  }

  const related = getRelatedCourses(courses, course).map((r) => ({
    slug: r.slug,
    code: r.code,
    title: r.title,
    shared: r.tags.filter((t) => course.tags.includes(t)),
  }));

  return { mastery, modules, assetsReachable: assets.reachable, related };
}
