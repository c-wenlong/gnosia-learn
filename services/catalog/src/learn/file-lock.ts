import { open, rename, rm, writeFile, type FileHandle } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

/**
 * A lock file and an atomic replace, for the one text edit left on an
 * authored file: `course-edit.ts` listing a concept on a course row, until
 * Track B moves courses into the database.
 *
 * These lived in `vocabulary-edit.ts` beside the splice that added a concept
 * to `content/topics.yaml`. That splice is gone (a concept's topic is written
 * through the catalog now, `fileConceptUnderTopic` in
 * `../content/topics.ts`), and the two helpers moved here with the reason
 * each exists.
 */

/** Another process held the lock past the timeout. */
export class FileLockError extends Error {}

/** How long to wait for another process to finish its edit before giving up. */
const LOCK_TIMEOUT_MS = 10_000;
const LOCK_POLL_MS = 50;

/**
 * Hold an exclusive lock on one authored file for the length of one edit.
 *
 * The edit is a read, a splice and a write, so two of them running at once can
 * both read the same original and the second write drops the first listing.
 * Neither would notice: each verifies only its own id, so both report success
 * and one listing is lost, which cannot be left to luck.
 *
 * `open(..., "wx")` is the lock: creating a file that must not already exist
 * is atomic on every filesystem this runs on, which a "read then write" check
 * is not. The lock file holds the pid, so a stale one names who to look for.
 *
 * `label` is the file as an error names it.
 */
export async function withFileLock<T>(
  file: string,
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lockFile = `${file}.lock`;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  /** Blocks until the lock file is ours, and hands back the open handle. */
  async function acquire(): Promise<FileHandle> {
    for (;;) {
      try {
        return await open(lockFile, "wx");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (Date.now() >= deadline) {
          throw new FileLockError(
            `another process has been editing ${label} for over ` +
              `${LOCK_TIMEOUT_MS / 1000}s. If nothing else is running, the lock is stale: ` +
              `delete ${path.basename(lockFile)} beside it.`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
      }
    }
  }

  const handle = await acquire();
  // From here the lock is held, so every exit has to give it back. A throw
  // between `open` and this `finally` would leave a file nobody owns, and the
  // next edit would wait the full timeout and then fail on it.
  try {
    try {
      await handle.writeFile(`${process.pid}\n`, "utf8");
    } finally {
      await handle.close();
    }
    return await fn();
  } finally {
    await rm(lockFile, { force: true });
  }
}

let temporaryCounter = 0;

/**
 * Replace a file's contents in one step.
 *
 * Write then rename, so a crash mid-write leaves the old file rather
 * than half of one. The temporary name carries the pid and a counter: the lock
 * already keeps two edits apart, and a name that could collide would turn a
 * missing lock into a confusing ENOENT on the rename rather than a clean
 * last-write-wins.
 */
export async function writeAtomically(file: string, text: string): Promise<void> {
  temporaryCounter += 1;
  const temporary = `${file}.${process.pid}.${temporaryCounter}.tmp`;
  await writeFile(temporary, text, "utf8");
  await rename(temporary, file);
}
