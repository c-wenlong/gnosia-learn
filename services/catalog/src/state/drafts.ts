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
        sql`btrim(${draft.title}) <> ''`,
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
