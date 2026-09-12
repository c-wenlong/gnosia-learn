import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { createdAt, updatedAt } from "./columns";

/**
 * The content half of the catalog: what exists, and how the pieces refer to
 * one another. Everything here is *derived* from files in git (concept notes,
 * course data, manimkc topics, .tldr sources). It is rebuildable by re-running
 * the indexers, so nothing in this file is a source of truth. The state half
 * (state.ts) is the opposite: those rows are the only copy.
 *
 * Kind columns are `text` plus a CHECK rather than a Postgres ENUM. An enum
 * reads better in psql, but widening one is `ALTER TYPE ... ADD VALUE`, which
 * has awkward transaction rules and cannot remove a value at all. A CHECK is a
 * one-line DROP/ADD in a migration, and these vocabularies are expected to grow
 * (bundle 6 adds asset kinds). The constraint is just as real either way.
 */

/** Kinds an `asset` row may take. Note the absence of `curriculum_item`: see SCHEMA.md. */
export const ASSET_KINDS = [
  "video",
  "transcript",
  "chapters",
  "captions",
  "diagram_source",
  "diagram_svg",
  "note",
  "session",
  "link",
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** Which repository an asset's bytes live in. */
export const SOURCE_REPOS = ["self-learn", "manimkc", "tldrawkc"] as const;
export type SourceRepo = (typeof SOURCE_REPOS)[number];

/** A `collection` is any ordered container. Courses and modules today, decks next. */
export const COLLECTION_KINDS = ["course", "module", "deck"] as const;
export type CollectionKind = (typeof COLLECTION_KINDS)[number];

/** How one concept depends on another. `requires` is hard, `assumes` is soft. */
export const PREREQUISITE_KINDS = ["requires", "assumes"] as const;
export type PrerequisiteKind = (typeof PREREQUISITE_KINDS)[number];

const inList = (column: string, values: readonly string[]) =>
  sql.raw(`${column} in (${values.map((v) => `'${v}'`).join(", ")})`);

/**
 * The shared vocabulary. One row per subject label, and the required join for
 * every asset: a video, a diagram and a concept note about hash tables all
 * point at the same `topic` row, which is the only reason a query can find them
 * together. Seeded from the manimkc domain tree plus the course modules.
 */
export const topic = pgTable(
  "topic",
  {
    slug: text("slug").primaryKey(),
    title: text("title").notNull(),
    /** Top-level bucket, e.g. `algorithms`, `networking`. Mirrors manimkc's first path segment. */
    domain: text("domain").notNull(),
    summary: text("summary"),
    /**
     * Other names for the same subject, so `catalog search tomasulo` finds
     * "Tomasulo's algorithm" and `catalog search "common data bus"` finds it
     * too. jsonb rather than text[] because every other list column in this
     * schema is jsonb (`subtopics`, `key_points`) and one array representation
     * is easier to reason about than two; the search is
     * `jsonb_array_elements_text(...) ilike ...` either way.
     */
    aliases: jsonb("aliases").notNull().default(sql`'[]'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("topic_domain_idx").on(t.domain)],
);

/**
 * One authored note under `learn/concepts/<domain>/`. A concept is the only
 * thing that carries mastery and prerequisites; it is optional enrichment
 * *under* a topic, which is why `topicSlug` is nullable for now (most notes
 * have an empty `topics:` frontmatter list today).
 */
export const concept = pgTable(
  "concept",
  {
    slug: text("slug").primaryKey(),
    title: text("title").notNull(),
    summary: text("summary"),
    topicSlug: text("topic_slug").references(() => topic.slug, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /** Repo-relative path of the note, e.g. `learn/concepts/algorithms/master-theorem.md`. */
    path: text("path").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("concept_path_key").on(t.path),
    index("concept_topic_slug_idx").on(t.topicSlug),
  ],
);

/**
 * Courses, modules and (later) decks, in one self-referencing tree. `metadata`
 * carries the kind-specific extras the web app already shows and that no query
 * joins on: `inferred`, `code`, `credits`, `track`, `tags`, `capstone`.
 */
export const collection = pgTable(
  "collection",
  {
    /** The authored id, e.g. `cs4263` or `cs4263-m1`. Opaque; never parsed. */
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    parentId: text("parent_id").references((): AnyPgColumn => collection.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    position: integer("position").notNull().default(0),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("collection_kind_check", inList("kind", COLLECTION_KINDS)),
    check("collection_not_own_parent_check", sql`parent_id is distinct from id`),
    index("collection_parent_id_idx").on(t.parentId),
    // NULLS NOT DISTINCT so two top-level courses cannot share a slug. With the
    // default (nulls distinct) every course has parent_id NULL and the unique
    // index would never fire for them, which is exactly the case that matters.
    unique("collection_parent_slug_key").on(t.parentId, t.slug).nullsNotDistinct(),
  ],
);

/**
 * The checklist row a learner ticks off: `cs4263-m1-t1`, "Problem formulation
 * and state spaces". Its own table rather than an `asset` kind, because it has
 * no bytes, no path and no hash, and because three state tables need a real
 * foreign key to it. Reasoning in full in services/catalog/SCHEMA.md.
 *
 * The id is the stable external key. It survives every later move: reordering
 * or reparenting changes `position` and `collectionId`, never the id, and
 * nothing parses the id's course/module prefix.
 */
export const curriculumItem = pgTable(
  "curriculum_item",
  {
    id: text("id").primaryKey(),
    /** The module (a `collection`) this item is authored inside. */
    collectionId: text("collection_id")
      .notNull()
      .references(() => collection.id, { onDelete: "cascade", onUpdate: "cascade" }),
    position: integer("position").notNull().default(0),
    title: text("title").notNull(),
    /** The bullet list under the item. Display-only, never joined on. */
    subtopics: jsonb("subtopics").notNull().default(sql`'[]'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("curriculum_item_collection_id_idx").on(t.collectionId)],
);

/**
 * A file or a link. One row per artefact, wherever its bytes live.
 * Exactly one of `path` (a file in one of the three repos) or `url` (something
 * on the web) is set, so "where is it" always has one answer.
 */
export const asset = pgTable(
  "asset",
  {
    /** Stable id minted by the indexer, e.g. `manimkc:algorithms/master-theorem/video`. */
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    path: text("path"),
    url: text("url"),
    /** sha256 of the bytes. Null for links and for anything not yet hashed. */
    contentHash: text("content_hash"),
    bytes: bigint("bytes", { mode: "number" }),
    title: text("title"),
    sourceRepo: text("source_repo").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("asset_kind_check", inList("kind", ASSET_KINDS)),
    check("asset_source_repo_check", inList("source_repo", SOURCE_REPOS)),
    check("asset_location_check", sql`num_nonnulls(path, url) = 1`),
    check("asset_bytes_check", sql`bytes is null or bytes >= 0`),
    uniqueIndex("asset_repo_path_key").on(t.sourceRepo, t.path),
    index("asset_kind_idx").on(t.kind),
    index("asset_content_hash_idx").on(t.contentHash),
  ],
);

/* ------------------------------------------------------------------ *
 * Links. Every one of these is a named table with a foreign key at both
 * ends. A single generic `edge(from_type, from_id, to_type, to_id)` table
 * would have to drop the foreign keys, and then a typo in an indexer is a
 * row that reads fine and joins to nothing. Here it is a constraint error
 * at write time, which is the entire reason this data is in Postgres.
 * ------------------------------------------------------------------ */

/** This asset is about this topic. The join that makes the vocabulary useful. */
export const assetTopic = pgTable(
  "asset_topic",
  {
    assetId: text("asset_id")
      .notNull()
      .references(() => asset.id, { onDelete: "cascade", onUpdate: "cascade" }),
    topicSlug: text("topic_slug")
      .notNull()
      .references(() => topic.slug, { onDelete: "cascade", onUpdate: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.assetId, t.topicSlug] }),
    index("asset_topic_topic_slug_idx").on(t.topicSlug),
  ],
);

/** This asset is about this concept. Narrower than asset_topic, and optional. */
export const assetConcept = pgTable(
  "asset_concept",
  {
    assetId: text("asset_id")
      .notNull()
      .references(() => asset.id, { onDelete: "cascade", onUpdate: "cascade" }),
    conceptSlug: text("concept_slug")
      .notNull()
      .references(() => concept.slug, { onDelete: "cascade", onUpdate: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.assetId, t.conceptSlug] }),
    index("asset_concept_concept_slug_idx").on(t.conceptSlug),
  ],
);

