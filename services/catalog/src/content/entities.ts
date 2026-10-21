import {
  asset,
  assetConcept,
  assetDerivation,
  assetTopic,
  collection,
  collectionItem,
  collectionTag,
  concept,
  conceptCurriculumItem,
  conceptPrerequisite,
  curriculumItem,
  curriculumItemAsset,
  curriculumItemTopic,
  diagram,
  manimkcTopic,
  type RevisionEntityType,
  tag,
  topic,
  topicRelation,
  video,
} from "@gnosia/schema";
import { getTableColumns, getTableName } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";

/**
 * Which tables make up one content entity, for the revision history.
 *
 * A link row has no revision of its own: it is part of its parent's snapshot,
 * so changing a link is a revision of the parent (docs/CONTENT-MIGRATION.md,
 * `content_revision.entity_type`). This is the one place that says which
 * parent owns which link, and both the seam and the importer read it, so the
 * two can never snapshot the same entity differently.
 */

export interface LinkSpec {
  /** SQL table name, which is also the key under `snapshot.links`. */
  name: string;
  table: SQLiteTable;
  /** The column pointing at the parent entity, by its TypeScript key. */
  parent: string;
}

export interface EntitySpec {
  type: RevisionEntityType;
  table: SQLiteTable;
  /** The primary key column, by its TypeScript key. */
  key: string;
  links: readonly LinkSpec[];
}

const link = (table: SQLiteTable, parent: string): LinkSpec => ({
  name: getTableName(table),
  table,
  parent,
});

export const ENTITIES: Readonly<Record<RevisionEntityType, EntitySpec>> = {
  // `topic_relation` belongs to its `from` topic; a symmetric `related` edge is
  // stored once, under the smaller slug, so it belongs to that one.
  topic: {
    type: "topic",
    table: topic,
    key: "slug",
    links: [link(topicRelation, "fromSlug"), link(manimkcTopic, "topicSlug")],
  },
  tag: { type: "tag", table: tag, key: "id", links: [] },
  // The plan names `collection_tag`. `collection_item` belongs here too: a
  // module's topic is its `collection_item` row, and a changed mapping has to
  // be a revision of something.
  collection: {
    type: "collection",
    table: collection,
    key: "id",
    links: [link(collectionTag, "collectionId"), link(collectionItem, "collectionId")],
  },
  curriculum_item: {
    type: "curriculum_item",
    table: curriculumItem,
    key: "id",
    links: [
      link(curriculumItemTopic, "curriculumItemId"),
      link(conceptCurriculumItem, "curriculumItemId"),
      // A reading's `lessons:` (0022): the reading names the item, and the
      // item owns the link, so placing a reading is a revision of the lesson.
      link(curriculumItemAsset, "curriculumItemId"),
    ],
  },
  concept: {
    type: "concept",
    table: concept,
    key: "slug",
    links: [link(conceptPrerequisite, "conceptSlug")],
  },
  diagram: { type: "diagram", table: diagram, key: "slug", links: [] },
  asset: {
    type: "asset",
    table: asset,
    key: "id",
    links: [link(assetTopic, "assetId"), link(assetConcept, "assetId"), link(assetDerivation, "assetId")],
  },
  // A studio video's rendered files are `asset` rows of their own, each with
  // its own revisions; the `video` row is the source they came from.
  video: { type: "video", table: video, key: "slug", links: [] },
};

/** A column naming another content entity: where a link, or a row, points. */
export interface FarEnd {
  /** The column, by its TypeScript key. */
  column: string;
  /** The entity type it names. */
  target: RevisionEntityType;
}

/**
 * Every column of an entity's own row that names another content entity, by
 * type. Together with `LINK_FAR_ENDS`, what the seam checks a write may point
 * at (phase 4): only rows its owner may read, their own and the commons'.
 */
export const ROW_FAR_ENDS: Readonly<Partial<Record<RevisionEntityType, readonly FarEnd[]>>> = {
  collection: [{ column: "parentId", target: "collection" }],
  curriculum_item: [{ column: "collectionId", target: "collection" }],
  concept: [{ column: "topicSlug", target: "topic" }],
  diagram: [{ column: "topicSlug", target: "topic" }],
  video: [{ column: "topicSlug", target: "topic" }],
};

