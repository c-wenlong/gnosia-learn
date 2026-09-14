import { asset, assetConcept, assetTopic, collectionItem } from "@self-learn/schema";
import { asc, eq, inArray } from "drizzle-orm";

import type { CatalogDatabase } from "../db";

/**
 * Asset lookups: which video, diagram, note or link is about this subject.
 *
 * These queries used to be private functions inside
 * `../commands/show.ts`, which made them reachable from the CLI and from
 * nowhere else. The web app may import exactly one module of this package
 * (`@self-learn/catalog/state`, ARCHITECTURE.md layering rule 1), so an asset
 * the catalog knows about could not be put on a page at all: the indexers
 * recorded 200-odd of them and the app could not name one. That is the reason
 * this file exists, and the reason it is here rather than under `commands/`.
 *
 * **Reads only, and of the content half.** `state/` is the only *writer* of the
 * state tables (rule 4), which says nothing about what it may read:
 * `knowledge-base.ts` has read `concept`, `concept_prerequisite` and
 * `concept_curriculum_item` from this directory since bundle 5, for the same
 * one-door reason. Nothing below writes anything, and the content tables have
 * exactly one writer either way — `catalog index`, from files in git (rule 11).
 *
 * **Paths, never bodies**, the same rule `catalog show` states: a row says
 * which file, and the caller reads it or serves it. Putting the bytes of a
 * video in a query result would be absurd; putting the text of a note there
 * would be a second, staler copy of the note.
 *
 * The CLI now calls these too, so `catalog show` and a page cannot end up
 * disagreeing about what an asset row is.
 */

/** An asset as everything other than `catalog show <asset-id>` needs it. */
export interface AssetRef {
  id: string;
  kind: string;
  path: string | null;
  url: string | null;
  bytes: number | null;
  title: string | null;
  sourceRepo: string;
}

/**
 * The columns an `AssetRef` is made of. Private: a caller that wants asset rows
 * asks for them by topic, concept, collection or id, and never has to know
 * which columns that means. Handing drizzle column objects across the door
 * would be handing out a query builder.
 */
const ASSET_COLUMNS = {
  id: asset.id,
  kind: asset.kind,
  path: asset.path,
  url: asset.url,
  bytes: asset.bytes,
  title: asset.title,
  sourceRepo: asset.sourceRepo,
} as const;

/**
 * Group an asset list by kind, dropping empty groups so the JSON stays small.
 *
 * Kind is how a caller decides what to render: a `video` is a player, a
 * `diagram_svg` is an image, a `link` is an anchor. Grouping here rather than in
 * each caller means the CLI's `--json` and a page see one shape.
 */
export function byKind(rows: AssetRef[]): Record<string, AssetRef[]> {
  const out: Record<string, AssetRef[]> = {};
  for (const row of rows) (out[row.kind] ??= []).push(row);
  return out;
}

/**
 * Assets about this topic, the broad case. `asset_topic` is the required join
 * every indexer writes, so this is the query that finds a video, a diagram and
 * a note about the same subject together.
 *
 * Ordered by kind then id: stable across runs, and it groups the players next
 * to the players without the caller sorting anything.
 */
export async function assetsForTopic(db: CatalogDatabase, slug: string): Promise<AssetRef[]> {
  return db
    .select(ASSET_COLUMNS)
    .from(assetTopic)
    .innerJoin(asset, eq(asset.id, assetTopic.assetId))
    .where(eq(assetTopic.topicSlug, slug))
    .orderBy(asc(asset.kind), asc(asset.id));
}

/**
 * Assets about this concept, the narrow case. `asset_concept` is optional
 * enrichment under the topic link, so a topic with assets can have concepts
 * with none, and the empty array is the normal answer rather than a gap.
 */
export async function assetsForConcept(db: CatalogDatabase, slug: string): Promise<AssetRef[]> {
  return db
    .select(ASSET_COLUMNS)
    .from(assetConcept)
    .innerJoin(asset, eq(asset.id, assetConcept.assetId))
    .where(eq(assetConcept.conceptSlug, slug))
    .orderBy(asc(asset.kind), asc(asset.id));
}

/**
 * Assets a course or module reaches through what it contains.
 *
 * `collection_item` is polymorphic: a member row names exactly one of a topic,
 * a concept or an asset, and `collection_item_one_target_check` enforces the
 * "exactly one". So a collection's assets are the union of three resolutions,
 * and all three are asked.
 *
 * ```
 *   collection_item ─ topic_slug ──► asset_topic   ──┐
 *                   ─ concept_slug ► asset_concept ──┼──► asset
 *                   ─ asset_id ─────────────────────┘
 * ```
 *
 * Only the topic branch has rows today: `../index/courses.ts` is the only
 * writer of `collection_item` in the repo and every row it writes is the
 * module's topic. The other two are asked anyway, because the constraint
 * permits them and a query that silently ignores a row shape the schema allows
 * is a bug waiting for the first indexer that writes one. This function
 * resolved *only* the asset branch when it was first lifted out of
 * `catalog show`, which is why `show <module>` reported no assets for any
 * module in the catalog.
 *
 * **Deduped by asset id.** Two member topics can share one asset, and a module
 * that listed the same video twice would be a rendering bug that looks like a
 * data bug. Kind-then-id ordering is applied over the merged list so it matches
 * what the other queries return.
 *
 * Three round trips rather than one `UNION`: a collection holds a handful of
 * members, and merging in TypeScript keeps the ordering rule in one place
 * instead of restating it as an `ORDER BY` over a set operation, where
 * Postgres only accepts output column names.
 */
export async function assetsForCollection(db: CatalogDatabase, id: string): Promise<AssetRef[]> {
  const [viaTopic, viaConcept, direct] = await Promise.all([
    db
      .select(ASSET_COLUMNS)
      .from(collectionItem)
      .innerJoin(assetTopic, eq(assetTopic.topicSlug, collectionItem.topicSlug))
      .innerJoin(asset, eq(asset.id, assetTopic.assetId))
      .where(eq(collectionItem.collectionId, id)),
    db
      .select(ASSET_COLUMNS)
      .from(collectionItem)
      .innerJoin(assetConcept, eq(assetConcept.conceptSlug, collectionItem.conceptSlug))
      .innerJoin(asset, eq(asset.id, assetConcept.assetId))
      .where(eq(collectionItem.collectionId, id)),
    db
      .select(ASSET_COLUMNS)
      .from(collectionItem)
      .innerJoin(asset, eq(asset.id, collectionItem.assetId))
      .where(eq(collectionItem.collectionId, id)),
  ]);

  const merged = new Map<string, AssetRef>();
  for (const row of [...viaTopic, ...viaConcept, ...direct]) merged.set(row.id, row);
  return [...merged.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
}

/**
 * Assets by id, for a caller that already has the ids from somewhere else. An
 * empty list short-circuits rather than issuing `where id in ()`, which
 * Postgres accepts and which costs a round trip to learn nothing.
 */
export async function assetsByIds(db: CatalogDatabase, ids: string[]): Promise<AssetRef[]> {
  if (ids.length === 0) return [];
  return db.select(ASSET_COLUMNS).from(asset).where(inArray(asset.id, ids)).orderBy(asc(asset.id));
}
