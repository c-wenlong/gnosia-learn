import "server-only";

import { cache } from "react";
import { connection } from "next/server";
import { ownerScope } from "@gnosia/schema/shared";
import {
  courseSlugsOf,
  placeOf,
  readConceptWorkspace as readConceptWorkspaceCore,
  type ConceptWorkspaceRead,
} from "@gnosia/tutor/server/concept-workspace";

import { contentSource } from "@/data/source";
import { catalogDatabase } from "@/lib/learner-store";
import { currentOwner } from "@/lib/owner";

/**
 * The concept workspace's read. The assembly lives in
 * `@gnosia/tutor/server/concept-workspace`, which the native sidecar
 * calls with its own pool and owner; this file hands it this app's seams.
 */

export { courseSlugsOf, placeOf };
export type { ConceptWorkspaceRead };

/**
 * The read without the request marker, for a route handler, a server action
 * or a test. `owner` is the signed-in owner, read here when the caller has
 * not already; the studio's hand-off passes the one it resolved, so the note
 * it sends the runner is that owner's (D65 of docs/STUDIO-TUTOR-HANDOFF.md).
 */
export async function readConceptWorkspace(slug: string, owner?: string): Promise<ConceptWorkspaceRead> {
  owner ??= await currentOwner();
  return readConceptWorkspaceCore(
    { db: catalogDatabase(), owner, scope: ownerScope(owner), source: contentSource() },
    slug,
  );
}

/**
 * The workspace for this request, read once however many times the render
 * asks: `generateMetadata` and the page both want it, and each read is the
 * knowledge base, the owner's event log, the review cards and the courses.
 * React's `cache` keeps the answer for one server render, keyed by the slug.
 */
export const loadConceptWorkspace = cache(async (slug: string): Promise<ConceptWorkspaceRead> => {
  await connection();
  return readConceptWorkspace(slug);
});
