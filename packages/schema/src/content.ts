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
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { archivedAt, createdAt, instant, ownerId, updatedAt } from "./columns";
// `content` and `state` reference each other: every content entity carries
// `owner_id` pointing at `learner`, and `mastery`, `progress` and the rest
// point back at `concept` and `curriculum_item`. Both directions are declared
// inside `() => ...` callbacks, which drizzle only calls once every module has
// finished evaluating, so neither side reads a binding still in its temporal
// dead zone. `studio.ts` and `state.ts` already live with the same cycle.
import { learner } from "./state";
import { session } from "./studio";

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
  // A still frame made from a video at upload time, stored as a blob and
  // derived from its video through `asset_derivation` (plan 0.2, Track E).
  "poster",
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/**
 * The kinds whose bytes live only in the blob store once phase 2's contract
 * migration (0013) is applied: an `asset` row of one of these must name its
 * blob (`asset_stored_blob_check`). A note, a session log and a `.tldr` are
 * rows the database renders; a link is a URL.
 */
export const BLOB_STORED_KINDS = ["video", "transcript", "chapters", "captions", "poster", "diagram_svg"] as const satisfies readonly AssetKind[];

/**
 * A blob key as `@self-learn/blob`'s `key()` makes it (`packages/blob/src/key.ts`):
 * a lowercase owner of 1 to 64 characters, a lowercase hex sha256, and a
 * required extension of 1 to 16 lowercase letters and digits. The database's
 * `blob_object_key_check` holds a key to it from 0013 on.
 */
export const BLOB_KEY_PATTERN = "^[a-z0-9][a-z0-9_-]{0,63}/[0-9a-f]{64}[.][a-z0-9]{1,16}$";

/** Which repository an asset's bytes live in. */
export const SOURCE_REPOS = ["self-learn", "manimkc", "tldrawkc"] as const;
export type SourceRepo = (typeof SOURCE_REPOS)[number];

/** A `collection` is any ordered container. Courses and modules today, decks next. */
export const COLLECTION_KINDS = ["course", "module", "deck"] as const;
export type CollectionKind = (typeof COLLECTION_KINDS)[number];

/** How one concept depends on another. `requires` is hard, `assumes` is soft. */
export const PREREQUISITE_KINDS = ["requires", "assumes"] as const;
export type PrerequisiteKind = (typeof PREREQUISITE_KINDS)[number];

/**
 * What a curated link is, from the course file's `resources[].type`. Carried
 * on `asset.resource_type` since the phase 0 expand migration, because the
 * course reader requires it and an export that dropped it could not be read
 * back (docs/CONTENT-MIGRATION.md 0.2).
 */
export const RESOURCE_TYPES = ["paper", "docs", "video", "book", "other"] as const;
export type AssetResourceType = (typeof RESOURCE_TYPES)[number];

/**
 * How one topic relates to another. `broader`: `to` is the wider subject.
 * `related`: symmetric, stored once with the slugs in order. `precedes`: learn
 * `from` before `to`.
 */
export const TOPIC_RELATION_KINDS = ["broader", "related", "precedes"] as const;
export type TopicRelationKind = (typeof TOPIC_RELATION_KINDS)[number];

/** Where a blob's bytes live. `fs` is the laptop's store under `~/.self-learn/blobs`. */
export const BLOB_PROVIDERS = ["fs", "vercel-blob", "r2"] as const;
export type BlobProvider = (typeof BLOB_PROVIDERS)[number];

/** `pending` from the row write until the store confirms the upload, then `present`. */
export const BLOB_STATES = ["pending", "present"] as const;
export type BlobState = (typeof BLOB_STATES)[number];

const quoted = (values: readonly string[]) => values.map((v) => `'${v}'`).join(", ");

const inList = (column: string, values: readonly string[]) =>
  sql.raw(`${column} in (${quoted(values)})`);

/**
 * The id rule the content readers enforce at parse time
 * (`KEBAB_SLUG` in packages/content/src/read.ts), stated once more where it
 * cannot be skipped. Every existing slug and id already satisfies it.
 */
const kebab = (column: string) => sql.raw(`${column} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`);

