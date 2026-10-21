import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { databaseIdentity } from "./import-root";

/**
 * Which database a blob root belongs to: `<root>/.owner`.
 *
 * `catalog blob audit --fix` deletes an object no `blob_object` row names,
 * which is only safe when the table it reads is the one that wrote the store.
 * Two databases sharing `~/.gnosia/blobs` (the primary and a
 * `createdb -T` copy with no `GNOSIA_HOME` of its own) each see the
 * other's objects as orphans, and each `--fix` would delete the other's
 * bytes. So the root names its database, written the first time the catalog
 * writes to it or audits it, and `--fix` refuses a root that names another.
 *
 * A database is named the way the write-through names the database that
 * imported a tree (`databaseIdentity` in `import-root.ts`: its name and its
 * `pg_database` oid), plus the port its server listens on. A copy made with
 * `createdb -T` inherits every row of the primary, `catalog_instance`
 * included, so nothing inside the database could tell the two apart; its oid
 * can. The port is for two servers on one machine sharing a root: oids are
 * handed out from the same starting point after `initdb`, so the first
 * database created on each commonly gets the same one.
 *
 * The file is a dot name at the root, which the `fs` store never lists: an
 * owner id cannot start with a dot. A writer refuses a root another database
 * owns (`assertWritable`), since its objects would be that database's orphans.
 */

export const OWNER_FILE = ".owner";

export interface BlobRootOwner {
  /** `<name>:<oid>`, as `databaseIdentity` gives it. */
  database: string;
  /** The port the database's server listens on. */
  port: string;
}

export class BlobOwnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlobOwnerError";
  }
}

/** This connection's database, as a root's marker names it. */
export async function ownerIdentity(db: CatalogDatabase): Promise<BlobRootOwner> {
  // `port` distinguished same-named databases on different servers. A SQLite
  // database is a file, and its resolved path is already the whole identity,
  // so the field stays in the shape and answers empty.
  return { database: await databaseIdentity(db), port: "" };
}

export function sameOwner(a: BlobRootOwner, b: BlobRootOwner): boolean {
  return a.database === b.database && a.port === b.port;
}

export function describeOwner(owner: BlobRootOwner): string {
  return `database "${owner.database}" on port ${owner.port}`;
}

/** The root's marker, or null when it has none. A marker that is not one is refused, never overwritten. */
export async function readOwner(root: string): Promise<BlobRootOwner | null> {
  const file = path.join(root, OWNER_FILE);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  try {
    const parsed = JSON.parse(text) as Partial<BlobRootOwner>;
    if (typeof parsed.database === "string" && typeof parsed.port === "string") {
      return { database: parsed.database, port: parsed.port };
    }
  } catch {
    // Falls through to the refusal: an unreadable marker names nobody.
  }
  throw new BlobOwnerError(`${file} is not a blob root marker this catalog wrote; move it aside and run again`);
}

/**
 * The root's owner, claiming it for `self` when it has none. The claim is an
 * exclusive create, so two databases claiming one root at once cannot both
 * win: the loser reads the winner's marker.
 */
export async function claimRoot(root: string, self: BlobRootOwner): Promise<BlobRootOwner> {
  const existing = await readOwner(root);
  if (existing !== null) return existing;
  await mkdir(root, { recursive: true });
  try {
    await writeFile(path.join(root, OWNER_FILE), `${JSON.stringify({ ...self, claimed: new Date().toISOString() }, null, 2)}\n`, {
      flag: "wx",
    });
    return self;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const winner = await readOwner(root);
    if (winner === null) throw error;
    return winner;
  }
}

/** Roots this process has already claimed or found claimed, by root and database, so an upload does not read the marker per file. */
const known = new Map<string, BlobRootOwner>();

/**
 * A writer's claim on a root: claimed for this database when nobody has it,
 * refused when another database does. Its objects would have no row in the
 * owner's table, so the owner's `blob audit --fix` would delete them a day
 * later as orphans, and the rows here would point at nothing.
 */
export async function assertWritable(db: CatalogDatabase, root: string): Promise<void> {
  const resolved = path.resolve(root);
  const self = await ownerIdentity(db);
  const cacheKey = `${resolved}\n${self.database}\n${self.port}`;
  const owner = known.get(cacheKey) ?? (await claimRoot(resolved, self));
  if (!sameOwner(owner, self)) {
    throw new BlobOwnerError(
      `${resolved} belongs to ${describeOwner(owner)} (its ${OWNER_FILE}), and this is ${describeOwner(self)}. ` +
        `An object written here would have no row in that database, whose \`blob audit --fix\` would delete it ` +
        `as an orphan. Give this database its own store with GNOSIA_HOME; nothing was uploaded.`,
    );
  }
  known.set(cacheKey, owner);
}

/** Where the `fs` store stages a write before its rename (`TEMP_DIR` in `@gnosia/blob`). */
const TEMP_DIR = ".tmp";

export interface StagedWrite {
  file: string;
  bytes: number;
  modified: Date;
}

/**
 * Staged writes a crash left under `<root>/.tmp`, older than `cutoff`. The
 * store renames a finished write out of there, so anything older than any
 * upload runs is a write that will never finish.
 */
export async function stalePartials(root: string, cutoff: Date): Promise<StagedWrite[]> {
  const dir = path.join(root, TEMP_DIR);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const out: StagedWrite[] = [];
  for (const name of names.sort()) {
    if (!name.endsWith(".part")) continue;
    const file = path.join(dir, name);
    const facts = await stat(file).catch(() => null);
    if (facts === null || !facts.isFile() || facts.mtime >= cutoff) continue;
    out.push({ file, bytes: facts.size, modified: facts.mtime });
  }
  return out;
}

/**
 * Delete a staged write, asking its age again first: an upload that resumed
 * writing it since the listing has moved its mtime past `cutoff`, and is left
 * to finish. True when it was deleted.
 */
export async function removePartial(file: string, cutoff: Date): Promise<boolean> {
  const facts = await stat(file).catch(() => null);
  if (facts === null || facts.mtime >= cutoff) return false;
  await rm(file, { force: true });
  return true;
}
