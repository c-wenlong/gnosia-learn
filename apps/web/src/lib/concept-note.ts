import "server-only";

import { readFile } from "node:fs/promises";
import { assetsForConcept, type CatalogDatabase } from "@self-learn/catalog/state";

import { contentSource } from "@/data/source";
import { resolveAssetFile } from "@/lib/asset-files";
import { parseConceptNote, type ConceptCheck, type ConceptFrontmatter } from "@/lib/concept-note-core";
import { catalogDatabase } from "@/lib/learner-store";
import { currentScope } from "@/lib/owner";

/**
 * A concept's note file, read on the server.
 *
 * The note is found through the catalog, never through a path built here
 * (layering rule 6): the concepts indexer files every note as a `note:` asset
 * linked to its own concept in `asset_concept`, and `resolveAssetFile` holds
 * every containment check the asset route makes. So this is the same resolution
 * the library page uses for a note, minus one thing.
 *
 * **Not gated by `ASSET_FILES_ENABLED`.** That switch exists because the
 * rendered videos and diagrams are not in a deployment. Concept notes are in
 * git, like `content/`, so a machine with the catalog has them; gating them
 * would blank the workspace on every fresh clone for no protection at all. A
 * deployment with no database never reaches this far, since it has no concept
 * rows either.
 */

export type ConceptNoteRead =
  | {
      ok: true;
      /** Repo-relative, as the catalog stores it. */
      path: string;
      /** The note as stored, frontmatter and all: what `NoteProse` takes. */
      source: string;
      frontmatter: ConceptFrontmatter;
      checks: ConceptCheck[];
    }
  | {
      ok: false;
      /** `no-note`: the catalog links no note to this slug. `file-missing`: indexed, not on disk. `unreachable`: no database. */
      code: "no-note" | "file-missing" | "unreachable";
      message: string;
    };

/** The largest note this will read. The longest in the corpus is under 20kB. */
export const NOTE_READ_LIMIT = 256 * 1024;

/**
 * The note asset for a slug. The concepts indexer links each note to the id in
 * its frontmatter, which usually matches the filename but need not (the id
 * wins), so the filename is a preference, not a requirement: a `<slug>.md`
 * first, otherwise the one concept note linked to this slug.
 */
export async function findNoteAsset(db: CatalogDatabase, slug: string) {
  const rows = await assetsForConcept(db, slug, await currentScope());
  const notes = rows.filter((row) => row.kind === "note" && row.path !== null && row.path.startsWith("learn/concepts/"));
  return notes.find((row) => row.path?.endsWith(`/${slug}.md`)) ?? (notes.length === 1 ? notes[0] : null);
}

/**
 * Read and parse one concept's note. Degrades to a reason, never throws.
 *
 * Once the database owns the notes (`catalog flip concepts`, Track C of
 * docs/CONTENT-MIGRATION.md) the note is `concept.body` under the frontmatter
 * its row renders, read through the content seam, and no file is opened.
 * Until then it is the file, found through its asset row as below. The same
 * 256 KB cap applies to both.
 */
export async function readConceptNote(slug: string): Promise<ConceptNoteRead> {
  let db: CatalogDatabase;
  try {
    db = await catalogDatabase();
  } catch (error) {
    return { ok: false, code: "unreachable", message: messageOf(error) };
  }
  try {
    const seam = contentSource();
    if ((await seam.resolution()).concepts.kind === "db") {
      const note = await seam.concept(slug);
      if (note === null) return { ok: false, code: "no-note", message: `No note is stored for ${slug}.` };
      if (Buffer.byteLength(note.markdown, "utf8") > NOTE_READ_LIMIT) {
        return { ok: false, code: "file-missing", message: `${note.path} is larger than the note reader reads.` };
      }
      return { ok: true, path: note.path, source: note.markdown, ...parseConceptNote(note.markdown) };
    }
    const row = await findNoteAsset(db, slug);
    if (row === null || row.path === null) {
      return { ok: false, code: "no-note", message: `No note is indexed for ${slug}.` };
    }
    const resolved = await resolveAssetFile(db, row.id);
    if (!resolved.ok) return { ok: false, code: "file-missing", message: resolved.error };
    if (resolved.bytes > NOTE_READ_LIMIT) {
      return { ok: false, code: "file-missing", message: `${row.path} is larger than the note reader reads.` };
    }
    const source = await readFile(resolved.file, "utf8");
    return { ok: true, path: row.path, source, ...parseConceptNote(source) };
  } catch (error) {
    console.warn(`concept note: ${slug} unavailable, ${messageOf(error)}`);
    return { ok: false, code: "unreachable", message: messageOf(error) };
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
