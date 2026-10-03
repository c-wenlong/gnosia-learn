import { draft } from "@self-learn/schema";
import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";

/**
 * The owner's most recently touched studio drafts, for Home's "Pick up where
 * you left off" (docs/proposals/home-page.md).
 *
 * A read of the `draft` mirror, which the studio runner writes. Only drafts
 * with a title: one has a title once the planner has written a brief, and a
 * draft with none is a conversation abandoned before it said what it would
 * make, which is nothing to go back to. Abandoned drafts are left out too.
 */
export interface RecentDraft {
  id: string;
  kind: string;
  state: string;
  title: string;
  /** ISO instant. */
  updatedAt: string;
}

/**
 * A title with something in it besides whitespace. The set is JavaScript's
 * `trim()`'s (the ASCII spaces, then U+00A0, U+1680, U+2000 to U+200A, the
 * two separators, U+202F, U+205F, U+3000 and U+FEFF): Postgres's `btrim`
 * strips only the space character, so a title of tabs or of U+3000 would
 * read as a title there and as nothing on the page.
 */
const HAS_VISIBLE = String.raw`[^[:space:]\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]`;

export async function recentDrafts(db: CatalogDatabase, ownerId: string, limit = 5): Promise<RecentDraft[]> {
  const rows = await db
    .select({ id: draft.id, kind: draft.kind, state: draft.state, title: draft.title, updatedAt: draft.updatedAt })
    .from(draft)
    // Blank titles are refused here, before the limit, so one cannot take a
    // slot and then be dropped, hiding an older draft that has a title.
    .where(
      and(
        eq(draft.ownerId, ownerId),
        isNotNull(draft.title),
        sql`${draft.title} ~ ${HAS_VISIBLE}`,
        ne(draft.state, "abandoned"),
      ),
    )
    .orderBy(desc(draft.updatedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    state: r.state,
    title: r.title as string,
    updatedAt: r.updatedAt.toISOString(),
  }));
}
