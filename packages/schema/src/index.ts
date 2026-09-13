/**
 * The catalog schema: the single source of the table shapes.
 *
 * Nothing here connects to a database. `services/catalog` owns the connection,
 * the migrations and the CLI; this package is imported by anything that needs
 * to know what a row looks like, including (from bundle 4) the web app.
 */

export * from "./columns";
export * from "./shared";
export * from "./content";
export * from "./operations";
export * from "./state";

import {
  asset,
  assetConcept,
  assetDerivation,
  assetTopic,
  collection,
  collectionItem,
  concept,
  conceptCurriculumItem,
  conceptPrerequisite,
  curriculumItem,
  curriculumItemTopic,
  topic,
} from "./content";
import { indexRun, mirror } from "./operations";
import {
  event,
  learner,
  mastery,
  preference,
  progress,
  recap,
  review,
} from "./state";

/**
 * Every table, in dependency order: a parent always precedes anything that
 * references it. `catalog status` walks this to count rows, and a future
 * truncate would walk it backwards.
 */
export const tables = {
  topic,
  concept,
  collection,
  curriculumItem,
  asset,
  assetTopic,
  assetConcept,
  conceptPrerequisite,
  collectionItem,
  assetDerivation,
  curriculumItemTopic,
  conceptCurriculumItem,
  learner,
  event,
  mastery,
  review,
  progress,
  recap,
  preference,
  indexRun,
  mirror,
} as const;

export type TableName = keyof typeof tables;

/** Which half of the catalog a table belongs to. Content is derived; state is not. */
export const CONTENT_TABLES = [
  "topic",
  "concept",
  "collection",
  "curriculumItem",
  "asset",
  "assetTopic",
  "assetConcept",
  "conceptPrerequisite",
  "collectionItem",
  "assetDerivation",
  "curriculumItemTopic",
  "conceptCurriculumItem",
] as const satisfies readonly TableName[];

/**
 * Neither derived from files nor the only copy of anything a learner did: what
 * the indexers recorded, about their own runs and about the mirrors they
 * audited. Counted apart so a status line cannot read it as either.
 */
export const OPERATIONAL_TABLES = ["indexRun", "mirror"] as const satisfies readonly TableName[];

export const STATE_TABLES = [
  "learner",
  "event",
  "mastery",
  "review",
  "progress",
  "recap",
  "preference",
] as const satisfies readonly TableName[];

/* Row and insert types, inferred from the tables above. These are the shapes
 * every consumer should use; hand-written interfaces would drift. */

export type Topic = typeof topic.$inferSelect;
export type NewTopic = typeof topic.$inferInsert;
export type Concept = typeof concept.$inferSelect;
export type NewConcept = typeof concept.$inferInsert;
export type Collection = typeof collection.$inferSelect;
export type NewCollection = typeof collection.$inferInsert;
export type CurriculumItem = typeof curriculumItem.$inferSelect;
export type NewCurriculumItem = typeof curriculumItem.$inferInsert;
export type Asset = typeof asset.$inferSelect;
export type NewAsset = typeof asset.$inferInsert;
export type AssetTopic = typeof assetTopic.$inferSelect;
export type NewAssetTopic = typeof assetTopic.$inferInsert;
export type AssetConcept = typeof assetConcept.$inferSelect;
export type NewAssetConcept = typeof assetConcept.$inferInsert;
export type ConceptPrerequisite = typeof conceptPrerequisite.$inferSelect;
export type NewConceptPrerequisite = typeof conceptPrerequisite.$inferInsert;
export type CollectionItem = typeof collectionItem.$inferSelect;
export type NewCollectionItem = typeof collectionItem.$inferInsert;
export type AssetDerivation = typeof assetDerivation.$inferSelect;
export type NewAssetDerivation = typeof assetDerivation.$inferInsert;
export type CurriculumItemTopic = typeof curriculumItemTopic.$inferSelect;
export type NewCurriculumItemTopic = typeof curriculumItemTopic.$inferInsert;
export type ConceptCurriculumItem = typeof conceptCurriculumItem.$inferSelect;
export type NewConceptCurriculumItem = typeof conceptCurriculumItem.$inferInsert;

export type Learner = typeof learner.$inferSelect;
export type NewLearner = typeof learner.$inferInsert;
export type LearnEvent = typeof event.$inferSelect;
export type NewLearnEvent = typeof event.$inferInsert;
export type Mastery = typeof mastery.$inferSelect;
export type NewMastery = typeof mastery.$inferInsert;
export type Review = typeof review.$inferSelect;
export type NewReview = typeof review.$inferInsert;
export type Progress = typeof progress.$inferSelect;
export type NewProgress = typeof progress.$inferInsert;
export type Recap = typeof recap.$inferSelect;
export type NewRecap = typeof recap.$inferInsert;
export type Preference = typeof preference.$inferSelect;
export type NewPreference = typeof preference.$inferInsert;

export type IndexRun = typeof indexRun.$inferSelect;
export type NewIndexRun = typeof indexRun.$inferInsert;
export type Mirror = typeof mirror.$inferSelect;
export type NewMirror = typeof mirror.$inferInsert;
