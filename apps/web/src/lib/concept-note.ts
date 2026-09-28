import "server-only";

import { ContentUnavailableError, contentSource } from "@/data/source";
import { parseConceptNote, type ConceptCheck, type ConceptFrontmatter } from "@/lib/concept-note-core";

/**
 * A concept's note, read on the server.
 *
 * The note is `concept.body` under the frontmatter its row renders, read
 * through the content seam (Track C of docs/CONTENT-MIGRATION.md). Since
 * phase 2 the seam reads the database only, so no file is ever opened here:
 * the note file this used to find through its `note:` asset row is at best an
 * export, and phase 3 deletes it.
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
       * `no-note`: the database holds no note for this slug. `too-large`: it
       * does, over the cap. `not-flipped`: concepts are still owned by files
       * on this database. `unreachable`: no database.
       */
      code: "no-note" | "too-large" | "not-flipped" | "unreachable";
      message: string;
    };

/** The largest note this will read. The longest in the corpus is under 20kB. */
export const NOTE_READ_LIMIT = 256 * 1024;

/** Read and parse one concept's note. Degrades to a reason, never throws. */
export async function readConceptNote(slug: string): Promise<ConceptNoteRead> {
  try {
    const note = await contentSource().concept(slug);
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
