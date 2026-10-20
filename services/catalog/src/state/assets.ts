import {
  asset,
  assetConcept,
  assetName,
  assetDerivation,
  assetTopic,
  collection,
  collectionItem,
  concept,
  contentRevision,
  type OwnerScope,
  topic,
} from "@self-learn/schema";
import { and, asc, count, eq, inArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { andOwnedBy, cacheKey, ownedBy, type Owners, scopedRead } from "../content/scope";
import type { CatalogDatabase } from "../db";
import { bytewise } from "../sql-order";

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
 * exactly one writer either way — `catalog import`, from files in git (rule 11).
 *
 * **Paths, never bodies**, the same rule `catalog show` states: a row says
 * which file, and the caller reads it or serves it. Putting the bytes of a
 * video in a query result would be absurd; putting the text of a note there
 * would be a second, staler copy of the note.
 *
 * The CLI now calls these too, so `catalog show` and a page cannot end up
 * disagreeing about what an asset row is.
 *
 * **Scoped by owner** (phase 4 of docs/CONTENT-MIGRATION.md). Every query
 * takes an `OwnerScope`, required, and keeps only assets `scope.readable`
 * owns; an answer naming concepts keeps only concepts they own too. Asset ids
 * are global (D3), so without this a second owner's video would sit in the
 * first owner's library. The web app passes `ownerScope(currentOwner())`, the
 * CLI `cliScope()`. On a database from before 0010, which has no `owner_id`
 * and so one owner, each reads unscoped (`scopedRead`), as it did before.
 */

/** An asset as everything other than `catalog show <asset-id>` needs it. */
export interface AssetRef {
  id: string;
  kind: string;
  path: string | null;
  url: string | null;
  bytes: number | null;
  /** The reader's own name for it (`asset_name`) when they gave one, else the source's title. */
  title: string | null;
  sourceRepo: string;
}

/**
 * The columns an `AssetRef` is made of, for one reader. Private: a caller that
 * wants asset rows asks for them by topic, concept, collection or id, and never
 * has to know which columns that means. Handing drizzle column objects across
 * the door would be handing out a query builder.
 *
 * `title` is the reader's own name for the asset when they gave it one
 * (`asset_name`, written by `./asset-names.ts`), and the source's title
 * otherwise. A correlated lookup on the primary key rather than a join, so
 * every query below keeps its joins and its one row per asset, and so a
 * renamed video sorts, searches and reads under its new name on every page
 * that lists assets, with nothing for a caller to remember.
 */
function assetColumns(learnerId: string, names: boolean) {
  return {
    id: asset.id,
    kind: asset.kind,
    path: asset.path,
    url: asset.url,
    bytes: asset.bytes,
    title: names ? namedTitle(learnerId) : asset.title,
    sourceRepo: asset.sourceRepo,
  } as const;
}

/**
 * `asset.title`, unless this learner named the asset (`assetColumns`). Every
 * column spelled with its table, since drizzle leaves them bare in a query on
 * one table and a bare `title` inside the lookup would be ambiguous.
 */
export function namedTitle(learnerId: string): SQL<string | null> {
  return sql<string | null>`coalesce((select n.title from ${assetName} n where n.learner_id = ${learnerId} and n.asset_id = "asset"."id"), "asset"."title")`;
}

/** Only a yes is kept, as `ownersExist` keeps it: a table is never dropped. */
const hasNames = new WeakMap<object, true>();
let warnedUnnamed = false;

/**
 * Does this database have `asset_name` (migration 0024)? A database behind
 * the journal reads every asset under its source's title, as it did before
 * the table existed, rather than failing every asset read until someone runs
 * `migrate`. Asked once per pool after the table appears; asked again on each
 * read before that, so a migration while the process runs is seen at once.
 */
export async function assetNamesExist(db: CatalogDatabase): Promise<boolean> {
  const key = cacheKey(db);
  if (hasNames.has(key)) return true;
  const { rows } = await db.execute<{ present: boolean }>(
    sql`select exists(select 1 from sqlite_master where type = 'table' and name = 'asset_name') as present`,
  );
  const present = rows[0]?.present === true;
  if (present) hasNames.set(key, true);
  else if (!warnedUnnamed) {
    warnedUnnamed = true;
    console.warn("asset names: this database predates asset_name (0024), so assets show their source's titles; run `npm run catalog -- migrate`");
  }
  return present;
}

/** Only a yes is kept, as for `asset_name`. */
const hasRevisions = new WeakMap<object, true>();

/**
 * Does this database have `content_revision` (migration 0010)? A database
 * from before it has no record of who wrote a row, so every asset reads with
 * `editedAt` null rather than every asset read failing.
 */
export async function revisionsExist(db: CatalogDatabase): Promise<boolean> {
  const key = cacheKey(db);
  if (hasRevisions.has(key)) return true;
  const { rows } = await db.execute<{ present: boolean }>(
    sql`select exists(select 1 from sqlite_master where type = 'table' and name = 'content_revision') as present`,
  );
  const present = rows[0]?.present === true;
  if (present) hasRevisions.set(key, true);
  return present;
}

/**
 * When a person last changed the asset, if a person's write is the last
 * change it has had: the Library's "edited 2 Oct" (L2 of
 * docs/proposals/library-by-type-and-day.md, the owner's call of 2026-10-05).
 * Null when the last change was an import or an indexer, and for an asset
 * with no history.
 *
 * `asset.updated_at` cannot answer it: every upsert sets it, so a `catalog
 * import` or a video tool's index run that rewrites a row moves it, and on
 * the owner's catalog 739 of 963 assets had it later than `created_at`.
 * `content_revision` says who wrote each version (`author_kind`), so the last
 * change is the asset's latest revision that changed something, and the
 * answer is its time when its author was a person.
 *
 * Three refinements, each from the owner's own history:
 *
 * - A person-run write that only moved bytes into the blob store or rehooked
 *   a poster (`catalog asset upload`, flip day) is not a change: a revision
 *   whose snapshot, less `entity.blob_key` and `links.asset_derivation`,
 *   equals the one before it is skipped. An import revision is always a
 *   change, since an import appends only when its snapshot moved.
 * - A poster is cut by `catalog asset upload` or a studio accept and never
 *   edited, but the upload records itself as a person, so a poster's
 *   revisions never count.
 * - A rename is the reader's own `asset_name` row, not a revision, so its
 *   `updated_at` is a person's change too, and the later of it and the last
 *   revision decides. Both are stamped by the database's clock, and a tie
 *   goes to the revision (`person` false sorts first), so an import in the
 *   same instant as a rename still cancels it. Clearing a name deletes the
 *   row, so a cleared name leaves no trace here: the asset reads as its
 *   last revision says.
 *
 * Revisions are keyed by the asset's id, which is global (D23), and only an
 * asset the reader may read reaches this, so it widens nothing.
 */
function editedAtColumn(learnerId: string, names: boolean): SQL<Date | string | null> {
  const stripped = (alias: string) => sql.raw(`json_remove(${alias}.snapshot, '$.entity.blob_key', '$.links.asset_derivation')`);
  const renamed = names
    ? sql`union all (select n.updated_at, true from ${assetName} n where n.learner_id = ${learnerId} and n.asset_id = "asset"."id")`
    : sql``;
  return sql<Date | string | null>`(
    select case when x.person then x.at end
    from (
      (select c.created_at as at, (c.author_kind = 'person' and c.op <> 'delete' and "asset"."kind" <> 'poster') as person
       from ${contentRevision} c
       left join ${contentRevision} p on p.id = c.previous_id
       where c.entity_type = 'asset' and c.entity_id = "asset"."id"
         and (c.author_kind = 'import' or p.id is null or ${stripped("c")} is not ${stripped("p")})
       order by c.seq desc
       limit 1)
      ${renamed}
    ) x
    order by x.at desc, x.person
    limit 1
  )`;
}

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
export async function assetsForTopic(db: CatalogDatabase, slug: string, scope: OwnerScope): Promise<AssetRef[]> {
  const names = await assetNamesExist(db);
  return scopedRead(db, scope.readable, (owners) =>
    db
      .select(assetColumns(scope.owner, names))
      .from(assetTopic)
      .innerJoin(asset, eq(asset.id, assetTopic.assetId))
      // The topic too: asked about one the reader cannot see, the answer is
      // the one a missing topic gets, not the reader's own assets filed there.
      .innerJoin(topic, eq(topic.slug, assetTopic.topicSlug))
      .where(and(eq(assetTopic.topicSlug, slug), ownedBy(asset.ownerId, owners), ownedBy(topic.ownerId, owners)))
      .orderBy(asc(bytewise(asset.kind)), asc(bytewise(asset.id))),
  );
}

/**
 * Assets about this concept, the narrow case. `asset_concept` is optional
 * enrichment under the topic link, so a topic with assets can have concepts
 * with none, and the empty array is the normal answer rather than a gap.
 */
export async function assetsForConcept(db: CatalogDatabase, slug: string, scope: OwnerScope): Promise<AssetRef[]> {
  const names = await assetNamesExist(db);
  return scopedRead(db, scope.readable, (owners) =>
    db
      .select(assetColumns(scope.owner, names))
      .from(assetConcept)
      .innerJoin(asset, eq(asset.id, assetConcept.assetId))
      // As `assetsForTopic`: an unreadable concept answers as a missing one.
      .innerJoin(concept, eq(concept.slug, assetConcept.conceptSlug))
      .where(and(eq(assetConcept.conceptSlug, slug), ownedBy(asset.ownerId, owners), ownedBy(concept.ownerId, owners)))
      .orderBy(asc(bytewise(asset.kind)), asc(bytewise(asset.id))),
  );
}

/**
 * `assetsForConcept` for many concepts in one round trip, keyed by concept
 * slug: the module path places each concept's diagrams and videos on its
 * step, and a module has a handful of concepts (a course page resolves every
 * module of the course, so dozens). Scoped as `assetsForConcept` is, at both
 * ends. A concept with no asset is absent, never an empty-array key, the
 * `conceptsForAssets` contract; within a concept, kind then id. An empty list
 * asks nothing.
 */
export async function assetsForConcepts(
  db: CatalogDatabase,
  slugs: readonly string[],
  scope: OwnerScope,
): Promise<Record<string, AssetRef[]>> {
  const wanted = [...new Set(slugs)];
  if (wanted.length === 0) return {};
  const names = await assetNamesExist(db);
  const rows = await scopedRead(db, scope.readable, (owners) =>
    db
      .select({ ...assetColumns(scope.owner, names), conceptSlug: assetConcept.conceptSlug })
      .from(assetConcept)
      .innerJoin(asset, eq(asset.id, assetConcept.assetId))
      .innerJoin(concept, eq(concept.slug, assetConcept.conceptSlug))
      .where(
        and(inArray(assetConcept.conceptSlug, wanted), ownedBy(asset.ownerId, owners), ownedBy(concept.ownerId, owners)),
      )
      .orderBy(asc(bytewise(assetConcept.conceptSlug)), asc(bytewise(asset.kind)), asc(bytewise(asset.id))),
  );
  const out: Record<string, AssetRef[]> = {};
  for (const { conceptSlug, ...row } of rows) (out[conceptSlug] ??= []).push(row);
  return out;
}

/**
 * The concepts each of these assets explains, the reverse of
 * `assetsForConcept`, for a page that already holds the assets.
 *
 * Batched rather than asked per card: the library grid shows a concept chip on
 * every card, so one query over `asset_concept` for all of them is the shape
 * that stays one round trip at any grid size. An asset with no concept link is
 * absent from the result, never an empty-array key, the same contract `byKind`
 * keeps, and the caller reads `out[id] ?? []`.
 *
 * Slugs within one asset come back sorted, so "the first concept this asset
 * explains" is stable across renders. `asset_concept` carries no position, so
 * sorted is the only order there is to be stable in. Ids are deduped before
 * they reach the `IN` list, and an empty list asks nothing.
 */
export async function conceptsForAssets(
  db: CatalogDatabase,
  ids: readonly string[],
  scope: OwnerScope,
): Promise<Record<string, string[]>> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return {};
  const rows = await scopedRead(db, scope.readable, (owners) =>
    db
      .select({ assetId: assetConcept.assetId, conceptSlug: assetConcept.conceptSlug })
      .from(assetConcept)
      .innerJoin(asset, eq(asset.id, assetConcept.assetId))
      .innerJoin(concept, eq(concept.slug, assetConcept.conceptSlug))
      .where(
        and(inArray(assetConcept.assetId, wanted), ownedBy(asset.ownerId, owners), ownedBy(concept.ownerId, owners)),
      )
      .orderBy(asc(bytewise(assetConcept.assetId)), asc(bytewise(assetConcept.conceptSlug))),
  );
  const out: Record<string, string[]> = {};
  for (const row of rows) (out[row.assetId] ??= []).push(row.conceptSlug);
  return out;
}

