/**
 * The learner state store, and the catalog's one door for everybody outside it.
 *
 * Two things live here, and the difference matters.
 *
 * **The store.** This is the only module that writes `learner`, `event`,
 * `mastery`, `review`, `progress`, `recap` or `preference`. Three callers use
 * it and none of them talks to a pool of its own: the `learn` CLI in
 * `../learn/`, the backfill in `../commands/backfill.ts`, and the web app
 * through `@self-learn/catalog/state`.
 *
 * **Reads of the content half.** `knowledge-base.ts` and `assets.ts` only read,
 * and what they read is `concept`, `asset` and the link tables, which this
 * package's indexers write and nothing here ever touches. They are here because
 * `./state` is the single export the web app may import (ARCHITECTURE.md
 * layering rule 1), so a query the app needs and this directory does not hold
 * is a query the app cannot run. Rule 4 names `state/` the only *writer* of the
 * state tables, which it still is; it does not say this is the only thing under
 * the door.
 *
 * Two rules hold everywhere below.
 *
 * **Evidence is an event first.** Anything the tutoring loop treats as
 * evidence — an observation, a review grade, a session opening or closing, a
 * retraction — appends to `event` and only then updates the derived tables, in
 * that order. `event` is append-only and enforced as such by a trigger, so a
 * derived row that disagrees with it is a bug to recompute rather than data to
 * recover.
 *
 * **Derived is rebuildable.** `mastery` and `review` can be thrown away and
 * replayed. `progress`, `recap` and `preference` cannot: they are the only copy
 * and nothing regenerates them.
 */

/**
 * The connection, re-exported: `@self-learn/catalog/state` is the web app's
 * only entry into this package, so making it import `../db` by a deep path
 * would either need a second export subpath or a relative reach into
 * `services/`. One door.
 */
export { connect, withDatabase, type CatalogDatabase, type Connection } from "../db";

/**
 * The database half of the content reader seam (docs/CONTENT-MIGRATION.md
 * 0.6). The plan names it `@self-learn/catalog/content`; it is exported here
 * instead because this is the web app's one door into the package (layering
 * rule 1), and a second subpath for one function would be a second door. Every
 * method refuses until its track fills it in.
 */
export { dbSource, NotMigratedError } from "../content/source";
/**
 * The `content_source` rows as `selectSource`'s `ownership()` callback reads
 * them (D18): the row decides where a reader reads a type from unless
 * `CONTENT_SOURCE` overrides it for that reader.
 */
export { contentOwnership } from "../content/ownership";
/**
 * The blob store's root, resolved the way the catalog CLI resolves it, so the
 * route that serves a blob and the command that uploaded it open one store.
 */
export { blobRoot } from "../env";
/**
 * Which blob serves an asset or a video's poster, for the asset routes, and the
 * poster recipe, shared with `catalog asset upload` so the web app's ffmpeg
 * fallback cuts the same picture the upload stored.
 */
export {
  assetBlobs,
  courseCoverBlob,
  courseCovers,
  posterBlob,
  videosWithStoredPoster,
  type AssetBlob,
  type CourseCoverBlob,
} from "./blobs";
// A diagram's `.tldr` bytes once the database owns diagrams: the canonical
// form every export and checkout writes, so the web app serves the same bytes.
export { documentBytes } from "../content/diagram-document";
export {
  ffmpegArgs,
  POSTER_CONTENT_TYPE,
  POSTER_EXTENSION,
  POSTER_OFFSETS_SECONDS,
  POSTER_QUALITY,
  POSTER_WIDTH,
} from "../poster/recipe";

export { StateError, SQLSTATE, constraintName, sqlstate } from "./errors";
export { bumpEpoch, ensureLearner, readAvatar, readDisplayName, withLearnerLock, writeAvatar, writeDisplayName } from "./learner";
export {
  endSession,
  ensureSession,
  readSession,
  recentTutorSessions,
  touchSession,
  type RecentSession,
  type SessionEndInput,
  type SessionInput,
} from "./sessions";
export {
  appendEvent,
  readEvents,
  toRecord,
  toRow,
  voidedSessions,
  type EventInput,
  type EventRecord,
} from "./events";
export {
  assertKnownConcepts,
  assertReadableConcepts,
  emptyModel,
  ensureEntry,
  propagateCorrect,
  readModel,
  readParams,
  replayMastery,
  writeModel,
  writeParams,
  type BktParams,
  type MasteryEntry,
  type Model,
} from "./mastery";
export {
  closeTutorSession,
  openTutorSession,
  recordObservation,
  type CloseSessionResult,
  type ObserveInput,
  type ObserveResult,
  type OpenSessionInput,
  type Propagation,
} from "./observe";
export {
  conceptSummaries,
  dueReviews,
  emptyReviews,
  gradeForRating,
  gradeReview,
  previewIntervals,
  ratingForGrade,
  readCards,
  readReviews,
  REVIEW_RATINGS,
  reviewQueue,
  scheduleCard,
  upsertReview,
  writeReviews,
  type ConceptSummary,
  type GradeReviewInput,
  type GradeReviewResult,
  type ReviewCard,
  type ReviewQueue,
  type ReviewQueueItem,
  type ReviewRating,
  type Reviews,
} from "./review";
export {
  assertKnownItems,
  countCompleted,
  readProgress,
  resetCourse,
  resetProgress,
  setNote,
  setProgress,
  type ProgressRow,
} from "./progress";
export { recentDrafts, type RecentDraft } from "./drafts";
export { clearRecap, isEmptyRecap, readRecaps, upsertRecap } from "./recap";
export {
  importLegacyState,
  type ImportResult,
  type LegacyPayload,
} from "./import";
export {
  clearPreference,
  readPreference,
  readPreferences,
  readPreferencesWithPrefix,
  writePreference,
} from "./preference";
export {
  deleteProviderKey,
  readProviderKeys,
  writeProviderKey,
  type SealedProviderKey,
  type StoredProviderKey,
} from "./provider-keys";
export {
  addTutorModel,
  deleteTutorProvider,
  moveTutorModel,
  moveTutorProvider,
  readTutorModels,
  removeTutorModel,
  TutorModelError,
  tutorModelEntry,
  type StoredTutorModel,
  type TutorModelEntry,
  type TutorModelErrorCode,
} from "./tutor-models";
export {
  asLastVisited,
  asRecentModules,
  asUserResources,
  RECENT_MODULES_MAX,
  readLearnerSnapshot,
  withRecentModule,
} from "./snapshot";
export {
  assetCounts,
  assetDerivations,
  assetsByIds,
  assetsForCollection,
  assetsForConcept,
  assetsForConcepts,
  assetsForTopic,
  byKind,
  conceptsForAsset,
  conceptsForAssets,
  derivationSources,
  listAssets,
  type AssetDerivations,
  type AssetKindCount,
  type AssetRef,
  type AssetWithTopics,
  type ListAssetsOptions,
} from "./assets";
export { assetParents, type AssetOrigin, type AssetParents, type AssetPlace } from "./asset-parents";
export { readAssetNaming, writeAssetName, type AssetNaming } from "./asset-names";
export {
  domainOf,
  dueConcepts,
  readConceptGraph,
  readKnowledgeBase,
  EMPTY_KNOWLEDGE_BASE,
  type KbConcept,
  type KbEdge,
  type KnowledgeBase,
  type MasteryLabel,
} from "./knowledge-base";
export { conceptCheckCounts } from "./checks";
export { topicTitles, type TopicTitles } from "./topics";
export { notePaths, type NotePaths } from "./notes";
