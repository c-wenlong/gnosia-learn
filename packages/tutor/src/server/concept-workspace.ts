import {
  assetsForConcept,
  type CatalogDatabase,
  EMPTY_KNOWLEDGE_BASE,
  type KnowledgeBase,
  readEvents,
  readKnowledgeBase,
  readReviews,
} from "@self-learn/catalog/state";
import type { ContentSource } from "@self-learn/content";
import type { OwnerScope } from "@self-learn/schema/shared";

import { findTopicAcrossCourses } from "../lookup";
import { ownValue } from "../own-key";
import type { Course } from "../types";
import {
  buildConceptWorkspace,
  type ConceptPlace,
  type ConceptWorkspace,
} from "../concept-workspace-core";
import { readConceptNote } from "./concept-note";

/**
 * The concept workspace's read, the request-independent half of
 * `apps/web/src/lib/concept-workspace.ts`: the pool handle, owner, scope and
 * content seam are parameters, so the workspace the chat's context is built
 * from is assembled once and shared by the web route and the sidecar.
 */

export type ConceptWorkspaceRead =
  | { state: "ok"; workspace: ConceptWorkspace }
  | { state: "not-found" }
  | { state: "unreachable"; message: string };

/** The seams the workspace read needs: pool handle, the owner's identity and scope, and the content seam. */
export interface WorkspaceDeps {
  db: Promise<CatalogDatabase>;
  owner: string;
  scope: OwnerScope;
  source: ContentSource;
}

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

/**
 * The read without the request marker, for a route handler, a server action
 * or a test. `owner` is the signed-in owner; the studio's hand-off passes the
 * one it resolved, so the note it sends the runner is that owner's (D65 of
 * docs/STUDIO-TUTOR-HANDOFF.md). The pool handle is a promise for the same
 * reason as `TutorDeps.db`: a database that is down answers `unreachable`,
 * and the note read degrades on its own.
 */
export async function readConceptWorkspace(deps: WorkspaceDeps, slug: string): Promise<ConceptWorkspaceRead> {
  let kb: { kb: KnowledgeBase; reachable: boolean };
  try {
    kb = { kb: await readKnowledgeBase(await deps.db, deps.owner), reachable: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`concept workspace: knowledge base unavailable — ${message}`);
    kb = { kb: EMPTY_KNOWLEDGE_BASE, reachable: false };
  }
  if (!kb.reachable) return { state: "unreachable", message: "The catalog database could not be reached." };
  const concept = kb.kb.concepts.find((c) => c.id === slug);
  if (concept === undefined) return { state: "not-found" };

  try {
    const db = await deps.db;
    const [note, events, reviews, assets, courses] = await Promise.all([
      readConceptNote(deps.source, slug),
      readEvents(db, deps.owner),
      readReviews(db, deps.owner),
      assetsForConcept(db, slug, deps.scope),
      deps.source.courses(),
    ]);
    const workspace = buildConceptWorkspace({
      kb: kb.kb,
      slug,
      note: note.ok
        ? { available: true, path: note.path, source: note.source }
        : { available: false, code: note.code, message: note.message },
      frontmatter: note.ok ? { sources: note.frontmatter.sources, tags: note.frontmatter.tags } : null,
      checks: note.ok ? note.checks : [],
      events,
      card: ownValue(reviews.cards, slug) ?? null,
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