const jsonArray = (column: string) => sql.raw(`jsonb_typeof(${column}) = 'array'`);

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
    /**
     * Where the topic sits in `content/topics.yaml`, which is authored in
     * domain groups and rendered in that order. Kept so an export writes the
     * file back the way a person wrote it. Sparse (D22 of
     * docs/CONTENT-MIGRATION.md): steps of 1000, and a topic keeps its number
     * while its place is unchanged, so adding one topic is one revision.
     */
    position: integer("position").notNull().default(0),
    ownerId: ownerId(() => learner.id),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("topic_slug_check", kebab("slug")),
    check("topic_aliases_array_check", jsonArray("aliases")),
    index("topic_domain_idx").on(t.domain),
    index("topic_owner_id_idx").on(t.ownerId),
    // Near-duplicate detection for `catalog topic add` (D14): trigram
    // similarity over the title, and over the aliases as one string. The
    // aliases index is on the jsonb's text form rather than on each element,
    // because an index expression cannot unnest an array; `word_similarity`
    // against that string is the query it serves.
    index("topic_title_trgm_idx").using("gin", sql`"title" gin_trgm_ops`),
    index("topic_aliases_trgm_idx").using("gin", sql`("aliases"::text) gin_trgm_ops`),
  ],
);

/**
 * One authored note under `learn/concepts/<domain>/`. A concept is the only
 * thing that carries mastery and prerequisites; it is optional enrichment
 * *under* a topic, and every concept is filed under exactly one.
 */