/**
 * `conceptSlug` depends on `prerequisiteSlug`. Mirrors the `requires:` and
 * `assumes:` frontmatter lists. `kind` is part of the primary key because a
 * pair may legitimately appear under both labels in different revisions and
 * the graph code distinguishes them.
 */
export const conceptPrerequisite = pgTable(
  "concept_prerequisite",
  {
    conceptSlug: text("concept_slug")
      .notNull()
      .references(() => concept.slug, { onDelete: "cascade", onUpdate: "cascade" }),
    prerequisiteSlug: text("prerequisite_slug")
      .notNull()
      .references(() => concept.slug, { onDelete: "cascade", onUpdate: "cascade" }),
    kind: text("kind").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.conceptSlug, t.prerequisiteSlug, t.kind] }),
    check("concept_prerequisite_kind_check", inList("kind", PREREQUISITE_KINDS)),
    check(
      "concept_prerequisite_no_self_check",
      sql`concept_slug <> prerequisite_slug`,
    ),
    index("concept_prerequisite_prerequisite_slug_idx").on(t.prerequisiteSlug),
  ],
);

/**
 * An ordered membership row: this collection contains exactly one of a topic,
 * a concept or an asset. The CHECK is what makes the three nullable columns
 * honest; without it a row could name none of them, or two.
 *
 * Curriculum items are *not* a fourth target. They belong to exactly one module
 * and are authored inside it, so they carry `collection_id` directly rather
 * than paying for a many-to-many they will never use.
 */
