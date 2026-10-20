import { draft } from "@self-learn/schema";
import { and, desc, eq, isNotNull, ne, or, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";

/**
 * The owner's most recently touched studio drafts, for Home's "Pick up where
 * you left off" (docs/proposals/home-page.md) and the sidebar's Recent.
 *
 * A read of the `draft` mirror, which the studio runner writes. Only drafts
 * with a name or a title: the owner names one with Rename, and the planner
 * titles one once it has written a brief; a draft with neither is a
 * conversation abandoned before it said what it would make, which is nothing
 * to go back to (the runner, which has the first message, lists those).
 * Abandoned drafts are left out too.
 *
 * Both are returned as they are. Which one a page shows is the web app's
 * `conversationTitle`: the name, else the title.
 */
export interface RecentDraft {
  id: string;
  kind: string;
  state: string;
  /** The owner's name for the conversation, or null. */
  name: string | null;
  /** The latest brief's title, or null. One of the two holds something visible. */
  title: string | null;
  /** ISO instant. */
  updatedAt: string;
}

/**
 * Something besides whitespace. The set is JavaScript's `trim()`'s (the
 * ASCII spaces, then U+00A0, U+1680, U+2000 to U+200A, the two separators,
 * U+202F, U+205F, U+3000 and U+FEFF): Postgres's `btrim` strips only the
 * space character, so a title of tabs or of U+3000 would read as a title
 * there and as nothing on the page.
 */
const HAS_VISIBLE = String.raw`\S`;

export async function recentDrafts(db: CatalogDatabase, ownerId: string, limit = 5): Promise<RecentDraft[]> {
  const rows = await db
    .select({ id: draft.id, kind: draft.kind, state: draft.state, name: draft.name, title: draft.title, updatedAt: draft.updatedAt })
    .from(draft)
    // Blank ones are refused here, before the limit, so one cannot take a
    // slot and then be dropped, hiding an older draft that has a title.
    .where(
      and(
        eq(draft.ownerId, ownerId),
        or(
          and(isNotNull(draft.name), sql`${draft.name} regexp ${HAS_VISIBLE}`),
          and(isNotNull(draft.title), sql`${draft.title} regexp ${HAS_VISIBLE}`),
        ),
        ne(draft.state, "abandoned"),
      ),
    )
    .orderBy(desc(draft.updatedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    state: r.state,
    name: r.name,
    title: r.title,
    updatedAt: r.updatedAt.toISOString(),
  }));
}
