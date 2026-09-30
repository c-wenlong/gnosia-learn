import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { conceptShow } from "./catalog";
import { absolute, scratchDir } from "./paths";

/**
 * A brief's `source`: the note or file the diagram came out of, the one path
 * outside the job the agent may read (`settings.ts`).
 *
 * It used to be a file in the tree, `learn/concepts/<domain>/<slug>.md`.
 * Phase 3's cut-over removed `learn/`, and a note is a row now, so a source
 * that names a note and is not on disk is read from the database and written
 * into the job's scratch directory, which the agent may already read, and the
 * agent is pointed there. The note is read as the studio's owner (`--owner`
 * in `conceptShow`): theirs or the commons', never another owner's. A source
 * that is a file in the tree (any other document) is left as it is. So is one that names no note the database
 * holds, or a database that does not answer: the agent then finds no file, as
 * it would have before, and draws from the brief alone.
 */

/** `learn/concepts/<domain>/<slug>.md`, `<slug>.md` or a bare slug. */
const NOTE = /^(?:learn\/concepts\/(?:[a-z0-9][a-z0-9-]*\/)?)?([a-z0-9]+(?:-[a-z0-9]+)*)(?:\.md)?$/;

export interface ResolvedSource {
  /** What settings allow and the prompt names: the brief's own path, or the note's copy in scratch. */
  path: string;
  /** The concept whose note was written out, when one was. */
  concept: string | null;
}

export async function resolveSource(jobId: string, source: string): Promise<ResolvedSource> {
  const unchanged = { path: source, concept: null };
  if (existsSync(absolute(source))) return unchanged;
  const slug = NOTE.exec(source.trim())?.[1];
  if (slug === undefined) return unchanged;
  const shown = await conceptShow(slug);
  const note = shown.ok ? (shown.json as { body?: unknown } | null) : null;
  if (note === null || typeof note.body !== "string") return unchanged;
  const file = path.join(scratchDir(jobId), "source", `${slug}.md`);
  await mkdir(path.dirname(file), { recursive: true });
  // The body as the note holds it, its own heading included.
  await writeFile(file, `${note.body.trim()}\n`, "utf8");
  return { path: file, concept: slug };
}
