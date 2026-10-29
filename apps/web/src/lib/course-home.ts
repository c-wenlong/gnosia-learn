import "server-only";

import type { ModuleData, RelatedCourse } from "@/components/course-home/types";
import { getTags, tagsFor } from "@/data/content";
import { getCourses, getRelatedCourses } from "@/data/courses";
import { getTopics } from "@/data/topics";
import { loadCourseAssets } from "@/lib/course-assets";
import { conceptsByItem, conceptsForTopic, guidebookConcept, resolveTopicMastery, type TopicMastery } from "@/lib/course-path";
import { loadKnowledgeBase } from "@/lib/kb/load";
import type { PathKbConcept } from "@/lib/module-path";
import type { Course } from "@/lib/types";

/**
 * Everything a course page needs from the server, for `/courses/[slug]` and
 * `/courses/[slug]/[module]` alike.
 *
 * Each topic's mastery from the concepts its `concepts:` list names (the
 * knowledge base, read per request), each module's Guidebook concept (falling
 * back to the module topic's `maps.concepts`), its description (the topic
 * vocabulary's `summary` for the module's `topic:`), its assets from the
 * catalog, and what its path needs (`@/lib/module-path`): the slice of the
 * knowledge base holding its concepts and their prerequisites, the assets
 * the path places and the checks each note holds. The knowledge base and the catalog both degrade to empty when
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
  const coursesRead = getCourses();
  const [{ kb, reachable: kbReachable }, assets, courses, topics, tags] = await Promise.all([
    loadKnowledgeBase(),
    // Every live module of every course: a topic two of them name is shared.
    coursesRead.then((all) => loadCourseAssets(course, all.flatMap((c) => c.modules))),
    coursesRead,
    getTopics(),
    // The tags only label related courses: a tags read that fails costs the
    // labels (tagsFor then shows the ids), not the course page.
    getTags().catch(() => []),
  ]);

  const bySlug = new Map(topics.map((t) => [t.slug, t]));
  const known = kbReachable ? new Set(kb.concepts.map((c) => c.id)) : null;
  const kbById = new Map(kb.concepts.map((c) => [c.id, c]));
  const byItem = conceptsByItem(kb.concepts);

  const mastery: Record<string, TopicMastery> = {};
  const modules: Record<string, ModuleData> = {};
  for (const m of course.modules) {
    const entry = bySlug.get(m.topic);
    const authored = entry?.maps.concepts ?? [];
    const resolved = m.topics.map((t) => {
      const result = resolveTopicMastery(conceptsForTopic(byItem.get(t.id) ?? [], t.id, authored), kb.frontier);
      if (result) mastery[t.id] = result;
      return { mastery: result };
    });
    const taught = [...new Set(m.topics.flatMap((t) => t.concepts))];
    modules[m.id] = {
      guidebook: guidebookConcept(resolved, authored, known),
      assets: assets.byTopic[m.topic] ?? null,
      description: entry?.summary?.trim() || null,
      concepts: pathConcepts(taught, kbById),
      path: assets.paths[m.id] ?? null,
      checks: assets.checks === null ? null : pick(assets.checks, taught),
    };
  }

  const related = getRelatedCourses(courses, course).map((r) => ({
    slug: r.slug,
    code: r.code,
    title: r.title,
    // the tags' labels ("Agentic AI"), not their ids ("agentic-ai")
    shared: tagsFor(tags, r.tags.filter((t) => course.tags.includes(t))).map((t) => t.label),
  }));

  return { mastery, modules, assetsReachable: assets.reachable, related };
}

/**
 * The module's concepts and their direct prerequisites, with only the fields
 * the path reads: a page payload carries a module's slice of the knowledge
 * base, not all of it.
 */
function pathConcepts(
  taught: readonly string[],
  kb: ReadonlyMap<string, { id: string; title: string; pL: number; mastery: PathKbConcept["mastery"]; observations: number; requires: string[]; assumes: string[] }>,
): PathKbConcept[] {
  const wanted = new Set(taught);
  for (const slug of taught) {
    const c = kb.get(slug);
    for (const p of [...(c?.requires ?? []), ...(c?.assumes ?? [])]) wanted.add(p);
  }
  return [...wanted].flatMap((slug) => {
    const c = kb.get(slug);
    return c
      ? [{ id: c.id, title: c.title, pL: c.pL, mastery: c.mastery, observations: c.observations, requires: c.requires, assumes: c.assumes }]
      : [];
  });
}

function pick(counts: Readonly<Record<string, number>>, slugs: readonly string[]): Record<string, number> {
  return Object.fromEntries(slugs.filter((s) => s in counts).map((s) => [s, counts[s]!]));
}