export const concept = pgTable(
  "concept",
  {
    slug: text("slug").primaryKey(),
    title: text("title").notNull(),
    summary: text("summary"),
    /**
     * `NOT NULL` since Track C's contract migration (`0012`): every concept is
     * filed under a topic, which the indexer has refused to leave undone since
     * bundle 4. `RESTRICT` rather than the `SET NULL` it replaced, which could
     * only produce the null the column no longer allows: a topic that still
     * has concepts cannot be deleted, it is archived or renamed.
     */
    topicSlug: text("topic_slug")
      .notNull()
      .references(() => topic.slug, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    /** Repo-relative path of the note, e.g. `learn/concepts/algorithms/master-theorem.md`. */
    path: text("path").notNull(),
    /**
     * The note itself, from the phase 0 expand migration on: the folder it was
     * filed under, the markdown after the frontmatter, the frontmatter's
     * `tags`, `sources` and `created`. Nullable and unfilled until Track C
     * moves the notes in; the file stays the truth until that type flips.
     */
    domain: text("domain"),
    body: text("body"),
    tags: jsonb("tags").notNull().default(sql`'[]'::jsonb`),
    sources: jsonb("sources").notNull().default(sql`'[]'::jsonb`),
    authoredAt: instant("authored_at"),
    /**
     * Where the concept sits in its topic's `maps.concepts` list, as a
     * sparse position (D22 of docs/CONTENT-MIGRATION.md): ordered, not
     * counted, so adding a concept to the list moves no other concept.
     * The list is authored in teaching order and the course path breaks ties
     * by it (`apps/web/src/lib/course-path.ts`), so an export that sorted it
     * would change what a page shows. Added in 0011 with 0.5's export.
     */
    topicPosition: integer("topic_position").notNull().default(0),
    ownerId: ownerId(() => learner.id),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("concept_slug_check", kebab("slug")),
    check("concept_tags_array_check", jsonArray("tags")),
    check("concept_sources_array_check", jsonArray("sources")),
    uniqueIndex("concept_path_key").on(t.path),
    index("concept_topic_slug_idx").on(t.topicSlug),
    index("concept_owner_id_idx").on(t.ownerId),
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
    ownerId: ownerId(() => learner.id),
    /**
     * Set instead of deleting when a course file stops listing the module
     * (D12): the items under it may carry a learner's tick and recap, and
     * `curriculum_item.collection_id` is RESTRICT, so a delete would fail.
     */
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("collection_id_check", kebab("id")),
    check("collection_kind_check", inList("kind", COLLECTION_KINDS)),
    check("collection_not_own_parent_check", sql`parent_id is distinct from id`),
    index("collection_parent_id_idx").on(t.parentId),
    index("collection_owner_id_idx").on(t.ownerId),
    // Two live collections under one parent cannot share a slug, which is the
    // URL segment. `coalesce` so two top-level courses (parent_id NULL) collide
    // too; partial so an archived module does not hold its slug against the
    // module that replaced it. A unique *constraint* could do neither: it
    // cannot take a WHERE, and it treats every NULL parent as distinct unless
    // declared NULLS NOT DISTINCT, which an expression index has no need for.
    uniqueIndex("collection_parent_slug_key")
      .on(sql`coalesce("parent_id", '')`, t.slug)
      .where(sql`archived_at is null`),
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
      // Restrict, not cascade (D12): a course edit that drops a module must
      // archive its items, never take them and the learner rows under them
      // away in one statement nobody saw.
      .references(() => collection.id, { onDelete: "restrict", onUpdate: "cascade" }),
    /**
     * Order within the module, as a sparse position (D22 of
     * docs/CONTENT-MIGRATION.md): an item added at the top is one revision,
     * not one per item below it.
     */
    position: integer("position").notNull().default(0),
    title: text("title").notNull(),
    /** The bullet list under the item. Display-only, never joined on. */
    subtopics: jsonb("subtopics").notNull().default(sql`'[]'::jsonb`),
    ownerId: ownerId(() => learner.id),
    /**
     * Set instead of deleting when the course file stops listing the item.
     * `progress` and `recap` are RESTRICT on this table, so the learner's tick
     * and recap survive and the Settings export still carries them.
     */
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("curriculum_item_id_check", kebab("id")),
    index("curriculum_item_collection_id_idx").on(t.collectionId),
    index("curriculum_item_owner_id_idx").on(t.ownerId),
  ],
);

/**
 * One stored object in the blob store (D5): videos, their posters and
 * sidecars, diagram SVGs. The bytes are never in Postgres (D7); this row says
 * where they are, how big, and whether the upload has been confirmed.
 *
 * The key is `<owner_id>/<sha256>.<ext>`. Content-addressed, so an upload is
 * idempotent and resumable and an old revision's SVG stays resolvable; prefixed
 * by owner, so phase 4 can list, count, cap and delete a tenant's objects by
 * prefix. The CHECK holds the key to that shape, so a row can never name bytes
 * other than the ones its hash describes.
 */
export const blobObject = pgTable(
  "blob_object",
  {
    key: text("key").primaryKey(),
    ownerId: ownerId(() => learner.id),
    /** Lowercase hex sha256 of the bytes. Checked against the store after upload. */
    sha256: text("sha256").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    mime: text("mime").notNull(),
    provider: text("provider").notNull(),
    state: text("state").notNull().default("pending"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** When a `head` against the store last confirmed the object. */
    confirmedAt: instant("confirmed_at"),
  },
  (t) => [
    check("blob_object_sha256_check", sql`sha256 ~ '^[0-9a-f]{64}$'`),
    check(
      "blob_object_key_check",
      sql.raw(`key ~ '${BLOB_KEY_PATTERN}' and starts_with(key, owner_id || '/' || sha256)`),
    ),
    check("blob_object_bytes_check", sql`bytes >= 0`),
    check("blob_object_provider_check", inList("provider", BLOB_PROVIDERS)),
    check("blob_object_state_check", inList("state", BLOB_STATES)),
    // A present object was confirmed at some moment. The converse is not
    // asserted: a row found missing on audit goes back to pending and keeps
    // the instant it was last seen, which is worth knowing.
    check("blob_object_confirmed_check", sql`state <> 'present' or confirmed_at is not null`),
    index("blob_object_owner_id_idx").on(t.ownerId),
  ],
);

/**
 * A file or a link. One row per artefact, wherever its bytes live.
 * Exactly one of `url` (something on the web) or a location is set, so "where
 * is it" always has one answer. A location is `path` (a file in one of the
 * three repos, and from the content migration on a logical name that survives
 * the files, D11), `blob_key` (the object store), or both while the two agree.
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
    /** The stored bytes, once uploaded. Restrict: an object an asset serves is not deletable. */
    blobKey: text("blob_key").references(() => blobObject.key, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    /** What a curated `link` is: one of `RESOURCE_TYPES`. Null for every other kind. */
    resourceType: text("resource_type"),
    ownerId: ownerId(() => learner.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("asset_kind_check", inList("kind", ASSET_KINDS)),
    check("asset_source_repo_check", inList("source_repo", SOURCE_REPOS)),
    check(
      "asset_location_check",
      sql`(url is null) = (path is not null or blob_key is not null)`,
    ),
    // The location check, narrowed for the stored kinds (0013): their bytes
    // are in the blob store and nowhere else the app reads, so a path alone is
    // no location. Applied only once `catalog asset upload` has run; the
    // migration raises with the ids first otherwise.
    check("asset_stored_blob_check", sql.raw(`kind not in (${quoted(BLOB_STORED_KINDS)}) or blob_key is not null`)),
    check("asset_bytes_check", sql`bytes is null or bytes >= 0`),
    check(
      "asset_resource_type_check",
      // Only a curated link has a resource type; every other kind is its own answer.
      sql.raw(`resource_type is null or (kind = 'link' and resource_type in (${quoted(RESOURCE_TYPES)}))`),
    ),
    uniqueIndex("asset_repo_path_key").on(t.sourceRepo, t.path),
    index("asset_kind_idx").on(t.kind),
    index("asset_content_hash_idx").on(t.contentHash),
    index("asset_blob_key_idx").on(t.blobKey),
    index("asset_owner_id_idx").on(t.ownerId),
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
    /**
     * Order within the note's `requires:` or `assumes:` list, 1-based. The
     * frontmatter is authored in an order, and an export that sorted it would
     * rewrite every note it touched.
     */
    position: integer("position").notNull().default(0),
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
    /**
     * On a module's topic row, where the module sits in that topic's
     * `maps.courses` list, as a sparse position (D22); 0 on every other row. `position` is the
     * row's place inside its own collection, and this is its place in the
     * topic's list, a different list with a different author. Added in 0011
     * so 0.5's export writes `maps.courses` back in the order it was written.
     */
    topicPosition: integer("topic_position").notNull().default(0),
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
 * This concept note contributes to this checklist item, at this position. The
 * one cross-tree link, authored in the course file as `topics[].concepts` and
 * written by the courses source (docs/proposals/course-items-declare-concepts.md).
 * `position` is the list's order, 1-based: it orders links inside one item's
 * snapshot, so it stays dense (D22).
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
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.conceptSlug, t.curriculumItemId] }),
    index("concept_curriculum_item_curriculum_item_id_idx").on(t.curriculumItemId),
  ],
);

