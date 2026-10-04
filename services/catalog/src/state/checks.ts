import { concept, type OwnerScope } from "@self-learn/schema";
import { and, inArray } from "drizzle-orm";

import { ownedBy, scopedRead } from "../content/scope";
import type { CatalogDatabase } from "../db";
import { parseChecks } from "../../../../scripts/learn/lib/markdown.mjs";

/**
 * How many ```check blocks each of these concepts' notes holds, for the
 * module path's "3 checks in the note" beside Quiz me (phase 3 of
 * docs/proposals/module-learning-path.md).
 *
 * Counted here, from `concept.body`, with the pipeline's own `parseChecks`
 * (the reading `learn review due` and the CLI's sessions use, which the web
 * app's port in `concept-note-core.ts` is pinned to agree with), so a course
 * page learns a number per concept in one round trip and the notes never
 * leave the catalog. A block with no `q:` is not a check.
 *
 * Owner-scoped: a concept the reader cannot read is absent, as one with no
 * note row is; one they can read with no body counts 0. An empty list asks
 * nothing.
 */
export async function conceptCheckCounts(
  db: CatalogDatabase,
  slugs: readonly string[],
  scope: OwnerScope,
  /**
   * The parser to count with. The web app passes the one its concept
   * session asks from (`concept-note-core.ts`), so the count beside Quiz me
   * and the questions the session finds cannot disagree on a note.
   */
  parse: (body: string) => readonly unknown[] = (body) => parseChecks(body) as unknown[],
): Promise<Record<string, number>> {
  const wanted = [...new Set(slugs)];
  if (wanted.length === 0) return {};
  const rows = await scopedRead(db, scope.readable, (owners) =>
    db
      .select({ slug: concept.slug, body: concept.body })
      .from(concept)
      .where(and(inArray(concept.slug, wanted), ownedBy(concept.ownerId, owners))),
  );
  const out: Record<string, number> = {};
  for (const row of rows) out[row.slug] = parse(row.body ?? "").length;
  return out;
}
