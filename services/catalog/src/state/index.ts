/**
 * The learner state store: typed functions over the state tables.
 *
 * This is the only module that writes `learner`, `event`, `mastery`, `review`,
 * `progress`, `recap` or `preference`. Three callers use it and none of them
 * talks to a pool of its own: the `learn` CLI in `../learn/`, the backfill in
 * `../commands/backfill.ts`, and the web app through
 * `@self-learn/catalog/state`.
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

export { StateError, SQLSTATE, constraintName, sqlstate } from "./errors";
export { bumpEpoch, ensureLearner, withLearnerLock } from "./learner";
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
  dueReviews,
  emptyReviews,
  readCards,
  readReviews,
  upsertReview,
  writeReviews,
  type ReviewCard,
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
  writePreference,
} from "./preference";
export {
  asLastVisited,
  asUserResources,
  readLearnerSnapshot,
} from "./snapshot";
export {
  domainOf,
  dueConcepts,
  readKnowledgeBase,
  EMPTY_KNOWLEDGE_BASE,
  type KbConcept,
  type KbEdge,
  type KnowledgeBase,
  type MasteryLabel,
} from "./knowledge-base";