/** The same for each link table, by its SQL name: the far end, never the parent. */
export const LINK_FAR_ENDS: Readonly<Record<string, readonly FarEnd[]>> = {
  topic_relation: [{ column: "toSlug", target: "topic" }],
  manimkc_topic: [],
  collection_tag: [{ column: "tagId", target: "tag" }],
  collection_item: [
    { column: "topicSlug", target: "topic" },
    { column: "conceptSlug", target: "concept" },
    { column: "assetId", target: "asset" },
  ],
  curriculum_item_topic: [{ column: "topicSlug", target: "topic" }],
  concept_curriculum_item: [{ column: "conceptSlug", target: "concept" }],
  curriculum_item_asset: [{ column: "assetId", target: "asset" }],
  concept_prerequisite: [{ column: "prerequisiteSlug", target: "concept" }],
  asset_topic: [{ column: "topicSlug", target: "topic" }],
  asset_concept: [{ column: "conceptSlug", target: "concept" }],
  asset_derivation: [{ column: "sourceAssetId", target: "asset" }],
};

/**
 * Every column of an entity row that names a blob, by its TypeScript key and
 * its SQL name: `asset.blob_key`, `diagram.svg_blob_key`, a course's
 * `collection.cover_blob_key` and a studio video's `video.mp4_blob_key`. Each must be under the row's owner's prefix.
 */
export const BLOB_KEY_COLUMNS = [
  ["blobKey", "blob_key"],
  ["svgBlobKey", "svg_blob_key"],
  ["coverBlobKey", "cover_blob_key"],
  ["mp4BlobKey", "mp4_blob_key"],
] as const;

/**
 * Columns that are facts about the write rather than the content, and so are
 * left out of a snapshot. Leaving them in would make every re-import a change:
 * `updated_at` moves on every upsert, and `collection_item.id` is an identity
 * reassigned each time the links are replaced.
 */
const NOT_CONTENT = new Set(["created_at", "updated_at"]);
const NOT_CONTENT_IN = new Map<string, ReadonlySet<string>>([["collection_item", new Set(["id"])]]);

/**
 * Columns added to a table after its entities had revisions, left out of a
 * snapshot while they are null, by SQL table and column name.
 *
 * A snapshot holds every content column, so a new column, even an empty one,
 * would change the hash of every row of its table, and the next write of each
 * (a `course import` of an unchanged file, say) would append a revision whose
 * only difference is a key that says nothing. Omitted while null, a row
 * without the new value snapshots exactly as it did before the migration,
 * and the first revision that mentions the column is the one that set it.
 *
 * `collection.cover_blob_key` came with 0016, after every course and module
 * had a history. `asset.inputs_hash` came with 0031, after every asset did.
 */
export const OMITTED_WHEN_NULL: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["collection", new Set(["cover_blob_key"])],
  ["asset", new Set(["inputs_hash"])],
]);

/**
 * The same for content added after its entities had revisions with an empty
 * default rather than a null one: a jsonb column left out of a snapshot while
 * it holds `[]`, by SQL table and column name, and an owned link table left
 * out of `snapshot.links` while the entity has no row in it, by the link's
 * SQL name. Either way an entity that does not use the new thing snapshots
 * exactly as it did before the migration, and an import of an unchanged tree
 * appends no revision for it.
 *
 * `curriculum_item.videos` and `curriculum_item_asset` came with 0022.
 */
export const OMITTED_WHEN_EMPTY: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["curriculum_item", new Set(["videos"])],
]);
export const LINKS_OMITTED_WHEN_EMPTY: ReadonlySet<string> = new Set(["curriculum_item_asset"]);

/** One column off a table, by its TypeScript key. Throws rather than passing undefined on. */
export function column(table: SQLiteTable, key: string): SQLiteColumn {
  const found = (getTableColumns(table) as Record<string, SQLiteColumn | undefined>)[key];
  if (found === undefined) throw new Error(`table ${getTableName(table)} has no column "${key}"`);
  return found;
}

/**
 * The content columns of a table as `[typescriptKey, sqlName]` pairs, in the
 * table's own order. `except` drops one more by TypeScript key: a link's
 * parent column, which the snapshot already says by nesting.
 */
export function contentColumns(table: SQLiteTable, except?: string): [string, string][] {
  const skip = NOT_CONTENT_IN.get(getTableName(table));
  return Object.entries(getTableColumns(table))
    .filter(([key, col]) => key !== except && !NOT_CONTENT.has(col.name) && !(skip?.has(col.name) ?? false))
    .map(([key, col]) => [key, col.name]);
}

export function isEntityType(value: string): value is RevisionEntityType {
  return Object.hasOwn(ENTITIES, value);
}