export const collectionItem = pgTable(
  "collection_item",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collection.id, { onDelete: "cascade", onUpdate: "cascade" }),
    position: integer("position").notNull().default(0),
    topicSlug: text("topic_slug").references(() => topic.slug, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    conceptSlug: text("concept_slug").references(() => concept.slug, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    assetId: text("asset_id").references(() => asset.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "collection_item_one_target_check",
      sql`num_nonnulls(topic_slug, concept_slug, asset_id) = 1`,
    ),
    index("collection_item_collection_id_idx").on(t.collectionId),
    index("collection_item_topic_slug_idx").on(t.topicSlug),
    index("collection_item_concept_slug_idx").on(t.conceptSlug),
    index("collection_item_asset_id_idx").on(t.assetId),
    // Nulls stay distinct here on purpose: a row targeting a concept has a NULL
    // topic_slug and must not collide with every other concept row.
    uniqueIndex("collection_item_topic_key").on(t.collectionId, t.topicSlug),
    uniqueIndex("collection_item_concept_key").on(t.collectionId, t.conceptSlug),
    uniqueIndex("collection_item_asset_key").on(t.collectionId, t.assetId),
  ],
);

/**
 * `assetId` was produced from `sourceAssetId`: a transcript from a video, an
 * SVG from a .tldr. This is what lets bundle 6 spot a derived file that
 * outlived its source, the drift that already happened once in manimkc.
 */
export const assetDerivation = pgTable(
  "asset_derivation",
  {
    assetId: text("asset_id")
      .notNull()
      .references(() => asset.id, { onDelete: "cascade", onUpdate: "cascade" }),
    sourceAssetId: text("source_asset_id")
      .notNull()
      .references(() => asset.id, { onDelete: "cascade", onUpdate: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.assetId, t.sourceAssetId] }),
    check("asset_derivation_no_self_check", sql`asset_id <> source_asset_id`),
    index("asset_derivation_source_asset_id_idx").on(t.sourceAssetId),
  ],
);

/** This checklist item covers this topic. How a course row reaches the assets. */
export const curriculumItemTopic = pgTable(
  "curriculum_item_topic",
  {
    curriculumItemId: text("curriculum_item_id")
      .notNull()
      .references(() => curriculumItem.id, { onDelete: "cascade", onUpdate: "cascade" }),
    topicSlug: text("topic_slug")
      .notNull()
      .references(() => topic.slug, { onDelete: "cascade", onUpdate: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.curriculumItemId, t.topicSlug] }),
    index("curriculum_item_topic_topic_slug_idx").on(t.topicSlug),
  ],
);

/**
 * This concept note contributes to this checklist item. The one cross-tree link
 * that already exists in the files: a note's `topics: [cp4284-m1-t1]`
 * frontmatter names curriculum item ids, not shared-vocabulary topic slugs.
 */
export const conceptCurriculumItem = pgTable(
  "concept_curriculum_item",
  {
    conceptSlug: text("concept_slug")
      .notNull()
      .references(() => concept.slug, { onDelete: "cascade", onUpdate: "cascade" }),
    curriculumItemId: text("curriculum_item_id")
      .notNull()
      .references(() => curriculumItem.id, { onDelete: "cascade", onUpdate: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.conceptSlug, t.curriculumItemId] }),
    index("concept_curriculum_item_curriculum_item_id_idx").on(t.curriculumItemId),
  ],
);
