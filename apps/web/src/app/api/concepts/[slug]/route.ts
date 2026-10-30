import { NextResponse } from "next/server";

import { isConceptSlug } from "@/lib/concept-workspace-core";
import { readConceptWorkspace } from "@/lib/concept-workspace";
import { refuseWithoutOwner } from "@/lib/learner-api";

export const runtime = "nodejs";

/**
 * `GET /api/concepts/[slug]`: everything the concept workspace shows about one
 * concept, as `ConceptWorkspace` in `@/lib/concept-workspace-core`. The page
 * reads the same object on the server; this is the door for a client that
 * needs it after render (the session focus mode, phase 1d).
 *
 * 400 for a slug that could not be a concept, 404 for one the knowledge base
 * does not hold, 503 when the database cannot be reached. A missing note file
 * is not an error: `note.available` is false and says why.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const anonymous = await refuseWithoutOwner();
  if (anonymous !== null) return anonymous;
  const { slug } = await params;
  if (!isConceptSlug(slug)) {
    return NextResponse.json({ error: "Not a concept id", code: "BAD_CONCEPT_SLUG" }, { status: 400 });
  }
  const read = await readConceptWorkspace(slug);
  if (read.state === "unreachable") {
    return NextResponse.json({ error: read.message, code: "CONCEPT_UNAVAILABLE" }, { status: 503 });
  }
  if (read.state === "not-found") {
    return NextResponse.json({ error: `No concept ${slug}`, code: "CONCEPT_NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json(read.workspace, { headers: { "Cache-Control": "no-store" } });
}