/* ------------------------------------------------------------------ *
 * Added by the phase 0 expand migration of docs/CONTENT-MIGRATION.md.
 * Every table a phase 1 track needs lands here at once (D10), so no track
 * generates a migration of its own and collides in drizzle's journal.
 * ------------------------------------------------------------------ */

/**
 * A cross-course theme, from `content/tags.yaml`. Before this table a course's
 * tags were strings inside `collection.metadata`, checked only at parse time;
 * `collection_tag` makes a stale tag a `23503`.
 */
export const tag = pgTable(
  "tag",
  {
    /** The permanent key a course file's `tags:` names. */
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    description: text("description"),
    /** The order the home page renders the chips in, which is the file's order. Sparse (D22). */
    position: integer("position").notNull().default(0),
    ownerId: ownerId(() => learner.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("tag_id_check", kebab("id")), index("tag_owner_id_idx").on(t.ownerId)],
);

/** This course carries this tag, at this position in its `tags:` list. Part of the collection's snapshot. */
export const collectionTag = pgTable(
  "collection_tag",
  {
    collectionId: text("collection_id")
      .notNull()
      .references(() => collection.id, { onDelete: "cascade", onUpdate: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      // Restrict: a tag a course still uses is not deletable, which is the
      // whole reason this is a table and not a string in jsonb.
      .references(() => tag.id, { onDelete: "restrict", onUpdate: "cascade" }),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.tagId] }),
    index("collection_tag_tag_id_idx").on(t.tagId),
  ],
);

/**
 * A typed edge between two topics, the one the owner asked for so a proposed
 * topic can say where it sits. Foreign keys at both ends, per the standing
 * rule against a generic edge table.
 *
 * `related` is symmetric and stored once, with `from_slug` the smaller slug
 * under the "C" collation. The collation is spelled out so the rule means the
 * same byte order on every database this is restored into; a writer compares
 * with plain JavaScript `<`, which is the same order for kebab-case ASCII.
 * Because the order is part of the row, renaming a slug with `ON UPDATE
 * CASCADE` can put a `related` edge the wrong way round and fail the check; a
 * rename deletes and re-inserts its `related` edges rather than relying on the
 * cascade.
 *
 * Owned by the `from` topic: a change here is a revision of that topic.
 */
