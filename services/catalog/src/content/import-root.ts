import { execFileSync } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";

import { indexRun } from "@gnosia/schema";
import { eq, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { databaseFile } from "../db";
import { REPO_ROOT } from "../env";
import type { ExportType } from "./layout";

/**
 * Where a type's files are, for the writers that keep them in step with the
 * rows (D17), `catalog flip`'s parity and `catalog export`'s hash: the
 * directory the type was last imported from, `index_run.metadata.root`.
 *
 * **A root only counts in the database that recorded it.** `createdb -T`
 * copies every row, `index_run` included, so a scratch copy of the owner's
 * database starts out naming the owner's working tree as every type's root,
 * and its `catalog_instance` row says `primary` like the original's. A seam
 * write on that copy would then rewrite the owner's files from the copy's
 * rows. So each import records, beside the root, which database it ran
 * against (`metadata.database`: the name and the `pg_database` oid, which a
 * copy never shares with its template even when it is later renamed to the
 * same name), and a root recorded by some other database is not a root here:
 * a copy writes no file until an import run against the copy itself says
 * where its files are.
 *
 * **Nor a root in another checkout.** A root that sits in a git checkout
 * other than the one this code runs from (another worktree, or a separate
 * clone) is someone else's working tree: an agent in its own checkout,
 * pointed at the owner's database, would otherwise rewrite the owner's. A
 * root outside every git checkout (a temp tree, an export folder) is the
 * owner of that database's business, and is written; one git cannot place is
 * refused.
 */

export class WriteThroughError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteThroughError";
  }
}

/** What `index_run.metadata` says about the files a type came from. */
export interface RecordedRoot {
  root: string;
  /** The database the import ran against, as `databaseIdentity` spells it; null before this was recorded. */
  database: string | null;
}

/**
 * This connection's database: its name and its oid. The oid is what tells a
 * copy from its template, since `createdb -T` gives the copy a new one.
 */
export async function databaseIdentity(db: CatalogDatabase): Promise<string> {
  // The file path is the database's identity, the way `name:oid` was a
  // Postgres database's: two names for one file resolve to the same string.
  return databaseFile(db);
}

/** The root and the database that recorded it, or null when the type was never imported. */
export async function recordedRoot(db: CatalogDatabase, type: ExportType): Promise<RecordedRoot | null> {
  const [run] = await db.select({ metadata: indexRun.metadata }).from(indexRun).where(eq(indexRun.source, type));
  const metadata = run?.metadata as { root?: unknown; database?: unknown } | undefined;
  if (typeof metadata?.root !== "string") return null;
  return { root: metadata.root, database: typeof metadata.database === "string" ? metadata.database : null };
}

/**
 * Record that `root` is where `type`'s files are, for this database: what an
 * import that skipped a flipped type (its files are the database's own
 * export) writes, so a copy imported from an export folder names that folder.
 */
export async function recordRoot(db: CatalogDatabase, type: ExportType, root: string): Promise<void> {
  const database = await databaseIdentity(db);
  await db
    .update(indexRun)
    .set({
      metadata: sql`json_patch(coalesce(${indexRun.metadata}, '{}'), ${JSON.stringify({ root, database })})`,
      updatedAt: sql`cast(unixepoch('subsec') * 1000 as integer)`,
    })
    .where(eq(indexRun.source, type));
}

/** A path with its symlinks resolved, so two spellings of one directory compare equal. */
export async function resolvedPath(file: string): Promise<string> {
  try {
    return await realpath(file);
  } catch {
    return path.resolve(file);
  }
}

interface Checkout {
  /** The working tree's top directory. */
  top: string;
  /** The repository's shared git directory: one per repository, whatever the worktree. */
  common: string;
}

/**
 * The git checkout `directory` lies in; `null` when it lies in none; or
 * `"unknown"` when git could not say (not installed, or failed some other
 * way), which a caller must not take for "in none".
 */
function checkoutOf(directory: string): Checkout | null | "unknown" {
  try {
    const [top, common] = execFileSync("git", ["-C", directory, "rev-parse", "--show-toplevel", "--git-common-dir"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
      .trim()
      .split("\n");
    if (top === undefined || common === undefined) return "unknown";
    return { top: path.resolve(top), common: path.resolve(directory, common) };
  } catch (error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? "");
    return /not a git repository/i.test(stderr) ? null : "unknown";
  }
}

/**
 * Why a write may not rewrite files under `root`, or null when it may: the
 * root lies in no git checkout (a temp tree, an export folder), or in the
 * checkout this code runs from (`from`). A root in any other checkout, a
 * worktree of this repository or a separate clone, is someone else's working
 * tree; so is one git cannot place.
 */
export async function otherCheckout(root: string, from: string = REPO_ROOT): Promise<string | null> {
  const there = checkoutOf(root);
  if (there === null) return null;
  if (there === "unknown") return `a directory git could not inspect (${root})`;
  const here = checkoutOf(from);
  if (here !== null && here !== "unknown" && (await resolvedPath(here.top)) === (await resolvedPath(there.top))) {
    return null;
  }
  return there.top;
}

/**
 * The type's root if this database recorded it, or null: never imported
 * here, or the root was inherited from the database this one was copied from.
 */
export async function ownRoot(db: CatalogDatabase, type: ExportType): Promise<string | null> {
  const recorded = await recordedRoot(db, type);
  if (recorded === null || recorded.database === null) return null;
  return recorded.database === (await databaseIdentity(db)) ? recorded.root : null;
}

/**
 * The root a write may rewrite `type`'s files under, or a refusal saying why
 * not and what fixes it. See the module comment for the two rules.
 */
export async function writableRoot(db: CatalogDatabase, type: ExportType): Promise<string> {
  const recorded = await recordedRoot(db, type);
  if (recorded === null) {
    throw new WriteThroughError(
      `${type} has never been imported into this database, so there are no files to keep in step ` +
        `with the write. Run \`catalog import [<dir>]\` first.`,
    );
  }
  const here = await databaseIdentity(db);
  if (recorded.database !== here) {
    throw new WriteThroughError(
      `${type} was last imported from ${recorded.root} by ` +
        (recorded.database === null ? "an import that did not record its database" : `another database (${recorded.database})`) +
        `, not by this one (${here}): this database is a copy, or its import predates the check. Writing ` +
        `through would rewrite a tree this database never read. Run \`catalog import [<dir>]\` ` +
        `against this database first, so it records its own root.`,
    );
  }
  const other = await otherCheckout(recorded.root);
  if (other !== null) {
    throw new WriteThroughError(
      `${type} was last imported from ${recorded.root}, which is in ${other}, not in the checkout running ` +
        `this command (${REPO_ROOT}). Writing through would rewrite someone else's working tree. Run this ` +
        `from that checkout, or import this one first.`,
    );
  }
  return recorded.root;
}
