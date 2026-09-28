import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { MIGRATIONS_FOLDER } from "../src/migrations";

/**
 * A migrations folder holding only the first `count` migrations, so a scratch
 * database can be left deliberately behind.
 *
 * Two suites need it for opposite reasons. `catalog.test.ts` stops at 0002 to
 * reach "head is set but `index_run` does not exist", which is what `status`
 * has to report rather than crash on. `studio.test.ts` stops at 0005 so it can
 * put rows in `event` the way a real database already has them, and then watch
 * 0006's backfill turn them into sessions.
 */
/** 0000 to 0012: everything before phase 2's contract migration, 0013. */
export const BEFORE_BLOB_CONTRACT = 13;

export async function partialMigrations(count = 2): Promise<string> {
  const folder = await mkdtemp(path.join(tmpdir(), "catalog-partial-"));
  await mkdir(path.join(folder, "meta"), { recursive: true });
  const journal = JSON.parse(
    await readFile(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8"),
  ) as { entries: { tag: string }[] };
  const kept = journal.entries.slice(0, count);
  for (const entry of kept) {
    await copyFile(
      path.join(MIGRATIONS_FOLDER, `${entry.tag}.sql`),
      path.join(folder, `${entry.tag}.sql`),
    );
  }
  await writeFile(
    path.join(folder, "meta", "_journal.json"),
    JSON.stringify({ ...journal, entries: kept }),
    "utf8",
  );
  return folder;
}
