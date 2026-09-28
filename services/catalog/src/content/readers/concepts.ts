import type { ConceptNoteSource } from "@self-learn/content";

import { readNoteRows } from "../note-rows";
import { renderNote } from "../notes";
import type { TypeReader } from "./reader";

/**
 * The database reader for `concepts`: one concept note by its id, as
 * `ConceptNoteSource`, or null.
 *
 * Track C's file (docs/CONTENT-MIGRATION.md, phase 1). The note is the file
 * its row renders (`renderNote`): the body exactly as stored, the frontmatter
 * from the columns in one layout. That is what `fileSource` returns for the
 * same note wherever the note's own frontmatter already has that layout (27 of
 * the 32 notes of 2026-09-28), and it parses to the same fields in every case,
 * which is all a page reads from it. An archived concept has no note, as a
 * deleted file had none. A row with no body was imported before Track C stored
 * it, and is refused rather than shown as an empty note.
 */
export const reader: TypeReader<"concept"> = {
  ready: true,
  read: (db) => async (slug): Promise<ConceptNoteSource | null> => {
    const [row] = await readNoteRows(db, [slug]);
    if (row === undefined) return null;
    if (row.body === null) {
      throw new Error(`concept "${slug}" has no body in the database: re-run \`catalog import\` before reading it from rows`);
    }
    return { slug: row.slug, domain: row.domain ?? "", path: row.path, markdown: renderNote({ ...row, body: row.body }) };
  },
};