/** The concepts one asset explains, sorted by slug. Empty when it is linked to none. */
export async function conceptsForAsset(db: CatalogDatabase, id: string, scope: OwnerScope): Promise<string[]> {
  return (await conceptsForAssets(db, [id], scope))[id] ?? [];
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
 * `../index/courses.ts` is the only writer of `collection_item`: each module
 * gets its topic row and, since 0.5 of docs/CONTENT-MIGRATION.md, one asset
 * row per curated link, which the topic branch already reaches through
 * `asset_topic` and the dedupe below folds together. The concept branch has no
 * rows yet and is asked anyway, because the constraint permits it and a query
 * that silently ignores a row shape the schema allows is a bug waiting for the
 * first writer of one. This function
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
export async function assetsForCollection(db: CatalogDatabase, id: string, scope: OwnerScope): Promise<AssetRef[]> {
  const names = await assetNamesExist(db);
  const [viaTopic, viaConcept, direct] = await scopedRead(db, scope.readable, (owners) => {
    // Every hop readable: the asset, the collection asked about (an
    // unreadable one answers as a missing one), and the topic or concept a
    // member reaches the asset through.
    const mine = and(
      ownedBy(asset.ownerId, owners),
      owners === undefined
        ? undefined
        : sql`exists (select 1 from ${collection} where ${collection.id} = ${collectionItem.collectionId}${andOwnedBy(sql`${collection.ownerId}`, owners)})`,
    );
    return Promise.all([
    db
      .select(assetColumns(scope.owner, names))
      .from(collectionItem)
      .innerJoin(assetTopic, eq(assetTopic.topicSlug, collectionItem.topicSlug))
      .innerJoin(topic, eq(topic.slug, collectionItem.topicSlug))
      .innerJoin(asset, eq(asset.id, assetTopic.assetId))
      .where(and(eq(collectionItem.collectionId, id), mine, ownedBy(topic.ownerId, owners))),
    db
      .select(assetColumns(scope.owner, names))
      .from(collectionItem)
      .innerJoin(assetConcept, eq(assetConcept.conceptSlug, collectionItem.conceptSlug))
      .innerJoin(concept, eq(concept.slug, collectionItem.conceptSlug))
      .innerJoin(asset, eq(asset.id, assetConcept.assetId))
      .where(and(eq(collectionItem.collectionId, id), mine, ownedBy(concept.ownerId, owners))),
    db
      .select(assetColumns(scope.owner, names))
      .from(collectionItem)
      .innerJoin(asset, eq(asset.id, collectionItem.assetId))
      .where(and(eq(collectionItem.collectionId, id), mine)),
    ]);
  });

  const merged = new Map<string, AssetRef>();
  for (const row of [...viaTopic, ...viaConcept, ...direct]) merged.set(row.id, row);
  return [...merged.values()].sort((a, b) => byKindThenId(a, b));
}

/**
 * Kind then id, by code unit. This is the one ordering in this module done in
 * TypeScript rather than by `ORDER BY`, because the three selects above are
 * merged here, so it has to agree with what Postgres would have produced.
 *
 * `localeCompare` would not. It is locale-sensitive, so the answer depends on
 * the host's ICU data rather than on the rows, and the punctuation these ids
 * are full of is exactly where locale collation and byte order disagree: an id
 * is `manimkc:out/algorithms/...`, and a locale-aware comparison can treat `:`
 * and `/` as ignorable. Two machines would then order one collection two ways
 * while `assetsForTopic` beside it never moves.
 */
function byKindThenId(a: AssetRef, b: AssetRef): number {
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/**
 * Assets by id, for a caller that already has the ids from somewhere else. An
 * empty list short-circuits rather than issuing `where id in ()`, which
 * Postgres accepts and which costs a round trip to learn nothing.
 */
export async function assetsByIds(db: CatalogDatabase, ids: string[], scope: OwnerScope): Promise<AssetRef[]> {
  if (ids.length === 0) return [];
  const names = await assetNamesExist(db);
  return scopedRead(db, scope.readable, (owners) =>
    db
      .select(assetColumns(scope.owner, names))
      .from(asset)
      .where(and(inArray(asset.id, ids), ownedBy(asset.ownerId, owners)))
      .orderBy(asc(bytewise(asset.id))),
  );
}

/** Both directions of `asset_derivation` for one asset, in one answer. */
export interface AssetDerivations {
  /** What this asset was produced from. A transcript's video; an SVG's `.tldr`. */
  sources: AssetRef[];
  /** What was produced from this asset. A video's three sidecars; a `.tldr`'s SVG. */
  derived: AssetRef[];
}

/**
 * What this asset came from, and what came out of it.
 *
 * `asset_derivation` is the link that says a `.transcript.json`, a `.vtt` and a
 * `.chapters.json` belong to one `.mp4` rather than standing on their own —
 * 71 rows today, 69 of them manimkc sidecars and two the SVG each `.tldr` was
 * exported to. Without it a library page has no way to tell the thirty videos
 * that are the point from the sixty-nine files that exist only to accompany
 * them, and would show 206 equal rows.
 *
 * **Both directions, because the table is read both ways and the direction is
 * not the same one for every kind.** A video is the `source_asset_id` of its
 * sidecars, so its companions are found by looking *down*; a diagram SVG is the
 * `asset_id` of its `.tldr`, so its source is found by looking *up*. A query
 * that answered only one of those would be right for videos and silently wrong
 * for diagrams, which is the pair of cases this catalog actually holds.
 *
 * Two round trips and then `assetsByIds`, rather than two joins: the ids are
 * what the table stores, `assetsByIds` is already the one place `AssetRef`
 * columns are selected by id, and a derivation set is a handful of rows. The
 * ordering is `assetsByIds`' — by id — so `sources` and `derived` sort the same
 * way the rest of this file does within a kind.
 *
 * `../commands/show.ts` did exactly this inline before this existed, which put
 * the lookup somewhere the web app may not import (ARCHITECTURE.md layering
 * rule 1). It calls this now, so `catalog show` and a page cannot disagree
 * about what an asset was made from.
 */
export async function assetDerivations(
  db: CatalogDatabase,
  id: string,
  scope: OwnerScope,
): Promise<AssetDerivations> {
  // Nothing about an asset the reader cannot open, not even what hangs off it.
  if ((await assetsByIds(db, [id], scope)).length === 0) return { sources: [], derived: [] };
  const [sourceIds, derivedIds] = await Promise.all([
    db
      .select({ id: assetDerivation.sourceAssetId })
      .from(assetDerivation)
      .where(eq(assetDerivation.assetId, id)),
    db
      .select({ id: assetDerivation.assetId })
      .from(assetDerivation)
      .where(eq(assetDerivation.sourceAssetId, id)),
  ]);

  const [sources, derived] = await Promise.all([
    assetsByIds(
      db,
      sourceIds.map((r) => r.id),
      scope,
    ),
    assetsByIds(
      db,
      derivedIds.map((r) => r.id),
      scope,
    ),
  ]);
  return { sources, derived };
}

/**
 * What each of these assets was derived from, batched: `asset_derivation` read
 * upward for many ids at once, where `assetDerivations` reads both directions
 * for one.
 *
 * The library search needs this to turn a hit inside a transcript into its
 * video, since the transcript itself is a companion file the default view does
 * not show. One query for every hit rather than `assetDerivations` per hit,
 * which would be three round trips each. Absent keys mean "derived from
 * nothing", as in `conceptsForAssets`.
 */
/** The derived end of a derivation, joined under its own name. */
const derivedAsset = alias(asset, "derived");

export async function derivationSources(
  db: CatalogDatabase,
  ids: readonly string[],
  scope: OwnerScope,
): Promise<Record<string, string[]>> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return {};
  const rows = await scopedRead(db, scope.readable, (owners) =>
    db
      .select({ assetId: assetDerivation.assetId, sourceId: assetDerivation.sourceAssetId })
      .from(assetDerivation)
      .innerJoin(asset, eq(asset.id, assetDerivation.sourceAssetId))
      .innerJoin(derivedAsset, eq(derivedAsset.id, assetDerivation.assetId))
      // Both ends: a readable source answered for an unreadable derived id
      // would say that id exists, and what it was cut from.
      .where(
        and(
          inArray(assetDerivation.assetId, wanted),
          ownedBy(asset.ownerId, owners),
          ownedBy(derivedAsset.ownerId, owners),
        ),
      )
      .orderBy(asc(bytewise(assetDerivation.assetId)), asc(bytewise(assetDerivation.sourceAssetId))),
  );
  const out: Record<string, string[]> = {};
  for (const row of rows) (out[row.assetId] ??= []).push(row.sourceId);
  return out;
}

/** An `AssetRef` plus the topics it is filed under, for a page with no single subject in mind. */
export interface AssetWithTopics extends AssetRef {
  /** Slugs, sorted. Empty when the asset is in no `asset_topic` row, which is legal. */
  topics: string[];
  /**
   * When the row first entered the catalog, as an ISO instant: the library's
   * "newest" sort. `asset.created_at`, which an index run's upsert leaves alone,
   * so a re-index does not make every asset new again. Here and not on
   * `AssetRef` because `catalog show --json` prints `AssetRef`s and has no use
   * for it.
   */
  createdAt: string;
  /**
   * When the row last changed, as an ISO instant: `asset.updated_at`, which
   * every upsert sets (`updateSet` in `../content/upsert.ts`). The
   * Library no longer reads it for "edited": see `editedAt`.
   */
  updatedAt: string;
  /**
   * When a person last changed the row, as an ISO instant, or null when the
   * last change was an import or an indexer (`editedAtColumn`). The Library
   * row says "edited" when it is more than a day after `createdAt`.
   */
  editedAt: string | null;
}

/**
 * Every option optional; no options means every asset, everything the
 * catalog holds. `assetsForTopic`, `assetsForConcept` and
 * `assetsForCollection` all answer "what belongs to this one thing"; a library
 * page's first screen has no single subject yet, and needs "everything, a
 * page at a time" instead.
 */
export interface ListAssetsOptions {
  kind?: string;
  topicSlug?: string;
  sourceRepo?: string;
  /**
   * Exactly these assets, by id. The narrow case of the broad query, and the
   * reason it is here rather than served by `assetsByIds`: that returns an
   * `AssetRef`, which carries no topics, so a caller that needs one row *and*
   * its topic chips would otherwise have to page through everything looking
   * for it — which finds nothing once the catalog outgrows the page, and
   * answers 404 for a row that exists.
   *
   * An empty array asks for nothing and gets nothing, rather than being
   * dropped and quietly widening the query to every asset in the catalog.
   */
  ids?: string[];
  limit?: number;
  offset?: number;
}

/**
 * Everything, filtered and paged, with the topic chips a grid needs already
 * attached.
 *
 * One statement. The topics come back as a correlated scalar subquery in the
 * select list — `array_agg` over `asset_topic` for that row's `asset.id`,
 * `coalesce`d to `'{}'` — rather than either of the two shapes that look
 * obvious first.
 *
 * **Not a second round trip.** An earlier version of this ran the filtered,
 * paged list first and then asked `asset_topic` for the ids it kept, in a
 * second query, on the theory that two cheap statements beat one query per
 * row. They do, but they are not the same statement: under the default READ
 * COMMITTED isolation, each query gets its own snapshot, so a `catalog import`
 * run committing between them could hand back an asset whose chips no longer
 * match the membership that selected it for a `topicSlug` filter. A single
 * statement has one snapshot, so the question does not need answering rather
 * than being reasoned about — and it is also less code than the two-query
 * version was, not more, which is the rest of the argument for it.
 *
 * **Not a join either.** Joining `asset_topic` directly would multiply a row
 * with three topics into three, which breaks `limit`/`offset` (paging would
 * count topic links, not assets) and the one-row-per-asset contract every
 * other query in this file keeps. The subquery stays one row per asset no
 * matter how many topics it carries.
 *
 * The outer `ORDER BY kind, id` is unchanged and is still where the ordering
 * comes from — the same stable order `assetsForTopic` uses, for the same
 * reason the `byKindThenId` comment above gives. The topics *within* one
 * asset are ordered by the subquery's own `array_agg(... order by
 * topic_slug)`, so that ordering is SQL's too, not a second sort layered on
 * after.
 *
 * `topicSlug` filters by membership — "assets filed under this topic" — using
 * an `IN` against `asset_topic` rather than a join, for the same
 * row-multiplication reason: filtering and displaying both need one row per
 * asset, so neither can afford to join it directly.
 */
export async function listAssets(
  db: CatalogDatabase,
  options: ListAssetsOptions,
  scope: OwnerScope,
): Promise<AssetWithTopics[]> {
  // An `ids: []` asks for nothing, and `where id in ()` is not how Postgres
  // spells that. Short-circuiting also saves the round trip, the same way
  // `assetsByIds` does.
  if (options.ids !== undefined && options.ids.length === 0) return [];
  const [names, revisions] = await Promise.all([assetNamesExist(db), revisionsExist(db)]);
  return scopedRead(db, scope.readable, (owners) => listScoped(db, options, owners, scope.owner, names, revisions));
}

/** `listAssets` for one set of owners, or every owner on a database from before 0010. */
async function listScoped(
  db: CatalogDatabase,
  options: ListAssetsOptions,
  owners: Owners,
  learnerId: string,
  names: boolean,
  revisions: boolean,
): Promise<AssetWithTopics[]> {
  const { kind, topicSlug, sourceRepo, ids, limit, offset } = options;
  const conditions = [
    ownedBy(asset.ownerId, owners),
    kind === undefined ? undefined : eq(asset.kind, kind),
    sourceRepo === undefined ? undefined : eq(asset.sourceRepo, sourceRepo),
    ids === undefined ? undefined : inArray(asset.id, ids),
    topicSlug === undefined
      ? undefined
      : inArray(
          asset.id,
          db.select({ id: assetTopic.assetId }).from(assetTopic).where(eq(assetTopic.topicSlug, topicSlug)),
        ),
  ].filter((c) => c !== undefined);

  const base = db
    .select({
      ...assetColumns(learnerId, names),
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      editedAt: revisions ? editedAtColumn(learnerId, names) : sql<null>`null`,
      // Only chips for topics the reader may read (phase 4).
      topics: sql<string[]>`(
        select coalesce(json_group_array(${assetTopic.topicSlug} order by ${assetTopic.topicSlug} collate binary), '[]')
        from ${assetTopic}
        where ${assetTopic.assetId} = ${asset.id}${
          owners === undefined
            ? sql``
            : sql` and exists (select 1 from ${topic} where ${topic.slug} = ${assetTopic.topicSlug}${andOwnedBy(sql`${topic.ownerId}`, owners)})`
        }
      )`,
    })
    .from(asset)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(asc(bytewise(asset.kind)), asc(bytewise(asset.id)));
  const limited = limit === undefined ? base : base.limit(limit);
  const paged = offset === undefined ? limited : limited.offset(offset);
  const rows = await paged;

  // `coalesce(array_agg(...), '{}')` never sends a SQL null down this column,
  // and node-postgres parses a `text[]` into a real array on its own — checked
  // against this project's own database, not assumed: both the raw driver and
  // drizzle's node-postgres adapter hand back `Array.isArray(...) === true`
  // for an asset with topics and `[]`, never `null`, for one with none. This
  // still normalises rather than trusting that forever: the guarantee lives in
  // the SQL text above, and a future edit to it should not also have to
  // remember that every caller assumed the shape it produced today.
  return rows.map((row) => ({
    ...row,
    topics: row.topics ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    // A timestamp out of raw SQL is parsed by the driver, not by drizzle's
    // column mapping, so it is normalised whichever form it arrives in.
    editedAt: row.editedAt === null || row.editedAt === undefined ? null : new Date(row.editedAt).toISOString(),
  }));
}

/** How many assets of one kind exist, for a filter chip that shows the count. */
export interface AssetKindCount {
  kind: string;
  count: number;
}

/**
 * One grouped scan of `asset`, counting every kind at once — the same shape as
 * `mirrorCoverage` in `../commands/status.ts`, for the same reason: a count
 * per kind, one query at a time, would be nine round trips for a page whose
 * whole point is to be cheap. A kind with no rows is simply absent, the same
 * contract `byKind` already keeps, so a chip never claims a count of zero for
 * something the catalog does not have and never lies about one it does.
 */
export async function assetCounts(db: CatalogDatabase, scope: OwnerScope): Promise<AssetKindCount[]> {
  return scopedRead(db, scope.readable, (owners) =>
    db
      .select({ kind: asset.kind, count: count() })
      .from(asset)
      .where(ownedBy(asset.ownerId, owners))
      .groupBy(asset.kind)
      .orderBy(asc(bytewise(asset.kind))),
  );
}