export const topicRelation = pgTable(
  "topic_relation",
  {
    fromSlug: text("from_slug")
      .notNull()
      .references(() => topic.slug, { onDelete: "restrict", onUpdate: "cascade" }),
    toSlug: text("to_slug")
      .notNull()
      .references(() => topic.slug, { onDelete: "restrict", onUpdate: "cascade" }),
    kind: text("kind").notNull(),
    /**
     * Order within the owning topic's `relations:` list, 1-based. Added in
     * 0011 with the export that writes the list back.
     */
    position: integer("position").notNull().default(0),
    ownerId: ownerId(() => learner.id),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.fromSlug, t.toSlug, t.kind] }),
    check("topic_relation_kind_check", inList("kind", TOPIC_RELATION_KINDS)),
    check("topic_relation_no_self_check", sql`from_slug <> to_slug`),
    check(
      "topic_relation_related_order_check",
      sql`kind <> 'related' or from_slug collate "C" < to_slug collate "C"`,
    ),
    index("topic_relation_to_slug_idx").on(t.toSlug),
    index("topic_relation_owner_id_idx").on(t.ownerId),
  ],
);

/**
 * One manimkc topic path under one vocabulary topic: `maps.manimkc` as rows.
 * The primary key is the rule `vocabulary.claim()` enforces in code today, one
 * path and one topic. A table rather than a column on `asset`, because a path
 * can be mapped before its first render.
 *
 * Owned by its topic, so it cascades with it and a change is a revision of it.
 */
export const manimkcTopic = pgTable(
  "manimkc_topic",
  {
    /** `<domain>/<subdomain>/<topic>`, manimkc's own path with `topics/` dropped. */
    path: text("path").primaryKey(),
    topicSlug: text("topic_slug")
      .notNull()
      .references(() => topic.slug, { onDelete: "cascade", onUpdate: "cascade" }),
    /** Order within the topic's `maps.manimkc` list. */
    position: integer("position").notNull().default(0),
    ownerId: ownerId(() => learner.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("manimkc_topic_topic_slug_idx").on(t.topicSlug),
    index("manimkc_topic_owner_id_idx").on(t.ownerId),
  ],
);

/**
 * A teaching diagram: the `.tldr` document in jsonb, its SVG in the blob store
 * (D6). The two hashes replace the modification-time comparison behind the
 * studio's freshness pill: the SVG is stale exactly when `svg_document_hash`
 * differs from `document_hash`.
 *
 * `topic_slug` is NOT NULL from the start, the same rule `job.topic_slug`
 * follows and the diagrams indexer already refuses by name.
 */
export const diagram = pgTable(
  "diagram",
  {
    slug: text("slug").primaryKey(),
    ownerId: ownerId(() => learner.id),
    title: text("title"),
    topicSlug: text("topic_slug")
      .notNull()
      .references(() => topic.slug, { onDelete: "restrict", onUpdate: "cascade" }),
    /** The whole `.tldr`, parsed. */
    document: jsonb("document").notNull(),
    /** sha256 of the canonical document. */
    documentHash: text("document_hash").notNull(),
    svgBlobKey: text("svg_blob_key").references(() => blobObject.key, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    /** The `document_hash` the SVG was exported from. */
    svgDocumentHash: text("svg_document_hash"),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("diagram_slug_check", kebab("slug")),
    check("diagram_document_object_check", sql`jsonb_typeof(document) = 'object'`),
    // An SVG with no record of what it was exported from cannot be judged
    // fresh or stale, and a source hash with no SVG describes nothing.
    check(
      "diagram_svg_pair_check",
      sql`(svg_blob_key is null) = (svg_document_hash is null)`,
    ),
    index("diagram_owner_id_idx").on(t.ownerId),
    index("diagram_topic_slug_idx").on(t.topicSlug),
    index("diagram_svg_blob_key_idx").on(t.svgBlobKey),
  ],
);

/**
 * One appended piece of a session log (D20). Every log write is an append, so
 * the entries are their own history and carry no revisions; the export
 * concatenates them under the frontmatter the `session` row already holds.
 * Append-only by the same per-row trigger as `event`, created in the migration.
 * The owner is `session.learner_id`, so there is no `owner_id` here.
 */
export const sessionLogEntry = pgTable(
  "session_log_entry",
  {
    sessionId: text("session_id")
      .notNull()
      // Restrict for the reason `event.session_id` is: `set null` would fire
      // an UPDATE the append-only trigger refuses.
      .references(() => session.id, { onDelete: "restrict", onUpdate: "cascade" }),
    /** 1, 2, 3 per session, in the order the log was written. */
    seq: integer("seq").notNull(),
    markdown: text("markdown").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.seq] }),
    check("session_log_entry_seq_check", sql`seq >= 1`),
  ],
);
