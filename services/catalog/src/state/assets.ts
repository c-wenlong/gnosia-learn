import {
  asset,
  assetConcept,
  assetDerivation,
  assetTopic,
  collectionItem,
  indexRun,
  type IndexSource,
} from "@self-learn/schema";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";

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
): Promise<Record<string, string[]>> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return {};
  const rows = await db
    .select({ assetId: assetConcept.assetId, conceptSlug: assetConcept.conceptSlug })
    .from(assetConcept)
    .where(inArray(assetConcept.assetId, wanted))
    .orderBy(asc(assetConcept.assetId), asc(assetConcept.conceptSlug));
  const out: Record<string, string[]> = {};
  for (const row of rows) (out[row.assetId] ??= []).push(row.conceptSlug);
  return out;
}

/** The concepts one asset explains, sorted by slug. Empty when it is linked to none. */
export async function conceptsForAsset(db: CatalogDatabase, id: string): Promise<string[]> {
  return (await conceptsForAssets(db, [id]))[id] ?? [];
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
export async function assetsByIds(db: CatalogDatabase, ids: string[]): Promise<AssetRef[]> {
  if (ids.length === 0) return [];
  return db.select(ASSET_COLUMNS).from(asset).where(inArray(asset.id, ids)).orderBy(asc(asset.id));
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
): Promise<AssetDerivations> {
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
    ),
    assetsByIds(
      db,
      derivedIds.map((r) => r.id),
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
export async function derivationSources(
  db: CatalogDatabase,
  ids: readonly string[],
): Promise<Record<string, string[]>> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return {};
  const rows = await db
    .select({ assetId: assetDerivation.assetId, sourceId: assetDerivation.sourceAssetId })
    .from(assetDerivation)
    .where(inArray(assetDerivation.assetId, wanted))
    .orderBy(asc(assetDerivation.assetId), asc(assetDerivation.sourceAssetId));
  const out: Record<string, string[]> = {};
  for (const row of rows) (out[row.assetId] ??= []).push(row.sourceId);
  return out;
}

/** What one source's last index run said about where it read from. */
export interface IndexedRoot {
  /** The directory the run read. Absolute for manimkc, repo-relative otherwise. */
  sourceRoot: string;
  /**
   * The base an `asset.path` from this source resolves against, when the
   * source records one. Null for a source whose paths are repo-relative, and
   * null for a manimkc run indexed before that value was persisted.
   */
  dataRoot: string | null;
}

/**
 * Where the files one source indexed actually are.
 *
 * An `asset.path` is a string relative to something, and which something
 * depends on the source. A note, a diagram and a session log are relative to
 * this repository; a manimkc video is relative to manimkc's own data root,
 * which may sit anywhere and on this machine sits outside the checkout
 * entirely. Reading `$MANIMKC_HOME` to find out is not an option: nothing in
 * this repository does (AGENTS.md), and the answer belongs to whichever
 * checkout was indexed rather than to the ambient environment. So the run
 * records what the manimkc report told it and this reads that back.
 *
 * `source_root` and `dataRoot` are deliberately separate. The column says what
 * the run *read*: for manimkc the checkout, for the others a repo-relative
 * directory. The metadata says what its output paths are *relative to*. They
 * are the same directory only when manimkc has no data root configured, and
 * telling them apart is the difference between serving a video and 404ing on
 * all thirty of them.
 *
 * Null means this source has never been indexed here, which is a different
 * answer from "indexed, but before `outRoot` was recorded" and the caller has
 * to distinguish them: one needs a first index run, the other a re-run.
 */
export async function indexedRoot(
  db: CatalogDatabase,
  source: IndexSource,
): Promise<IndexedRoot | null> {
  const [row] = await db
    .select({ sourceRoot: indexRun.sourceRoot, metadata: indexRun.metadata })
    .from(indexRun)
    .where(eq(indexRun.source, source))
    .limit(1);
  if (row === undefined) return null;
  // jsonb, so anything could be in there: an older run wrote `{}`, and the
  // column's type says nothing about its shape.
  const raw = (row.metadata as Record<string, unknown> | null)?.outRoot;
  const dataRoot = typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
  return { sourceRoot: row.sourceRoot, dataRoot };
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
 * COMMITTED isolation, each query gets its own snapshot, so a `catalog index`
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
  options: ListAssetsOptions = {},
): Promise<AssetWithTopics[]> {
  const { kind, topicSlug, sourceRepo, ids, limit, offset } = options;
  // An `ids: []` asks for nothing, and `where id in ()` is not how Postgres
  // spells that. Short-circuiting also saves the round trip, the same way
  // `assetsByIds` does.
  if (ids !== undefined && ids.length === 0) return [];
  const conditions = [
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
      ...ASSET_COLUMNS,
      createdAt: asset.createdAt,
      topics: sql<string[]>`(
        select coalesce(array_agg(${assetTopic.topicSlug} order by ${assetTopic.topicSlug}), '{}')
        from ${assetTopic}
        where ${assetTopic.assetId} = ${asset.id}
      )`,
    })
    .from(asset)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(asc(asset.kind), asc(asset.id));
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
export async function assetCounts(db: CatalogDatabase): Promise<AssetKindCount[]> {
  return db.select({ kind: asset.kind, count: count() }).from(asset).groupBy(asset.kind).orderBy(asc(asset.kind));
}
