import type { ContentSource } from "@gnosia/content";

import { parseConceptNote, type ConceptCheck, type ConceptFrontmatter } from "../concept-note-core";
import { ContentUnavailableError } from "./content-source";

/**
 * One concept's note through the reader seam, the request-independent half
 * of `apps/web/src/lib/concept-note.ts`: the seam is a parameter.
 */

export type ConceptNoteRead =
  | {
      ok: true;
      /** The note's logical path, `learn/concepts/<domain>/<slug>.md` (D11). */
      path: string;
      /** The note as stored, frontmatter and all: what `NoteProse` takes. */
      source: string;
      frontmatter: ConceptFrontmatter;
      checks: ConceptCheck[];
    }
  | {
      ok: false;
      /**
       * Why there is no note to show: the concept has none, it is larger
       * than a note reader reads, its type is not flipped to the database,
       * or the seam itself could not be read.
       */
      code: "no-note" | "too-large" | "not-flipped" | "unreachable";
      message: string;
    };

/** The largest note this will read. The longest in the corpus is under 20kB. */
export const NOTE_READ_LIMIT = 256 * 1024;

/** Read and parse one concept's note. Degrades to a reason, never throws. */
export async function readConceptNote(source: ContentSource, slug: string): Promise<ConceptNoteRead> {
  try {
    const note = await source.concept(slug);
    if (note === null) return { ok: false, code: "no-note", message: `No note is stored for ${slug}.` };
    if (Buffer.byteLength(note.markdown, "utf8") > NOTE_READ_LIMIT) {
      return { ok: false, code: "too-large", message: `${note.path} is larger than the note reader reads.` };
    }
    return { ok: true, path: note.path, source: note.markdown, ...parseConceptNote(note.markdown) };
  } catch (error) {
    console.warn(`concept note: ${slug} unavailable, ${messageOf(error)}`);
    const code = error instanceof ContentUnavailableError && error.reason === "not-flipped" ? "not-flipped" : "unreachable";
    return { ok: false, code, message: messageOf(error) };
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
