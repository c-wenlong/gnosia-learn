import { topic } from "@self-learn/schema";
import { asc, inArray } from "drizzle-orm";

import type { CatalogDatabase } from "../db";

/**
 * Topic lookups: the shared vocabulary's titles, for a caller that already
 * has slugs from somewhere else.
 *
 * This is its own module rather than a fourth thing living in `assets.ts`.
 * `assets.ts` reads `asset` and the tables that link *to* it; `topic` is a
 * different entity with its own primary key, read here without an asset in
 * sight the same way `knowledge-base.ts` reads `concept` without one. One
 * module per entity is the pattern every file in this directory already
 * follows (`recap.ts`, `review.ts`, `progress.ts`, `mastery.ts`), and a topic
 * query bolted onto `assets.ts` would be the odd one out rather than the
 * asset queries it would sit beside.
 */

/** A topic slug to its title, for slugs that have a `topic` row. */
export type TopicTitles = Record<string, string>;

/**
 * Titles for a set of topic slugs, keyed by slug.
 *
 * A `Record`, not a list: the caller is a grid of asset cards drawn in one
 * render, each with zero or more topic chips, so the shape that gets used is
 * "what is the title for *this* slug", asked once per chip. A list would make
 * every chip search it; `byKind` in `assets.ts` returns the same kind of
 * lookup for the same reason. The slugs a page needs come from
 * `AssetWithTopics.topics` across a whole page of cards, so this takes a set
 * of them and answers all of them in one round trip rather than one query per
 * chip.
 *
 * **A slug with no `topic` row is simply absent from the result.**
 * `asset_topic.topic_slug` is a foreign key, so an asset's own topics always
 * resolve; this exists for the caller that already has a slug from elsewhere
 * (a stale link, a hand-typed filter) and should not have a page throw over
 * it. The absence is the answer: `titles[slug] ?? slug` falls back to the
 * slug itself, which reads as the same chip the page showed before this query
 * existed, rather than a 500.
 *
 * **An empty input short-circuits.** Same reason `assetsByIds` does: Postgres
 * accepts `where slug in ()` and returns nothing, but paying for the round
 * trip to learn that is wasted when the caller already knows there is nothing
 * to ask, which a page with a card that carries no topics does on every
 * render.
 *
 * **Ordering comes from `ORDER BY`, not from iterating the input.** The rows
 * are read out sorted by slug before being folded into the record, so two
 * calls with the same slugs in a different order, or the same slugs appearing
 * twice, produce the same result built the same way. A `Record`'s own key
 * order is otherwise insertion order, and leaving that to depend on whatever
 * order the caller happened to list slugs in is the exact `localeCompare`
 * mistake `byKindThenId` in `assets.ts` was fixed for, applied to a lookup
 * instead of a sort.
 */
export async function topicTitles(db: CatalogDatabase, slugs: string[]): Promise<TopicTitles> {
  if (slugs.length === 0) return {};
  const rows = await db
    .select({ slug: topic.slug, title: topic.title })
    .from(topic)
    .where(inArray(topic.slug, slugs))
    .orderBy(asc(topic.slug));

  const titles: TopicTitles = {};
  for (const row of rows) titles[row.slug] = row.title;
  return titles;
}
