import { concept } from "@self-learn/schema";
import { inArray } from "drizzle-orm";

import type { CatalogDatabase } from "../db";

/**
 * Where a concept's note is, as the last `catalog index` run recorded it.
 *
 * The web app needs a note's words now and then (Today counts the check
 * blocks behind each due review), and ARCHITECTURE.md rule 6 says nothing
 * outside `src/learn/paths.ts` builds a path under `learn/`. So it does not
 * build one: it asks for the path the indexer read the note from, which is
 * `concept.path`, repo-relative, and joins that onto its own repository root.
 * Read-only, and on the content half, like `knowledge-base.ts`.
 */

/** A concept slug to its note's repo-relative path. A slug with no row is absent. */
export type NotePaths = Record<string, string>;

export async function notePaths(db: CatalogDatabase, slugs: readonly string[]): Promise<NotePaths> {
  if (slugs.length === 0) return {};
  const rows = await db
    .select({ slug: concept.slug, path: concept.path })
    .from(concept)
    .where(inArray(concept.slug, [...new Set(slugs)]));
  return Object.fromEntries(rows.map((row) => [row.slug, row.path]));
}
