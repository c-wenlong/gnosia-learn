import "server-only";

import { connection } from "next/server";
import { assetsForConcept, readEvents, readReviews } from "@self-learn/catalog/state";

import { getCourses } from "@/data/courses";
import { findTopicAcrossCourses } from "@/lib/agent/lookup";
import { readConceptNote } from "@/lib/concept-note";
import { buildConceptWorkspace, type ConceptPlace, type ConceptWorkspace } from "@/lib/concept-workspace-core";
import { catalogDatabase, readKb } from "@/lib/learner-store";
import type { Course } from "@/lib/types";

/**
 * The concept workspace's reads: the knowledge base, the note, the event log,
 * the review card and the asset links, handed to the pure
 * `buildConceptWorkspace`. The page, `GET /api/concepts/[slug]` and the
 * concept tutor all come through here, so the three cannot disagree about a
 * concept.
 *
 * Degrades like the other readers: a database that cannot be reached is a
 * state the caller renders, never a thrown render.
 */

export type ConceptWorkspaceRead =
  | { state: "ok"; workspace: ConceptWorkspace }
  | { state: "not-found" }
  | { state: "unreachable"; message: string };

/** Where a concept sits in a course: the first of its curriculum items that resolves. */
export function placeOf(courses: readonly Course[], topicIds: readonly string[]): ConceptPlace | null {
  for (const id of topicIds) {
    const found = findTopicAcrossCourses(courses, id);
    if (found === undefined) continue;
    return {
      courseSlug: found.course.slug,
      courseCode: found.course.code,
      courseTitle: found.course.title,
      moduleSlug: found.module.slug,
      moduleOrder: found.module.order,
      moduleTitle: found.module.title,
      topicId: found.topic.id,
      topicTitle: found.topic.title,
    };
  }
  return null;
}

/** Every course slug a concept's curriculum items belong to, deduplicated. */
export function courseSlugsOf(courses: readonly Course[], topicIds: readonly string[]): string[] {
  const out = new Set<string>();
  for (const id of topicIds) {
    const found = findTopicAcrossCourses(courses, id);
    if (found !== undefined) out.add(found.course.slug);
  }
  return [...out].sort();
}

/** The read without the request marker, for a route handler or a test. */
export async function readConceptWorkspace(slug: string): Promise<ConceptWorkspaceRead> {
  const { kb, reachable } = await readKb();
  if (!reachable) return { state: "unreachable", message: "The catalog database could not be reached." };
  const concept = kb.concepts.find((c) => c.id === slug);
  if (concept === undefined) return { state: "not-found" };

  try {
    const db = await catalogDatabase();
    const [note, events, reviews, assets, courses] = await Promise.all([
      readConceptNote(slug),
      readEvents(db),
      readReviews(db),
      assetsForConcept(db, slug),
      getCourses(),
    ]);
    const workspace = buildConceptWorkspace({
      kb,
      slug,
      note: note.ok
        ? { available: true, path: note.path, source: note.source }
        : { available: false, code: note.code, message: note.message },
      frontmatter: note.ok ? { sources: note.frontmatter.sources, tags: note.frontmatter.tags } : null,
      checks: note.ok ? note.checks : [],
      events,
      card: reviews.cards[slug] ?? null,
      assets,
      place: placeOf(courses, concept.topics),
    });
    return workspace === null ? { state: "not-found" } : { state: "ok", workspace };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`concept workspace: ${slug} unavailable, ${message}`);
    return { state: "unreachable", message };
  }
}

/** The workspace for this request. */
export async function loadConceptWorkspace(slug: string): Promise<ConceptWorkspaceRead> {
  await connection();
  return readConceptWorkspace(slug);
}
