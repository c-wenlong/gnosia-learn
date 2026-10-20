import "server-only";

import {
  NOTE_READ_LIMIT,
  readConceptNote as readConceptNoteCore,
  type ConceptNoteRead,
} from "@self-learn/tutor/server/concept-note";

import { contentSource } from "@/data/source";

/**
 * One concept's note through the reader seam. The read lives in
 * `@self-learn/tutor/server/concept-note`; this file hands it this app's
 * selected seam.
 */

export { NOTE_READ_LIMIT };
export type { ConceptNoteRead };

/** Read and parse one concept's note. Degrades to a reason, never throws. */
export async function readConceptNote(slug: string): Promise<ConceptNoteRead> {
  return readConceptNoteCore(contentSource(), slug);
}
