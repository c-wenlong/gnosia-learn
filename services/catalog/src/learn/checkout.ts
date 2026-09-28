import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { commitNoteText, MovedBaseError, readNoteText, type NoteSnapshot, type Written } from "./files";
import { workDir, workIdentity } from "./paths";

/**
 * `learn concept checkout` and `learn concept commit`: how a person or a
 * tutoring session edits a whole note once editing `learn/concepts/<id>.md`
 * directly is no longer how a note changes (D15 of
 * docs/CONTENT-MIGRATION.md).
 *
 * Checkout writes the note, exactly as its row renders it (or as its file
 * reads, while notes are still files), to `<work>/concepts/<id>.md`, with a
 * sidecar recording what it was based on. The copy is edited with any tool.
 * Commit reads it back and writes it through the one writer, refusing when
 * the note moved since the checkout (edge case 16): nothing is merged, the
 * edit is reapplied to a fresh checkout. After a commit the sidecar moves to
 * the new base, so the same copy can be edited and committed again.
 *
 * The folder is `workDir()`: under `$LEARN_ROOT/work/` when that is set, a
 * folder per checkout and database under the OS temp directory otherwise,
 * never inside the repository. The sidecar names that checkout and database,
 * and a commit from anywhere else is refused. `learn vault pull|push`
 * (`vault.ts`) does the same for a whole folder, on the row pair these call
 * underneath (`noteText` and `commitNoteText` in `content/note-rows.ts`),
 * with `.vault.json` in place of the sidecars.
 */

export class CheckoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutError";
  }
}

interface Sidecar {
  id: string;
  /** The repository root and database the copy was checked out from (`workIdentity`). */
  from: string;
  owner: NoteSnapshot["owner"];
  revision: number | null;
  /** The base note's hash, and the hash of the copy as last written or committed. */
  hash: string;
  copy: string;
}

const conceptsWork = () => path.join(workDir(), "concepts");
/** The copy a checkout writes. Refuses an id that is not one file name. */
function copyPath(id: string): string {
  if (id === "" || id.startsWith(".") || /[\\/\0]/.test(id)) throw new CheckoutError(`"${id}" is not a concept id`);
  return path.join(conceptsWork(), `${id}.md`);
}
const sidecarPath = (id: string) => path.join(conceptsWork(), `${id}.checkout.json`);

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function readSidecar(id: string): Promise<Sidecar | null> {
  try {
    return JSON.parse(await fs.readFile(sidecarPath(id), "utf8")) as Sidecar;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function readCopy(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export interface Checkout {
  id: string;
  /** The copy to edit, absolute. */
  path: string;
  /** The concept's revision it is based on; null while notes are files. */
  revision: number | null;
}

/**
 * Write a fresh copy of the note. Refuses to overwrite a copy with edits no
 * commit has taken, unless `force`, since that would throw the edit away.
 */
export async function checkoutConcept(id: string, options: { force?: boolean } = {}): Promise<Checkout> {
  const file = copyPath(id);
  const note = await readNoteText(id);
  if (note === null) throw new CheckoutError(`no such concept: ${id}`);

  const previous = await readSidecar(id);
  const copy = await readCopy(file);
  // A copy nothing vouches for (its sidecar gone) counts as edited unless it
  // already reads as the note does.
  const edited = copy !== null && (previous === null ? copy !== note.text : sha256(copy) !== previous.copy);
  if (edited && options.force !== true) {
    throw new CheckoutError(
      `${file} has edits no commit has taken. Commit them (learn concept commit ${id} --reason "..."), ` +
        `or pass --force to discard them and check out again.`,
    );
  }

  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, note.text, "utf8");
  const sidecar: Sidecar = {
    id,
    from: workIdentity(),
    owner: note.owner,
    revision: note.revision,
    hash: note.hash,
    copy: sha256(note.text),
  };
  await fs.writeFile(sidecarPath(id), `${JSON.stringify(sidecar, null, 2)}\n`, "utf8");
  return { id, path: file, revision: note.revision };
}

export interface Commit extends Written {
  id: string;
  /** The copy that was read. */
  copy: string;
  owner: NoteSnapshot["owner"];
}

/** Write the checked-out copy back, against the base it was checked out at. */
export async function commitConcept(id: string, options: { reason: string; session?: string }): Promise<Commit> {
  const file = copyPath(id);
  const sidecar = await readSidecar(id);
  const text = await readCopy(file);
  if (sidecar === null || text === null) {
    throw new CheckoutError(`there is no checkout of ${id} under ${conceptsWork()}. Run: learn concept checkout ${id}`);
  }
  if (sidecar.from !== workIdentity()) {
    throw new CheckoutError(
      `${file} was checked out from ${sidecar.from}, not ${workIdentity()}. Check it out again from here.`,
    );
  }
  const written = await commitNoteText(id, text, sidecar, { reason: options.reason, session: options.session });

  // The copy is now what the note holds, so the next commit is based on the
  // revision this commit wrote. Not on a fresh read: a commit from anywhere
  // else landing between this one and that read would become the base, and
  // the next commit of this copy would pass the check and undo it.
  const moved: Sidecar = {
    id,
    from: sidecar.from,
    owner: sidecar.owner,
    revision: written.revision,
    hash: written.hash,
    copy: sha256(text),
  };
  await fs.writeFile(sidecarPath(id), `${JSON.stringify(moved, null, 2)}\n`, "utf8");
  return { ...written, id, copy: file, owner: sidecar.owner };
}

export { MovedBaseError };
