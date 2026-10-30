import "server-only";

import { readConceptNote as readConceptNoteCore, type ConceptNoteRead } from "@gnosia/tutor/server/concept-note";

import { contentSource } from "@/data/source";

/**
 * One concept's note through the reader seam. The read lives in
 * `@gnosia/tutor/server/concept-note`; this file hands it this app's
 * selected seam.
 */


/** Read and parse one concept's note. Degrades to a reason, never throws. */
export async function readConceptNote(slug: string): Promise<ConceptNoteRead> {
  return readConceptNoteCore(contentSource(), slug);
}
